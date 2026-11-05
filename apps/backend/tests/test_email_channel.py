"""The email channel: password reset by email, and changing the email on a
profile (docs/UNIFIED_AUTH_SPEC.md §5.2-5.7, stage C3).

Resend is never called. The sender is replaced by a mailbox that records each
code, so a test types it back the way a person would from their inbox; the
sender itself is tested against httpx's mock transport.
"""

import logging
from datetime import datetime, timedelta

import httpx
import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError

from app.common.enums.tournaments import TournamentStatus
from app.models.password_reset import (
    CHANNEL_EMAIL,
    PURPOSE_EMAIL_CHANGE,
    PURPOSE_PASSWORD_RESET,
    PasswordResetSession,
    PasswordResetToken,
)
from app.models.tournament import Tournament
from app.models.user import RefreshToken, User
from app.services.auth import email_otp, password_reset, twofactor
from app.services.auth.email_change import confirm_email_change, request_email_change
from app.utils.dependencies import get_current_active_user
from app.utils.security import get_password_hash, verify_password
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

PASSWORD = "CurrentPass1"
NEW_PASSWORD = "BrandNew1"
GENERIC_EMAIL_MESSAGE = "If the email exists, a code has been sent."


@pytest.fixture
def resend_on(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key_123")
    monkeypatch.setattr(
        settings, "resend_from_email", "WALL-E Arena <no-reply@send.example.com>"
    )
    monkeypatch.setattr(settings, "resend_reply_to", None)


@pytest.fixture
def sms_on(monkeypatch):
    monkeypatch.setattr(twofactor, "API_KEY", "test-key")
    monkeypatch.setattr(twofactor, "TEMPLATE_NAME", "test-template")


@pytest.fixture
def mailbox(monkeypatch, resend_on):
    """Stands in for Resend: every code mailed, newest last."""
    sent = []

    async def fake_send(to, code, purpose, idempotency_key, brand=None):
        sent.append(
            {
                "to": to,
                "code": code,
                "purpose": purpose,
                "key": idempotency_key,
                "brand": brand,
            }
        )
        return True, None

    monkeypatch.setattr(password_reset, "send_otp_email", fake_send)
    return sent


@pytest.fixture
def sms(monkeypatch):
    """Stands in for 2Factor; the code is always 123456."""
    sent = []

    async def fake_send(phone):
        sent.append(phone)
        return True, f"provider-session-{len(sent)}", None

    async def fake_verify(provider_session_id, otp):
        return otp == "123456", None

    monkeypatch.setattr(password_reset, "send_otp_autogen", fake_send)
    monkeypatch.setattr(password_reset, "provider_verify_otp", fake_verify)
    return sent


@pytest_asyncio.fixture
async def rahul(db):
    user = User(
        username="rahul",
        email="rahul@example.com",
        # The second is carried from a merged account in another tournament.
        emails=["rahul@example.com", "rahul.lpcl@example.com"],
        mobile="9876543210",
        mobiles=["9876543210"],
        hashed_password=get_password_hash(PASSWORD),
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def signed_in(db):
    """A client acting as the given user."""
    from main import app

    clients = []

    def client_for(user):
        async def _me():
            return user

        app.dependency_overrides[get_current_active_user] = _me
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        clients.append(client)
        return client

    yield client_for
    for client in clients:
        await client.aclose()
    app.dependency_overrides.pop(get_current_active_user, None)


async def _login(client, identifier, password):
    return await client.post(
        "/api/auth/login", json={"username": identifier, "password": password}
    )


async def _only_session() -> PasswordResetSession:
    sessions = await PasswordResetSession.find_all().to_list()
    assert len(sessions) == 1
    return sessions[0]


# --------------------------------------------------------------------------
# which channels are on
# --------------------------------------------------------------------------


async def test_channels_report_neither_when_nothing_is_configured(anon_client):
    resp = await anon_client.get("/api/auth/forgot-password/channels")

    assert resp.status_code == 200
    assert resp.json() == {"sms": False, "email": False}


async def test_channels_report_what_is_configured(anon_client, sms_on, resend_on):
    resp = await anon_client.get("/api/auth/forgot-password/channels")

    assert resp.json() == {"sms": True, "email": True}


async def test_an_unconfigured_email_channel_says_so_and_offers_the_other(
    anon_client, rahul, sms_on
):
    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "rahul@example.com"}
    )

    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["code"] == "channel_unavailable"
    assert "Use your mobile number instead." in detail["message"]
    assert await PasswordResetSession.find_all().to_list() == []


