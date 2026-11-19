"""PostHog error tracking and logs (config/observability.py).

Nothing here reaches PostHog: clients are built with send=False and collect
what they would have sent through before_send, and the log handler posts to a
recording session.
"""

import logging
import uuid

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from posthog import Posthog, contexts

import config.observability as observability
from app.models.user import User
from app.utils.dependencies import get_current_user, subject_claims
from app.utils.security import create_access_token
from app.utils.tenant import TENANT_HEADER
from config.redaction import redact_personal_data
from config.settings import Settings

# A UUID whose last group is all digits: one in a few hundred session ids.
DIGIT_ENDED_SESSION = "0199c5a1-7f3e-7a2b-9c4d-123456789012"


class RecordingSession:
    """Stands in for requests.Session; answers every POST with `status`."""

    def __init__(self, status=200):
        self.status = status
        self.posts = []

    def post(self, url, params=None, json=None, timeout=None):
        self.posts.append({"url": url, "params": params, "json": json})
        return type(
            "Response", (), {"ok": 200 <= self.status < 300, "status_code": self.status}
        )()


@pytest.fixture
def events():
    return []


@pytest.fixture
def posthog_client(events):
    def collect(event):
        event = observability.redact_event(event)
        events.append(event)
        return event

    client = Posthog(
        "phc_test", host="http://127.0.0.1:9", send=False, before_send=collect
    )
    yield client
    client.shutdown()


@pytest.fixture
def log_handler():
    session = RecordingSession()
    handler = observability.PostHogLogHandler(
        "https://eu.i.posthog.com/",
        "phc_test",
        {"service.name": "walle-backend", "deployment.environment": "test"},
        session=session,
        flush_interval=3600,
    )
    handler.session = session
    yield handler
    handler.close()


def _attributes(record):
    return {a["key"]: next(iter(a["value"].values())) for a in record["attributes"]}


def _records(session):
    return [
        record
        for post in session.posts
        for resource in post["json"]["resourceLogs"]
        for scope in resource["scopeLogs"]
        for record in scope["logRecords"]
    ]


@pytest.mark.parametrize(
    "text, redacted",
    [
        (
            'duplicate key { email: "A.b+c@mail.example.co.in" }',
            'duplicate key { email: "[email]" }',
        ),
        ("SMS to 9876543210 failed", "SMS to [mobile] failed"),
        ("SMS to +919876543210", "SMS to [mobile]"),
        ("/api/users/by-mobile/447700900123", "/api/users/by-mobile/[mobile]"),
        # Ids and short numbers stay: an ObjectId, a CricHeroes id, a UUID.
        ("user 6650f1c2a9b8e7d6c5b4a391", "user 6650f1c2a9b8e7d6c5b4a391"),
        ("tournament 2242502, match 12345678", "tournament 2242502, match 12345678"),
        (
            "session 0199c5a1-7f3e-7a2b-9c4d-0a1b2c3d4e5f",
            "session 0199c5a1-7f3e-7a2b-9c4d-0a1b2c3d4e5f",
        ),
    ],
)
def test_redact_personal_data(text, redacted):
    assert redact_personal_data(text) == redacted


