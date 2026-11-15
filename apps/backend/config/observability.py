"""Error tracking and logs in PostHog, for the API and the scheduled scripts.

docs/POSTHOG_OBSERVABILITY.md covers setup and what lands where. In short:

- Error Tracking gets every exception a request lets escape, every exception
  logged with ``logger.exception`` (or ``exc_info``), and every uncaught one in
  a script or a thread.
- Logs gets every record at LOG_LEVEL and above, as the console does.
- Both carry the signed-in user's id, the browser's PostHog session and the
  tournament, so a backend error sits in the same session replay as the click
  that caused it.

Without POSTHOG_API_KEY only the console logging is set up and nothing leaves
the process. Email addresses and mobile numbers are redacted from everything
sent (config/redaction.py): PostHog knows users by id alone.
"""

import logging
import queue
import sys
import threading
import time
import traceback
from collections.abc import Mapping
from typing import Any, Optional

import requests
from posthog import Posthog, contexts
from posthog.integrations.asgi import PosthogASGIMiddleware

from config.redaction import redact_personal_data
from config.settings import settings

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"

# OTLP/JSON, the project token in the query string: what posthog-js sends.
LOGS_PATH = "/i/v1/logs"

# Request context the ASGI middleware tags, as log attributes.
_REQUEST_TAGS = {
    "$request_method": "http.request.method",
    "$request_path": "url.path",
    "tournament": "tournament",
}

# What every LogRecord has; anything else on one came in through `extra=`.
_STANDARD_RECORD_ATTRS = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", (), None))
) | {"message", "asctime", "taskName", "color_message"}

# The free-text event properties; ids, timestamps and the like are left alone.
_FREE_TEXT_PROPERTIES = (
    "$current_url",
    "$request_path",
    "$exception_message",
    "log_message",
)

_client: Optional[Posthog] = None
_log_handler: Optional["PostHogLogHandler"] = None
_configured = False


def _severity(levelno: int) -> tuple[int, str]:
    """OTLP's severity number and text for a Python level."""
    if levelno >= logging.CRITICAL:
        return 21, "FATAL"
    if levelno >= logging.ERROR:
        return 17, "ERROR"
    if levelno >= logging.WARNING:
        return 13, "WARN"
    if levelno >= logging.INFO:
        return 9, "INFO"
    return 5, "DEBUG"


def _otlp_value(value: Any) -> dict:
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    return {"stringValue": str(value)}


def _otlp_attributes(attributes: Mapping[str, Any]) -> list[dict]:
    return [
        {"key": key, "value": _otlp_value(value)}
        for key, value in attributes.items()
        if value is not None
    ]


def _context_attributes() -> dict[str, Any]:
    """Who and what the current request is about, from the PostHog context.

    `posthogDistinctId` and `sessionId` are the attributes PostHog links a log
    line to a person and a session replay by.
    """
    attributes: dict[str, Any] = {}
    distinct_id = contexts.get_context_distinct_id()
    if distinct_id:
        attributes["posthogDistinctId"] = distinct_id
    session_id = contexts.get_context_session_id()
    if session_id:
        attributes["sessionId"] = session_id
    tags = contexts.get_tags()
    for tag, attribute in _REQUEST_TAGS.items():
        if tags.get(tag) is not None:
            attributes[attribute] = redact_personal_data(str(tags[tag]))
    return attributes


def _stderr(message: str) -> None:
    # Not through logging: that would only queue the complaint behind the
    # records PostHog is refusing.
    sys.stderr.write(f"[posthog-logs] {message}\n")