async def test_an_unconfigured_sms_channel_no_longer_claims_a_code_was_sent(
    anon_client, rahul
):
    """fifth's outage (spec §1.1a): no 2Factor credentials, and the route said
    "an OTP has been sent" anyway. With nothing else on, it offers nothing."""
    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "9876543210"}
    )

    assert resp.status_code == 503
    assert resp.json()["detail"]["message"] == (
        "Password reset by mobile number isn't available right now."
    )


async def test_the_refusal_says_nothing_about_who_exists(anon_client, rahul, sms_on):
    known = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "rahul@example.com"}
    )
    unknown = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "nobody@example.com"}
    )

    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())


@pytest.mark.parametrize(
    "body",
    [{}, {"phone": "9876543210", "email": "rahul@example.com"}],
    ids=["neither", "both"],
)
async def test_a_request_names_exactly_one_destination(anon_client, body):
    resp = await anon_client.post("/api/auth/forgot-password/request", json=body)

    assert resp.status_code == 422


async def test_a_null_phone_beside_an_email_is_an_email_request(
    anon_client, rahul, mailbox
):
    resp = await anon_client.post(
        "/api/auth/forgot-password/request",
        json={"phone": None, "email": "rahul@example.com"},
    )

    assert resp.status_code == 200
    assert [m["to"] for m in mailbox] == ["rahul@example.com"]


# --------------------------------------------------------------------------
# password reset by SMS, as every client has always sent it
# --------------------------------------------------------------------------


async def test_the_existing_phone_reset_still_works_end_to_end(
    anon_client, rahul, sms, sms_on
):
    """The live website and app send {phone} and expect this flow unchanged."""
    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "+91 98765 43210"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"message": "If the phone exists, an OTP has been sent."}
    assert sms == ["+91 98765 43210"]

    resp = await anon_client.post(
        "/api/auth/forgot-password/verify",
        json={"phone": "+91 98765 43210", "otp": "123456"},
    )
    assert resp.status_code == 200

    resp = await anon_client.post(
        "/api/auth/forgot-password/reset",
        json={"reset_token": resp.json()["reset_token"], "new_password": NEW_PASSWORD},
    )
    assert resp.status_code == 200
    assert (await _login(anon_client, "9876543210", NEW_PASSWORD)).status_code == 200


async def test_a_wrong_sms_code_is_a_400(anon_client, rahul, sms, sms_on):
    await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "9876543210"}
    )

    resp = await anon_client.post(
        "/api/auth/forgot-password/verify",
        json={"phone": "9876543210", "otp": "654321"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid or expired OTP"


# --------------------------------------------------------------------------
# password reset by email
# --------------------------------------------------------------------------


async def test_a_reset_by_email_end_to_end(anon_client, rahul, mailbox):
    await RefreshToken(
        user_id=rahul.id,
        token="old-refresh-token",
        expires_at=datetime.utcnow() + timedelta(days=7),
    ).insert()

    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": " Rahul@Example.com "}
    )
    assert resp.status_code == 200
    assert resp.json() == {"message": GENERIC_EMAIL_MESSAGE}

    [mail] = mailbox
    session = await _only_session()
    assert mail["to"] == "rahul@example.com"
    assert mail["purpose"] == PURPOSE_PASSWORD_RESET
    assert mail["key"] == f"password_reset:{session.id}"
    assert session.channel == CHANNEL_EMAIL
    assert session.destination == "rahul@example.com"
    assert session.provider == "resend"
    # Kept as a keyed hash only; the code itself is stored nowhere.
    assert session.otp_hash and mail["code"] not in session.model_dump_json()

    resp = await anon_client.post(
        "/api/auth/forgot-password/verify",
        json={"email": "rahul@example.com", "otp": mail["code"]},
    )
    assert resp.status_code == 200
    token = resp.json()["reset_token"]

    resp = await anon_client.post(
        "/api/auth/forgot-password/reset",
        json={"reset_token": token, "new_password": NEW_PASSWORD},
    )
    assert resp.status_code == 200

    assert (await _login(anon_client, "rahul@example.com", PASSWORD)).status_code == 401
    assert (
        await _login(anon_client, "rahul@example.com", NEW_PASSWORD)
    ).status_code == 200
    old = await RefreshToken.find_one(RefreshToken.token == "old-refresh-token")
    assert old.revoked is True
    assert (await _only_session()).status == "completed"


async def test_an_unknown_address_gets_the_same_answer_and_no_mail(
    anon_client, rahul, mailbox
):
    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "nobody@example.com"}
    )

    assert resp.status_code == 200
    assert resp.json() == {"message": GENERIC_EMAIL_MESSAGE}
    assert mailbox == []
    assert await PasswordResetSession.find_all().to_list() == []