def test_log_record_carries_the_request_context(log_handler):
    logger = logging.getLogger("tests.observability.context")
    logger.addHandler(log_handler)
    try:
        with contexts.new_context(capture_exceptions=False):
            contexts.identify_context("6650f1c2a9b8e7d6c5b4a391")
            contexts.set_context_session(DIGIT_ENDED_SESSION)
            contexts.tag("$request_method", "POST")
            contexts.tag("$request_path", "/api/users/me/mobile/9876543210")
            contexts.tag("tournament", "rspl")
            contexts.tag("$ip", "203.0.113.9")
            logger.warning(
                "code sent to %s", "someone@example.com", extra={"contest": 7}
            )
        log_handler.flush()
    finally:
        logger.removeHandler(log_handler)

    [post] = log_handler.session.posts
    # The endpoint and token posthog-js uses.
    assert post["url"] == "https://eu.i.posthog.com/i/v1/logs"
    assert post["params"] == {"token": "phc_test"}
    resource = post["json"]["resourceLogs"][0]["resource"]
    assert {
        "key": "service.name",
        "value": {"stringValue": "walle-backend"},
    } in resource["attributes"]

    [record] = _records(log_handler.session)
    assert record["severityText"] == "WARN"
    assert record["severityNumber"] == 13
    assert record["body"] == {"stringValue": "code sent to [email]"}
    attributes = _attributes(record)
    assert attributes["posthogDistinctId"] == "6650f1c2a9b8e7d6c5b4a391"
    # Linking the log to the replay depends on this surviving redaction.
    assert attributes["sessionId"] == DIGIT_ENDED_SESSION
    assert attributes["http.request.method"] == "POST"
    assert attributes["url.path"] == "/api/users/me/mobile/[mobile]"
    assert attributes["tournament"] == "rspl"
    assert attributes["contest"] == "7"
    assert attributes["logger.name"] == "tests.observability.context"
    assert "$ip" not in attributes and "203.0.113.9" not in str(record)


def test_logged_exception_is_redacted(log_handler):
    logger = logging.getLogger("tests.observability.exception")
    logger.addHandler(log_handler)
    try:
        try:
            raise ValueError('E11000 dup key: { mobile: "9876543210" }')
        except ValueError:
            logger.exception("signup failed")
        log_handler.flush()
    finally:
        logger.removeHandler(log_handler)

    [record] = _records(log_handler.session)
    attributes = _attributes(record)
    assert record["severityText"] == "ERROR"
    assert attributes["exception.type"] == "ValueError"
    assert attributes["exception.message"] == 'E11000 dup key: { mobile: "[mobile]" }'
    assert "9876543210" not in attributes["exception.stacktrace"]
    assert "posthogDistinctId" not in attributes


def test_a_refused_batch_is_dropped_and_said_so(log_handler, capsys):
    log_handler.session.status = 401
    logger = logging.getLogger("tests.observability.refused")
    logger.addHandler(log_handler)
    try:
        logger.warning("one")
        log_handler.flush()
        log_handler.flush()
    finally:
        logger.removeHandler(log_handler)

    assert len(log_handler.session.posts) == 1
    assert "dropped 1 log record(s): PostHog answered 401" in capsys.readouterr().err


def test_records_below_the_handler_level_are_not_sent(log_handler):
    log_handler.setLevel(logging.INFO)
    logger = logging.getLogger("tests.observability.level")
    logger.setLevel(logging.DEBUG)
    logger.addHandler(log_handler)
    try:
        logger.debug("noise")
        logger.info("signal")
        log_handler.flush()
    finally:
        logger.removeHandler(log_handler)

    assert [r["body"]["stringValue"] for r in _records(log_handler.session)] == [
        "signal"
    ]


def test_logged_exceptions_go_to_error_tracking(posthog_client, events):
    handler = observability.PostHogExceptionHandler(posthog_client)
    logger = logging.getLogger("tests.observability.tracking")
    logger.addHandler(handler)
    sdk_logger = logging.getLogger("posthog")
    sdk_logger.addHandler(handler)
    try:
        with contexts.new_context(capture_exceptions=False):
            contexts.identify_context("6650f1c2a9b8e7d6c5b4a391")
            contexts.set_context_session(DIGIT_ENDED_SESSION)
            try:
                raise RuntimeError("no account for someone@example.com")
            except RuntimeError:
                logger.exception("Could not send the code to %s", "9876543210")
                # Logged and re-raised: still one event.
                logger.exception("again")
        # An error without an exception is a log line, not an issue.
        logger.error("2Factor config missing")
        # Nor does the SDK's own failure become an event to send.
        try:
            raise ConnectionError("posthog unreachable")
        except ConnectionError:
            sdk_logger.exception("error uploading")
    finally:
        logger.removeHandler(handler)
        sdk_logger.removeHandler(handler)

    [event] = events
    assert event["event"] == "$exception"
    assert event["distinct_id"] == "6650f1c2a9b8e7d6c5b4a391"
    properties = event["properties"]
    assert properties["$session_id"] == DIGIT_ENDED_SESSION
    assert properties["$exception_list"][0]["type"] == "RuntimeError"
    assert properties["$exception_list"][0]["value"] == "no account for [email]"
    assert properties["log_message"] == "Could not send the code to [mobile]"
    assert properties["logger"] == "tests.observability.tracking"