class PostHogLogHandler(logging.Handler):
    """Sends log records to PostHog Logs, in batches, from a thread of its own.

    Logging never waits on PostHog. A record that finds the queue full, or a
    batch PostHog does not accept, is dropped, and the drop is reported on
    stderr, which the console logs keep.
    """

    def __init__(
        self,
        host: str,
        api_key: str,
        resource: Mapping[str, str],
        *,
        session: Optional[requests.Session] = None,
        batch_size: int = 200,
        flush_interval: float = 5.0,
        max_queue: int = 10_000,
        timeout: float = 10.0,
    ) -> None:
        super().__init__()
        self._url = host.rstrip("/") + LOGS_PATH
        self._token = api_key
        self._resource = _otlp_attributes(resource)
        self._scope = {"name": resource.get("service.name", "walle-backend")}
        self._session = session or requests.Session()
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._timeout = timeout
        self._queue: "queue.Queue[dict]" = queue.Queue(maxsize=max_queue)
        self._queue_full_drops = 0
        self._send_lock = threading.Lock()
        self._wake = threading.Event()
        self._closing = False
        self._thread = threading.Thread(
            target=self._run, name="posthog-logs", daemon=True
        )
        self._thread.start()

    def emit(self, record: logging.LogRecord) -> None:
        # What the sender itself logs while sending (urllib3, say) would
        # otherwise queue up behind it, forever.
        if threading.current_thread() is self._thread:
            return
        try:
            item = self._to_otlp(record)
        except Exception:
            self.handleError(record)
            return
        try:
            self._queue.put_nowait(item)
        except queue.Full:
            self._queue_full_drops += 1
            return
        if self._queue.qsize() >= self._batch_size:
            self._wake.set()

    def flush(self) -> None:
        """Send everything queued so far, now."""
        self._send_queued()

    def close(self) -> None:
        if not self._closing:
            self._closing = True
            self._wake.set()
            self._thread.join(timeout=self._timeout)
            self._send_queued()
        super().close()

    def _to_otlp(self, record: logging.LogRecord) -> dict:
        severity_number, severity_text = _severity(record.levelno)
        # Free text is redacted field by field: the ids must stay intact (a
        # session id is a UUID, and one in a few hundred ends in 12 digits).
        attributes: dict[str, Any] = {
            key: redact_personal_data(value) if isinstance(value, str) else value
            for key, value in vars(record).items()
            if key not in _STANDARD_RECORD_ATTRS and not key.startswith("_")
        }
        attributes.update(
            {
                "logger.name": record.name,
                "code.file.path": record.pathname,
                "code.function.name": record.funcName,
                "code.line.number": record.lineno,
            }
        )
        attributes.update(_context_attributes())
        if record.exc_info and record.exc_info[0] is not None:
            exc_type, exc, tb = record.exc_info
            attributes["exception.type"] = exc_type.__name__
            attributes["exception.message"] = redact_personal_data(str(exc))
            attributes["exception.stacktrace"] = redact_personal_data(
                "".join(traceback.format_exception(exc_type, exc, tb))
            )
        timestamp = str(int(record.created * 1e9))
        return {
            "timeUnixNano": timestamp,
            "observedTimeUnixNano": str(time.time_ns()),
            "severityNumber": severity_number,
            "severityText": severity_text,
            "body": {"stringValue": redact_personal_data(record.getMessage())},
            "attributes": _otlp_attributes(attributes),
        }

    def _run(self) -> None:
        while not self._closing:
            self._wake.wait(self._flush_interval)
            self._wake.clear()
            self._send_queued()

    def _send_queued(self) -> None:
        with self._send_lock:
            while True:
                batch: list[dict] = []
                while len(batch) < self._batch_size:
                    try:
                        batch.append(self._queue.get_nowait())
                    except queue.Empty:
                        break
                if not batch:
                    break
                self._post(batch)
            if self._queue_full_drops:
                dropped, self._queue_full_drops = self._queue_full_drops, 0
                _stderr(f"dropped {dropped} log record(s): the queue was full")

    def _post(self, records: list[dict]) -> None:
        payload = {
            "resourceLogs": [
                {
                    "resource": {"attributes": self._resource},
                    "scopeLogs": [{"scope": self._scope, "logRecords": records}],
                }
            ]
        }
        try:
            response = self._session.post(
                self._url,
                params={"token": self._token},
                json=payload,
                timeout=self._timeout,
            )
        except requests.RequestException as exc:
            reason = f"could not reach PostHog ({type(exc).__name__})"
        else:
            if response.ok:
                return
            reason = f"PostHog answered {response.status_code}"
        _stderr(f"dropped {len(records)} log record(s): {reason}")


class PostHogExceptionHandler(logging.Handler):
    """Sends exceptions that are logged rather than raised to Error Tracking.

    ``logger.exception(...)`` in an except block is how this codebase records
    a failure it carries on from: a contest that would not score, a code that
    would not send. Without this they would be log lines only. The SDK skips
    an exception it has already captured, so one logged and then re-raised
    is still a single event.
    """

    def __init__(self, client: Posthog) -> None:
        super().__init__(level=logging.ERROR)
        self._client = client

    def emit(self, record: logging.LogRecord) -> None:
        # The SDK reports its own send failures on "posthog"; capturing those
        # would be one more send to fail.
        if record.name == "posthog" or record.name.startswith("posthog."):
            return
        if not record.exc_info or record.exc_info[1] is None:
            return
        try:
            self._client.capture_exception(
                record.exc_info[1],
                properties={"log_message": record.getMessage(), "logger": record.name},
            )
        except Exception:
            self.handleError(record)