async def test_an_account_the_backfill_has_not_reached_is_found_by_its_email(
    db, mailbox
):
    legacy = User(
        username="legacy",
        email="legacy@example.com",
        hashed_password=get_password_hash(PASSWORD),
    )
    await legacy.insert()

    await password_reset.start_email_session("legacy@example.com")

    assert (await _only_session()).user_id == legacy.id
    assert [m["to"] for m in mailbox] == ["legacy@example.com"]


async def test_a_failed_send_leaves_no_session_and_the_generic_answer(
    anon_client, rahul, resend_on, monkeypatch
):
    async def failing_send(*args, **kwargs):
        return False, "The send.example.com domain is not verified"

    monkeypatch.setattr(password_reset, "send_otp_email", failing_send)

    resp = await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "rahul@example.com"}
    )

    assert resp.status_code == 200
    assert resp.json() == {"message": GENERIC_EMAIL_MESSAGE}
    assert await PasswordResetSession.find_all().to_list() == []


async def test_the_reset_email_carries_the_tournament_name(
    anon_client, rahul, mailbox, monkeypatch
):
    monkeypatch.setattr(settings, "tenancy", "shared")
    await Tournament(
        slug="alpha", name="Alpha Premier League", status=TournamentStatus.LIVE
    ).insert()

    await anon_client.post(
        "/api/auth/forgot-password/request",
        json={"email": "rahul@example.com"},
        headers={TENANT_HEADER: "alpha"},
    )
    await anon_client.post(
        "/api/auth/forgot-password/request", json={"email": "rahul@example.com"}
    )

    assert [m["brand"] for m in mailbox] == ["Alpha Premier League", None]


async def test_a_wrong_code_is_refused_and_counted(rahul, mailbox):
    await password_reset.start_email_session("rahul@example.com")

    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token(
            "rahul@example.com",
            "000000" if mailbox[0]["code"] != "000000" else "111111",
        )

    assert (await _only_session()).attempts == 1


async def test_an_exhausted_session_refuses_even_the_right_code(rahul, mailbox):
    """The cap is enforced where the attempt is counted, not by an earlier read,
    so parallel guesses cannot all slip in under the same count."""
    await password_reset.start_email_session("rahul@example.com")
    session = await _only_session()
    await session.set({PasswordResetSession.attempts: session.max_attempts})

    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token(
            "rahul@example.com", mailbox[0]["code"]
        )


async def test_an_expired_code_is_refused(rahul, mailbox):
    await password_reset.start_email_session("rahul@example.com")
    session = await _only_session()
    await session.set(
        {PasswordResetSession.expires_at: datetime.utcnow() - timedelta(seconds=1)}
    )

    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token(
            "rahul@example.com", mailbox[0]["code"]
        )


async def test_a_session_verified_by_a_racing_request_issues_no_second_token(
    rahul, mailbox
):
    """Both requests counted an attempt on the same pending session; the one
    that does not move it to verified must not get a token."""
    await password_reset.start_email_session("rahul@example.com")
    session = await password_reset.claim_attempt(
        PasswordResetSession.user_id == rahul.id
    )
    await PasswordResetSession.get_motor_collection().update_one(
        {"_id": session.id}, {"$set": {"status": "verified"}}
    )

    with pytest.raises(ValueError):
        await password_reset.mark_verified(session)