async def test_request_errors_are_captured_with_user_session_and_tournament(
    db, posthog_client, events, monkeypatch
):
    """The path a real error takes: the browser's headers, the token's user."""
    user = User(
        username="player",
        email="player@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
    )
    await user.insert()
    token = create_access_token(data=subject_claims(user))

    app = FastAPI()

    @app.get("/api/teams/{team_id}")
    async def broken(team_id: str, current_user: User = Depends(get_current_user)):
        raise KeyError(f"no team {team_id} for {current_user.email}")

    @app.get("/api/public")
    async def public():
        raise RuntimeError("public route failed")

    monkeypatch.setattr(observability, "_client", posthog_client)
    observability.instrument_app(app, TENANT_HEADER)

    browser_session = str(uuid.uuid4())
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        signed_in = await http.get(
            "/api/teams/42",
            headers={
                "Authorization": f"Bearer {token}",
                "X-POSTHOG-DISTINCT-ID": "anonymous-browser-id",
                "X-POSTHOG-SESSION-ID": browser_session,
                TENANT_HEADER: "RSPL",
            },
        )
        anonymous = await http.get(
            "/api/public",
            headers={
                "X-POSTHOG-DISTINCT-ID": "anonymous-browser-id",
                "X-POSTHOG-SESSION-ID": browser_session,
            },
        )
    assert signed_in.status_code == anonymous.status_code == 500

    first, second = events
    # The verified user, not the id the header claimed.
    assert first["distinct_id"] == str(user.id)
    assert first["properties"]["$session_id"] == browser_session
    assert first["properties"]["tournament"] == "rspl"
    assert first["properties"]["$request_path"] == "/api/teams/42"
    assert (
        first["properties"]["$exception_list"][0]["value"] == "'no team 42 for [email]'"
    )
    # Signed out, the browser's own id still ties it to the session.
    assert second["distinct_id"] == "anonymous-browser-id"
    assert second["properties"]["$session_id"] == browser_session
    assert "tournament" not in second["properties"]


async def test_http_errors_are_not_exceptions(db, posthog_client, events, monkeypatch):
    app = FastAPI()

    @app.get("/api/private")
    async def private(current_user: User = Depends(get_current_user)):
        return {}

    monkeypatch.setattr(observability, "_client", posthog_client)
    observability.instrument_app(app, TENANT_HEADER)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        assert (await http.get("/api/private")).status_code == 401

    assert events == []


def test_instrument_app_is_a_no_op_without_posthog(monkeypatch):
    app = FastAPI()
    monkeypatch.setattr(observability, "_client", None)
    observability.instrument_app(app, TENANT_HEADER)
    assert app.user_middleware == []


def test_setup_without_a_key_sends_nothing(monkeypatch):
    monkeypatch.setattr(observability, "_configured", False)
    monkeypatch.setattr(observability, "_client", None)
    monkeypatch.setattr(observability, "_log_handler", None)
    monkeypatch.setattr(observability.settings, "posthog_api_key", "")
    root = logging.getLogger()
    level = root.level
    try:
        assert observability.setup_observability("backend") is None

        assert not any(
            isinstance(
                h,
                (
                    observability.PostHogLogHandler,
                    observability.PostHogExceptionHandler,
                ),
            )
            for h in root.handlers
        )
        # The console still logs at LOG_LEVEL.
        assert root.level == logging.INFO
    finally:
        root.setLevel(level)