def redact_event(event: dict) -> dict:
    """The SDK's before_send: no email address or mobile number leaves."""
    properties = event.get("properties")
    if not isinstance(properties, dict):
        return event
    for key in _FREE_TEXT_PROPERTIES:
        if isinstance(properties.get(key), str):
            properties[key] = redact_personal_data(properties[key])
    values = properties.get("$exception_values")
    if isinstance(values, list):
        properties["$exception_values"] = [
            redact_personal_data(v) if isinstance(v, str) else v for v in values
        ]
    for exception in properties.get("$exception_list") or ():
        if isinstance(exception, dict) and isinstance(exception.get("value"), str):
            exception["value"] = redact_personal_data(exception["value"])
    return event


def setup_observability(service: str) -> Optional[Posthog]:
    """Configure logging, and PostHog when POSTHOG_API_KEY is set.

    `service` names where events and logs come from: "backend" for the API,
    the script's name for a script. Only the first call does anything.
    Returns the PostHog client, or None when PostHog is off.
    """
    global _client, _log_handler, _configured
    if _configured:
        return _client
    _configured = True

    level = getattr(logging, settings.log_level)
    logging.basicConfig(level=level, format=LOG_FORMAT)
    # basicConfig leaves the level alone once the root has a handler.
    logging.getLogger().setLevel(level)

    if not settings.posthog_api_key:
        return None

    _client = Posthog(
        settings.posthog_api_key,
        host=settings.posthog_host,
        # Uncaught exceptions in a script's main thread or any other thread.
        # Requests are covered by the ASGI middleware (instrument_app).
        enable_exception_autocapture=True,
        super_properties={"service": service, "environment": settings.node_env},
        before_send=redact_event,
    )
    _log_handler = PostHogLogHandler(
        settings.posthog_host,
        settings.posthog_api_key,
        {
            "service.name": f"walle-{service}",
            "deployment.environment": settings.node_env,
        },
    )
    _log_handler.setLevel(level)
    root = logging.getLogger()
    root.addHandler(_log_handler)
    root.addHandler(PostHogExceptionHandler(_client))
    return _client


def instrument_app(app, tenant_header: str) -> None:
    """Give every request a PostHog context and capture what escapes it.

    The context carries the browser's PostHog distinct and session ids (the
    X-POSTHOG-* headers posthog-js adds), the request's method and path, and
    its tournament. Call before the app starts; a no-op with PostHog off.
    """
    if _client is None:
        return
    header = tenant_header.lower().encode("latin-1")

    def tournament(scope) -> Optional[dict]:
        for name, value in scope.get("headers") or ():
            if name == header:
                slug = value.decode("latin-1").strip().lower()[:64]
                return {"tournament": slug} if slug else None
        return None

    app.add_middleware(
        PosthogASGIMiddleware,
        client=_client,
        capture_exceptions=True,
        extra_properties=tournament,
    )


def ship_uvicorn_logs() -> None:
    """Send uvicorn's own logs to PostHog too.

    They stop at the "uvicorn" logger rather than reaching the root, and
    uvicorn replaces that logger's handlers when it configures logging, so
    this runs at startup, once that has happened. Its line per request
    ("uvicorn.access") goes only with POSTHOG_ACCESS_LOGS.
    """
    if _log_handler is None:
        return
    names = ["uvicorn"]
    if settings.posthog_access_logs:
        names.append("uvicorn.access")
    for name in names:
        logger = logging.getLogger(name)
        # Propagating, it reaches the root's handler already.
        if not logger.propagate:
            if _log_handler not in logger.handlers:
                logger.addHandler(_log_handler)


def identify_user(user_id: str) -> None:
    """Attribute what this request sends to PostHog to the signed-in user.

    The same id the website identifies them by. Overrides the distinct id
    the request's header claimed, which the client chose.
    """
    contexts.identify_context(user_id)


def flush_observability() -> None:
    """Send everything queued for PostHog. Blocks; at shutdown or a script's end."""
    if _log_handler is not None:
        _log_handler.flush()
    if _client is not None:
        _client.flush()