async def test_a_code_opens_one_reset(rahul, mailbox):
    await password_reset.start_email_session("rahul@example.com")
    code = mailbox[0]["code"]

    await password_reset.verify_email_otp_and_issue_token("rahul@example.com", code)
    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token("rahul@example.com", code)

    assert await PasswordResetToken.find_all().count() == 1


async def test_a_new_code_replaces_the_one_before(rahul, mailbox):
    await password_reset.start_email_session("rahul@example.com")
    first = await _only_session()
    await password_reset.start_email_session("rahul@example.com")

    second = await _only_session()
    assert second.id != first.id
    await password_reset.verify_email_otp_and_issue_token(
        "rahul@example.com", mailbox[1]["code"]
    )


async def test_an_email_code_does_not_open_an_sms_reset(rahul, mailbox, sms):
    await password_reset.start_email_session("rahul@example.com")

    with pytest.raises(ValueError):
        await password_reset.verify_otp_and_issue_token(
            "9876543210", mailbox[0]["code"]
        )


async def test_an_sms_session_is_found_by_its_exact_number_only(rahul, sms):
    """Digits only, compared by equality: the pattern fallback this replaced
    matched any session whose number merely contained the digits typed."""
    await password_reset.start_session("+91 98765 43210")
    assert (await _only_session()).destination == "919876543210"

    with pytest.raises(ValueError):
        await password_reset.verify_otp_and_issue_token("9876543210", "123456")
    token, _ = await password_reset.verify_otp_and_issue_token(
        "+91 98765 43210", "123456"
    )
    assert token


async def _token_for(user, status, purpose=PURPOSE_PASSWORD_RESET) -> str:
    session = PasswordResetSession(
        user_id=user.id,
        purpose=purpose,
        channel=CHANNEL_EMAIL,
        destination=user.email,
        status=status,
    )
    await session.insert()
    raw = "raw-reset-token"
    await PasswordResetToken(
        user_id=user.id,
        session_id=session.id,
        token_hash=password_reset._hash_token(raw),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    ).insert()
    return raw


async def test_a_session_nobody_entered_a_code_for_cannot_reset(rahul):
    """The guard this replaced let a pending session through (spec §5.5)."""
    token = await _token_for(rahul, "pending")

    with pytest.raises(ValueError):
        await password_reset.reset_password(token, NEW_PASSWORD)

    assert verify_password(PASSWORD, (await User.get(rahul.id)).hashed_password)


async def test_an_email_change_session_cannot_reset_a_password(rahul):
    token = await _token_for(rahul, "verified", purpose=PURPOSE_EMAIL_CHANGE)

    with pytest.raises(ValueError):
        await password_reset.reset_password(token, NEW_PASSWORD)


async def test_a_reset_token_works_once(rahul):
    token = await _token_for(rahul, "verified")

    await password_reset.reset_password(token, NEW_PASSWORD)
    with pytest.raises(ValueError):
        await password_reset.reset_password(token, "AnotherOne1")

    assert verify_password(NEW_PASSWORD, (await User.get(rahul.id)).hashed_password)


async def test_a_token_spent_by_a_racing_reset_changes_nothing(rahul, monkeypatch):
    """Both requests read the token unused; only the one that marks it used
    may set a password."""
    token = await _token_for(rahul, "verified")
    real_find_one = PasswordResetToken.find_one

    async def stale_read(*args, **kwargs):
        doc = await real_find_one(*args, **kwargs)
        # The other request spends the token after this one has read it.
        await PasswordResetToken.get_motor_collection().update_one(
            {"_id": doc.id}, {"$set": {"used_at": datetime.utcnow()}}
        )
        return doc

    monkeypatch.setattr(PasswordResetToken, "find_one", stale_read)

    with pytest.raises(ValueError):
        await password_reset.reset_password(token, "AnotherOne1")

    assert verify_password(PASSWORD, (await User.get(rahul.id)).hashed_password)


# --------------------------------------------------------------------------
# the sender
# --------------------------------------------------------------------------