def test_setup_with_a_key(monkeypatch):
    monkeypatch.setattr(observability, "_configured", False)
    monkeypatch.setattr(observability, "_client", None)
    monkeypatch.setattr(observability, "_log_handler", None)
    monkeypatch.setattr(observability.settings, "posthog_api_key", "phc_test")
    monkeypatch.setattr(observability.settings, "log_level", "WARNING")
    root = logging.getLogger()
    level = root.level
    before = list(root.handlers)
    try:
        client = observability.setup_observability("cricheroes-sync")
        assert isinstance(client, Posthog)
        # Only the first call does anything.
        assert observability.setup_observability("backend") is client
        added = [h for h in root.handlers if h not in before]
        assert {type(h) for h in added} >= {
            observability.PostHogLogHandler,
            observability.PostHogExceptionHandler,
        }
        assert root.level == logging.WARNING
        assert observability._log_handler.level == logging.WARNING
        assert observability._log_handler._scope == {"name": "walle-cricheroes-sync"}
    finally:
        for handler in [h for h in root.handlers if h not in before]:
            root.removeHandler(handler)
            handler.close()
        root.setLevel(level)
        if observability._client is not None:
            observability._client.disabled = True
            observability._client.shutdown()


def test_uvicorn_logs_join_once_uvicorn_has_configured_its_own(
    log_handler, monkeypatch
):
    monkeypatch.setattr(observability, "_log_handler", log_handler)
    uvicorn_logger = logging.getLogger("uvicorn")
    access_logger = logging.getLogger("uvicorn.access")
    monkeypatch.setattr(uvicorn_logger, "propagate", False)
    monkeypatch.setattr(access_logger, "propagate", False)
    try:
        monkeypatch.setattr(observability.settings, "posthog_access_logs", False)
        observability.ship_uvicorn_logs()
        observability.ship_uvicorn_logs()
        assert uvicorn_logger.handlers.count(log_handler) == 1
        assert log_handler not in access_logger.handlers

        monkeypatch.setattr(observability.settings, "posthog_access_logs", True)
        observability.ship_uvicorn_logs()
        assert log_handler in access_logger.handlers
    finally:
        for logger in (uvicorn_logger, access_logger):
            if log_handler in logger.handlers:
                logger.removeHandler(log_handler)


def test_redact_event_leaves_ids_alone():
    event = {
        "properties": {
            "$session_id": DIGIT_ENDED_SESSION,
            "$current_url": "https://api.example.com/api/users/9876543210",
            "$exception_values": ["bad mail a@b.co"],
            "$exception_list": [{"type": "X", "value": "for 9876543210"}],
        }
    }
    properties = observability.redact_event(event)["properties"]
    assert properties["$session_id"] == DIGIT_ENDED_SESSION
    assert properties["$current_url"] == "https://api.example.com/api/users/[mobile]"
    assert properties["$exception_values"] == ["bad mail [email]"]
    assert properties["$exception_list"][0]["value"] == "for [mobile]"


@pytest.mark.parametrize("value, level", [("info", "INFO"), (" Warning ", "WARNING")])
def test_log_level_setting(monkeypatch, value, level):
    monkeypatch.setenv("LOG_LEVEL", value)
    assert Settings(_env_file=None).log_level == level


def test_log_level_must_be_a_level(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "VERBOSE")
    with pytest.raises(ValueError, match="LOG_LEVEL"):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "value, host",
    [
        ("", "https://us.i.posthog.com"),
        ("https://eu.i.posthog.com/", "https://eu.i.posthog.com"),
    ],
)
def test_posthog_host_setting(monkeypatch, value, host):
    monkeypatch.setenv("POSTHOG_HOST", value)
    assert Settings(_env_file=None).posthog_host == host