@pytest.fixture
def resend_api(monkeypatch):
    """Routes the sender's HTTP calls to a handler the test sets."""
    calls = []
    state = {"respond": lambda request: httpx.Response(200, json={"id": "email-1"})}
    real_client = httpx.AsyncClient

    def handler(request):
        calls.append(request)
        return state["respond"](request)

    def client(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(email_otp.httpx, "AsyncClient", client)
    return calls, state


def test_codes_are_six_digits():
    codes = {email_otp.generate_otp() for _ in range(50)}

    assert all(len(c) == 6 and c.isdigit() for c in codes)
    assert len(codes) > 1


def test_the_code_hash_is_keyed_and_per_session(monkeypatch):
    one, two = PydanticObjectId(), PydanticObjectId()
    stored = email_otp.hash_otp("123456", one)

    assert stored != email_otp.hash_otp("123456", two)
    assert email_otp.otp_matches(" 123456 ", one, stored)
    assert not email_otp.otp_matches("123457", one, stored)
    assert not email_otp.otp_matches("123456", two, stored)
    assert not email_otp.otp_matches("123456", one, None)

    monkeypatch.setattr(settings, "secret_key", "another-secret-key-0000000000000000")
    assert email_otp.hash_otp("123456", one) != stored


async def test_a_send_is_one_message_to_resend(resend_on, resend_api, monkeypatch):
    calls, _ = resend_api
    monkeypatch.setattr(settings, "resend_reply_to", "help@example.com")

    ok, err = await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1", brand="Alpha"
    )

    assert (ok, err) == (True, None)
    [request] = calls
    assert str(request.url) == email_otp.RESEND_URL
    assert request.headers["authorization"] == "Bearer re_test_key_123"
    assert request.headers["idempotency-key"] == "key-1"
    body = httpx.Response(200, content=request.content).json()
    assert body["to"] == ["rahul@example.com"]
    assert body["from"] == "WALL-E Arena <no-reply@send.example.com>"
    assert body["reply_to"] == "help@example.com"
    assert body["subject"] == "482913 is your Alpha password reset code"
    assert "482913" in body["text"] and "482913" in body["html"]


async def test_no_configuration_means_no_request(resend_api):
    calls, _ = resend_api

    ok, err = await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )

    assert (ok, err) == (False, "Missing Resend configuration")
    assert calls == []


async def test_a_refusal_carries_resends_reason_without_the_address(
    resend_on, resend_api
):
    _, state = resend_api
    state["respond"] = lambda request: httpx.Response(
        422, json={"message": "Invalid `to` field: rahul@example.com"}
    )

    ok, err = await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )

    assert (ok, err) == (False, "Invalid `to` field: [redacted]")


async def test_an_error_without_a_reason_still_fails(resend_on, resend_api):
    _, state = resend_api
    state["respond"] = lambda request: httpx.Response(500, text="upstream sad")

    ok, err = await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )

    assert (ok, err) == (False, "Resend answered 500")


async def test_an_unreachable_resend_is_a_failed_send(resend_on, resend_api):
    _, state = resend_api

    def unreachable(request):
        raise httpx.ConnectError("no route", request=request)

    state["respond"] = unreachable

    ok, err = await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )

    assert (ok, err) == (False, "Could not reach Resend")


async def test_sending_never_logs_the_code_the_key_or_the_address(
    resend_on, resend_api, caplog
):
    _, state = resend_api
    caplog.set_level(logging.DEBUG)

    await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )
    state["respond"] = lambda request: httpx.Response(
        422, json={"message": "Invalid `to` field: rahul@example.com"}
    )
    await email_otp.send_otp_email(
        "rahul@example.com", "482913", PURPOSE_PASSWORD_RESET, "key-1"
    )

    for secret in ("482913", "re_test_key_123", "rahul@example.com"):
        assert secret not in caplog.text


def test_the_email_escapes_the_tournament_name():
    subject, text, body = email_otp.render_otp_email(
        "482913", "<b>Alpha</b>", PURPOSE_PASSWORD_RESET, 600, "rahul@example.com"
    )

    assert subject.startswith("482913 ")
    assert "&lt;b&gt;Alpha&lt;/b&gt;" in body and "<b>Alpha</b>" not in body
    assert "10 minutes" in text


def test_the_email_change_message_names_the_new_address():
    subject, text, _ = email_otp.render_otp_email(
        "482913", "Alpha", PURPOSE_EMAIL_CHANGE, 600, "new@example.com"
    )

    assert subject == "482913 is your Alpha email confirmation code"
    assert "new@example.com" in text


# --------------------------------------------------------------------------
# changing the email on a profile
# --------------------------------------------------------------------------


async def _request_change(client, email="new@example.com", password=PASSWORD):
    return await client.post(
        "/api/users/me/email/request", json={"email": email, "password": password}
    )


async def test_changing_the_email_end_to_end(signed_in, rahul, mailbox, anon_client):
    client = signed_in(rahul)

    resp = await _request_change(client, "New@Example.com")
    assert resp.status_code == 200
    assert resp.json() == {"email": "new@example.com", "expires_in_sec": 600}
    [mail] = mailbox
    assert (mail["to"], mail["purpose"]) == ("new@example.com", PURPOSE_EMAIL_CHANGE)
    # Nothing changes until the code comes back.
    assert (await User.get(rahul.id)).email == "rahul@example.com"

    resp = await client.post("/api/users/me/email/verify", json={"otp": mail["code"]})
    assert resp.status_code == 200
    assert resp.json()["email"] == "new@example.com"

    stored = await User.get(rahul.id)
    assert stored.email == "new@example.com"
    # The old address stops being a credential; the merged account's other
    # address stays.
    assert stored.emails == ["new@example.com", "rahul.lpcl@example.com"]
    assert stored.is_verified is True
    assert (await _login(anon_client, "new@example.com", PASSWORD)).status_code == 200
    assert (await _login(anon_client, "rahul@example.com", PASSWORD)).status_code == 401


async def test_changing_the_email_wants_the_password(signed_in, rahul, mailbox):
    resp = await _request_change(signed_in(rahul), password="wrong-password")

    # Not 401: the clients take a 401 here for an expired session and sign out.
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Incorrect password"
    assert mailbox == []
    assert await PasswordResetSession.find_all().to_list() == []


async def test_an_account_without_a_password_must_sign_in_again(signed_in, db, mailbox):
    google_only = User(
        username="googler",
        email="googler@example.com",
        emails=["googler@example.com"],
        google_id="google-sub-1",
        google_ids=["google-sub-1"],
        auth_provider="google",
        hashed_password=None,
    )
    await google_only.insert()

    resp = await signed_in(google_only).post(
        "/api/users/me/email/request", json={"email": "new@example.com"}
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Re-authenticate with Google to change your email"
    assert mailbox == []


async def test_the_same_address_is_not_a_change(signed_in, rahul, mailbox):
    resp = await _request_change(signed_in(rahul), "RAHUL@example.com")

    assert resp.status_code == 400
    assert mailbox == []


@pytest.mark.parametrize("held_in", ["emails", "email"])
async def test_an_address_another_account_uses_is_refused(
    signed_in, rahul, mailbox, held_in
):
    other = User(
        username="other", email="other-scalar@example.com", hashed_password="x"
    )
    if held_in == "emails":
        other.emails = ["taken@example.com"]
    else:
        other.email = "taken@example.com"
    await other.insert()

    resp = await _request_change(signed_in(rahul), "taken@example.com")

    assert resp.status_code == 409
    assert mailbox == []


async def test_changing_the_email_needs_the_email_channel(signed_in, rahul):
    resp = await _request_change(signed_in(rahul))

    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "channel_unavailable"


async def test_a_code_that_cannot_be_sent_is_a_502(
    signed_in, rahul, resend_on, monkeypatch
):
    async def failing_send(*args, **kwargs):
        return False, "boom"

    monkeypatch.setattr(password_reset, "send_otp_email", failing_send)

    resp = await _request_change(signed_in(rahul))

    assert resp.status_code == 502
    assert await PasswordResetSession.find_all().to_list() == []


async def test_a_wrong_code_changes_nothing(signed_in, rahul, mailbox):
    client = signed_in(rahul)
    await _request_change(client)

    resp = await client.post(
        "/api/users/me/email/verify",
        json={"otp": "000000" if mailbox[0]["code"] != "000000" else "111111"},
    )

    assert resp.status_code == 400
    assert (await User.get(rahul.id)).email == "rahul@example.com"


async def test_an_address_taken_while_the_code_was_in_flight_is_refused(
    signed_in, rahul, mailbox
):
    client = signed_in(rahul)
    await _request_change(client)
    await User(username="quick", email="new@example.com", hashed_password="x").insert()

    resp = await client.post(
        "/api/users/me/email/verify", json={"otp": mailbox[0]["code"]}
    )

    assert resp.status_code == 409
    assert (await User.get(rahul.id)).email == "rahul@example.com"


async def test_the_unique_index_settles_a_race_as_a_409(
    signed_in, rahul, mailbox, monkeypatch
):
    client = signed_in(rahul)
    await _request_change(client)

    async def collide(*args, **kwargs):
        raise DuplicateKeyError("uniq_emails")

    monkeypatch.setattr(User, "set", collide)

    resp = await client.post(
        "/api/users/me/email/verify", json={"otp": mailbox[0]["code"]}
    )

    assert resp.status_code == 409


async def test_confirming_writes_only_the_email_fields(rahul, mailbox):
    """The route's user was loaded at the start of the request; a password
    change landing meanwhile must survive the email change."""
    await request_email_change(rahul, "new@example.com", None)
    changed = get_password_hash("ChangedMeanwhile1")
    await User.get_motor_collection().update_one(
        {"_id": rahul.id}, {"$set": {"hashed_password": changed}}
    )

    await confirm_email_change(rahul, mailbox[0]["code"])

    stored = await User.get(rahul.id)
    assert stored.email == "new@example.com"
    assert stored.hashed_password == changed


async def test_a_reset_code_cannot_confirm_an_email_change(rahul, mailbox):
    await password_reset.start_email_session("rahul@example.com")

    with pytest.raises(ValueError):
        await confirm_email_change(rahul, mailbox[0]["code"])


async def test_an_email_change_code_cannot_reset_a_password(rahul, mailbox):
    await request_email_change(rahul, "new@example.com", None)

    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token(
            "new@example.com", mailbox[0]["code"]
        )


# --------------------------------------------------------------------------
# a removed address or number stops being a way into the account
# --------------------------------------------------------------------------


async def _change_email(user, mailbox, address="new@example.com"):
    await request_email_change(user, address, None)
    await confirm_email_change(user, mailbox[-1]["code"])


async def test_a_reset_code_mailed_to_the_old_address_dies_with_it(rahul, mailbox):
    """Whoever reads the old inbox must not finish a reset once it is gone."""
    await password_reset.start_email_session("rahul@example.com")
    stale_code = mailbox[0]["code"]

    await _change_email(rahul, mailbox)

    with pytest.raises(ValueError):
        await password_reset.verify_email_otp_and_issue_token(
            "rahul@example.com", stale_code
        )
    open_resets = await PasswordResetSession.find(
        PasswordResetSession.purpose == PURPOSE_PASSWORD_RESET
    ).to_list()
    assert open_resets == []


async def test_a_reset_token_for_a_removed_address_cannot_set_a_password(rahul):
    """The token was issued before the change; reset itself checks ownership."""
    token = await _token_for(rahul, "verified")
    await User.get_motor_collection().update_one(
        {"_id": rahul.id},
        {"$set": {"email": "new@example.com", "emails": ["new@example.com"]}},
    )

    with pytest.raises(ValueError):
        await password_reset.reset_password(token, NEW_PASSWORD)

    assert verify_password(PASSWORD, (await User.get(rahul.id)).hashed_password)


async def test_an_sms_reset_for_a_replaced_number_cannot_set_a_password(rahul, sms):
    await password_reset.start_session("9876543210")
    token, _ = await password_reset.verify_otp_and_issue_token("9876543210", "123456")
    await User.get_motor_collection().update_one(
        {"_id": rahul.id}, {"$set": {"mobile": "9123456780", "mobiles": ["9123456780"]}}
    )

    with pytest.raises(ValueError):
        await password_reset.reset_password(token, NEW_PASSWORD)


async def test_an_sms_reset_reaches_a_number_stored_another_way(rahul, sms):
    """The session holds the digits typed; the account may store the same
    phone with its country code."""
    await User.get_motor_collection().update_one(
        {"_id": rahul.id}, {"$set": {"mobiles": ["919876543210"]}}
    )
    await password_reset.start_session("9876543210")
    token, _ = await password_reset.verify_otp_and_issue_token("9876543210", "123456")

    await password_reset.reset_password(token, NEW_PASSWORD)

    assert verify_password(NEW_PASSWORD, (await User.get(rahul.id)).hashed_password)


async def test_the_old_address_is_remembered_as_removed(rahul, mailbox):
    await _change_email(rahul, mailbox)

    stored = await User.get(rahul.id)
    assert stored.removed_emails == ["rahul@example.com"]

    # Changing back makes it the account's again.
    await _change_email(stored, mailbox, "rahul@example.com")
    assert (await User.get(rahul.id)).removed_emails == ["new@example.com"]


async def test_google_sign_in_does_not_restore_a_removed_address(rahul, mailbox):
    from app.services.auth.google import find_or_create_google_user

    await rahul.set({User.google_ids: ["google-sub-1"]})
    await _change_email(rahul, mailbox)

    await find_or_create_google_user(
        {"sub": "google-sub-1", "email": "rahul@example.com", "email_verified": True}
    )

    stored = await User.get(rahul.id)
    assert "rahul@example.com" not in stored.emails
    assert stored.email == "new@example.com"


async def test_apple_sign_in_does_not_restore_a_removed_address(rahul, mailbox):
    from app.services.auth.apple import find_or_create_apple_user

    await rahul.set({User.apple_ids: ["apple-sub-1"]})
    await _change_email(rahul, mailbox)

    await find_or_create_apple_user(
        {"sub": "apple-sub-1", "email": "rahul@example.com"}
    )

    assert "rahul@example.com" not in (await User.get(rahul.id)).emails


# --------------------------------------------------------------------------
# a write that read the account before an email change does not undo it
# --------------------------------------------------------------------------


async def _read_then_change(user, mailbox):
    """The account as a request read it, then the email change landing after."""
    stale = await User.get(user.id)
    await _change_email(user, mailbox)
    return stale


async def _assert_change_survived(user):
    stored = await User.get(user.id)
    assert stored.email == "new@example.com"
    assert "rahul@example.com" not in stored.emails
    assert stored.removed_emails == ["rahul@example.com"]


async def test_a_login_that_overlaps_an_email_change_keeps_it(
    anon_client, rahul, mailbox, monkeypatch
):
    stale = await _read_then_change(rahul, mailbox)

    async def resolve(identifier):
        return stale

    monkeypatch.setattr("app.routes.auth.resolve_login_identity", resolve)

    assert (await _login(anon_client, "rahul", PASSWORD)).status_code == 200
    await _assert_change_survived(rahul)
    assert (await User.get(rahul.id)).last_login is not None


async def test_a_google_sign_in_that_overlaps_an_email_change_keeps_it(
    rahul, mailbox, monkeypatch
):
    from app.services.auth import google

    await rahul.set({User.google_ids: ["google-sub-1"]})
    stale = await _read_then_change(rahul, mailbox)

    async def find(google_id, email):
        return stale

    monkeypatch.setattr(google, "_find_existing", find)

    await google.find_or_create_google_user(
        {"sub": "google-sub-1", "email": "fresh@example.com", "email_verified": True}
    )

    await _assert_change_survived(rahul)
    # A new provider address is still recorded beside it.
    assert "fresh@example.com" in (await User.get(rahul.id)).emails


async def test_a_password_change_that_overlaps_an_email_change_keeps_it(
    signed_in, rahul, mailbox
):
    stale = await _read_then_change(rahul, mailbox)

    resp = await signed_in(stale).post(
        "/api/auth/change-password",
        json={
            "current_password": PASSWORD,
            "new_password": NEW_PASSWORD,
            "confirm_password": NEW_PASSWORD,
        },
    )

    assert resp.status_code == 200
    await _assert_change_survived(rahul)
    assert verify_password(NEW_PASSWORD, (await User.get(rahul.id)).hashed_password)


async def test_a_profile_edit_that_overlaps_an_email_change_keeps_it(
    signed_in, rahul, mailbox
):
    stale = await _read_then_change(rahul, mailbox)

    resp = await signed_in(stale).patch("/api/users/me", json={"full_name": "Rahul K"})

    assert resp.status_code == 200
    await _assert_change_survived(rahul)
    assert (await User.get(rahul.id)).full_name == "Rahul K"
