"""The auth routes on the new identity resolution.

The important tests here are the ones about accounts the backfill has not
reached. This ships to live tournaments whose users have empty identity arrays,
so anything that only worked post-backfill would be an outage on deploy.
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient

from app.models.password_reset import PasswordResetSession
from app.models.user import LegacyHash, RefreshToken, User
from app.services.auth import password_reset
from app.utils.dependencies import (
    SUBJECT_KIND_CLAIM,
    SUBJECT_KIND_USER_ID,
    resolve_token_subject,
    subject_claims,
)
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)

PASSWORD = "CurrentPass1"
OLD_PASSWORD = "OldLpclPass1"


@pytest_asyncio.fixture
async def client(db):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def legacy_user(db):
    """An account exactly as it exists today: scalars set, arrays empty."""
    user = User(
        username="rahul",
        email="rahul@example.com",
        mobile="9876543210",
        hashed_password=get_password_hash(PASSWORD),
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def migrated_user(db):
    """An account after the backfill: identity arrays populated."""
    user = User(
        username="priya",
        email="priya@example.com",
        emails=["priya@example.com", "p.sharma@example.com"],
        mobile="9123456789",
        mobiles=["9123456789", "9555000111"],
        hashed_password=get_password_hash(PASSWORD),
    )
    await user.insert()
    return user


async def login(client, identifier, password=PASSWORD):
    return await client.post(
        "/api/auth/login", json={"username": identifier, "password": password}
    )


# --------------------------------------------------------------------------
# accounts the backfill has not reached -- the deploy-safety cases
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pre_backfill_account_logs_in_by_mobile(client, legacy_user):
    """Would be an outage on deploy if resolution only consulted the arrays."""
    resp = await login(client, "9876543210")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_pre_backfill_account_logs_in_by_email(client, legacy_user):
    assert (await login(client, "rahul@example.com")).status_code == 200


@pytest.mark.asyncio
async def test_pre_backfill_account_logs_in_by_username(client, legacy_user):
    assert (await login(client, "rahul")).status_code == 200


@pytest.mark.asyncio
async def test_mobile_stored_with_symbols_still_resolves(client, db):
    """Rows written before mobiles were normalised hold "+91 98765 43210"."""
    await User(
        username="legacyformat",
        email="legacy@example.com",
        mobile="+91 98765 43210",
        hashed_password=get_password_hash(PASSWORD),
    ).insert()

    assert (await login(client, "9876543210")).status_code == 200


# --------------------------------------------------------------------------
# accounts after the backfill
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_either_merged_mobile_logs_in(client, migrated_user):
    for number in ("9123456789", "9555000111"):
        assert (await login(client, number)).status_code == 200


@pytest.mark.asyncio
async def test_either_merged_email_logs_in(client, migrated_user):
    for address in ("priya@example.com", "p.sharma@example.com"):
        assert (await login(client, address)).status_code == 200


@pytest.mark.asyncio
async def test_wrong_password_is_still_401(client, legacy_user):
    assert (await login(client, "rahul", "WrongPass1")).status_code == 401


@pytest.mark.asyncio
async def test_unknown_identifier_is_401_not_404(client, db):
    """404 would confirm which numbers are registered."""
    assert (await login(client, "9999999999")).status_code == 401


# --------------------------------------------------------------------------
# merged passwords
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_carried_over_password_signs_in_and_is_promoted(client, db):
    user = User(
        username="merged",
        email="merged@example.com",
        emails=["merged@example.com"],
        hashed_password=get_password_hash(PASSWORD),
        legacy_hashes=[
            LegacyHash(
                hashed_password=get_password_hash(OLD_PASSWORD),
                source_db="walle_lpcl",
                legacy_user_id=PydanticObjectId(),
            )
        ],
    )
    await user.insert()

    assert (await login(client, "merged@example.com", OLD_PASSWORD)).status_code == 200

    stored = await User.get(user.id)
    assert stored.legacy_hashes == []
    assert verify_password(OLD_PASSWORD, stored.hashed_password)
    # The window closes on first use: the other password stops working.
    assert not verify_password(PASSWORD, stored.hashed_password)


@pytest.mark.asyncio
async def test_a_disabled_account_cannot_promote_a_password(client, db):
    """The active check must come first, or a disabled account rewrites its hash."""
    user = User(
        username="disabled",
        email="disabled@example.com",
        emails=["disabled@example.com"],
        is_active=False,
        hashed_password=None,
        legacy_hashes=[
            LegacyHash(
                hashed_password=get_password_hash(OLD_PASSWORD),
                source_db="walle_lpcl",
                legacy_user_id=PydanticObjectId(),
            )
        ],
    )
    await user.insert()

    assert (
        await login(client, "disabled@example.com", OLD_PASSWORD)
    ).status_code == 403

    stored = await User.get(user.id)
    assert len(stored.legacy_hashes) == 1


# --------------------------------------------------------------------------
# ambiguous usernames
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ambiguous_username_gets_a_structured_409(client, db):
    for i in (1, 2):
        await User(
            username="rahul",
            email=f"rahul{i}@example.com",
            emails=[f"rahul{i}@example.com"],
            hashed_password=get_password_hash(PASSWORD),
        ).insert()

    resp = await login(client, "rahul")

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "ambiguous_identifier"
    # extractErrorMessage renders `message`, so this reaches the user as a
    # sentence rather than as raw JSON.
    assert "mobile" in detail["message"].lower()


# --------------------------------------------------------------------------
# token subject
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tokens_are_issued_against_the_user_id(client, legacy_user):
    from jose import jwt

    from config.settings import get_settings

    token = (await login(client, "rahul")).json()["access_token"]
    settings = get_settings()
    claims = jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )

    assert claims["sub"] == str(legacy_user.id)
    assert claims[SUBJECT_KIND_CLAIM] == SUBJECT_KIND_USER_ID


@pytest.mark.asyncio
async def test_a_token_minted_before_this_shipped_still_resolves(db, legacy_user):
    """Dropping the username branch now would sign out every live session."""
    assert (await resolve_token_subject("rahul")).id == legacy_user.id


@pytest.mark.asyncio
async def test_an_ambiguous_username_subject_resolves_to_nobody(db):
    for i in (1, 2):
        await User(
            username="rahul",
            email=f"rahul{i}@example.com",
            hashed_password=get_password_hash(PASSWORD),
        ).insert()

    assert await resolve_token_subject("rahul") is None


@pytest.mark.asyncio
async def test_me_works_with_an_id_subject(client, legacy_user):
    token = create_access_token(data=subject_claims(legacy_user))
    resp = await client.get(
        "/api/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 200
    assert resp.json()["username"] == "rahul"


@pytest.mark.asyncio
async def test_me_still_works_with_a_username_subject(client, legacy_user):
    token = create_access_token(data={"sub": "rahul"})
    resp = await client.get(
        "/api/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_an_unknown_subject_is_rejected(client, db):
    token = create_access_token(
        data={
            "sub": str(PydanticObjectId()),
            SUBJECT_KIND_CLAIM: SUBJECT_KIND_USER_ID,
        }
    )
    resp = await client.get(
        "/api/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_a_username_spelling_another_accounts_id_cannot_borrow_it(db):
    """Registration accepts any username, including another account's id.

    A token minted for that username before the subject claim existed carries
    the id string in `sub`, and must not open the account the id belongs to.
    """
    victim = User(
        username="victim",
        email="victim@example.com",
        hashed_password=get_password_hash(PASSWORD),
    )
    await victim.insert()
    await User(
        username=str(victim.id),
        email="lookalike@example.com",
        hashed_password=get_password_hash(PASSWORD),
    ).insert()

    assert await resolve_token_subject(str(victim.id)) is None


@pytest.mark.asyncio
async def test_an_id_subject_is_never_read_as_a_username(db, legacy_user):
    await User(
        username=str(legacy_user.id),
        email="lookalike@example.com",
        hashed_password=get_password_hash(PASSWORD),
    ).insert()

    found = await resolve_token_subject(str(legacy_user.id), SUBJECT_KIND_USER_ID)
    assert found.id == legacy_user.id
    assert await resolve_token_subject("rahul", SUBJECT_KIND_USER_ID) is None


async def refresh_with(client, user, claims):
    token = create_refresh_token(data=claims)
    await RefreshToken(
        user_id=user.id, token=token, expires_at=datetime.utcnow() + timedelta(days=7)
    ).insert()
    return await client.post("/api/auth/refresh", params={"refresh_token": token})


@pytest.mark.asyncio
async def test_a_claimless_id_session_recovers_through_refresh(client, legacy_user):
    """Sessions minted by the interim build carry an id and no claim.

    Their access tokens are refused, so they must still be able to refresh --
    from the stored record -- into a token that is accepted.
    """
    resp = await refresh_with(client, legacy_user, {"sub": str(legacy_user.id)})
    assert resp.status_code == 200

    me = await client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {resp.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == "rahul"


@pytest.mark.asyncio
async def test_a_username_session_still_refreshes(client, legacy_user):
    resp = await refresh_with(client, legacy_user, {"sub": "rahul"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_refresh_resolves_from_the_stored_record_not_the_subject(
    client, legacy_user
):
    """The record says whose token it is, whatever its subject names."""
    other = User(
        username="other",
        email="other@example.com",
        hashed_password=get_password_hash(PASSWORD),
    )
    await other.insert()

    resp = await refresh_with(client, legacy_user, {"sub": "other"})
    me = await client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {resp.json()['access_token']}"},
    )
    assert me.json()["username"] == "rahul"


# --------------------------------------------------------------------------
# setting a password retires the carried-over ones
# --------------------------------------------------------------------------


async def user_with_carried_over_password(mobile="9876543210"):
    user = User(
        username="merged",
        email="merged@example.com",
        mobile=mobile,
        hashed_password=get_password_hash(PASSWORD),
        legacy_hashes=[
            LegacyHash(
                source_db="lpcl",
                legacy_user_id=PydanticObjectId(),
                hashed_password=get_password_hash(OLD_PASSWORD),
            )
        ],
    )
    await user.insert()
    return user


@pytest.mark.asyncio
async def test_changing_the_password_retires_carried_over_ones(client, db):
    user = await user_with_carried_over_password()
    token = create_access_token(data=subject_claims(user))

    resp = await client.post(
        "/api/auth/change-password",
        json={
            "current_password": PASSWORD,
            "new_password": "BrandNew1",
            "confirm_password": "BrandNew1",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    assert (await login(client, "merged", OLD_PASSWORD)).status_code == 401
    assert (await login(client, "merged", "BrandNew1")).status_code == 200


@pytest.fixture
def sms(monkeypatch):
    """Stands in for 2Factor and records every number a code is sent to."""
    sent = []

    async def fake_send(phone):
        sent.append(phone)
        return True, f"provider-session-{len(sent)}", None

    async def fake_verify(provider_session_id, otp):
        return otp == "123456", None

    monkeypatch.setattr(password_reset, "send_otp_autogen", fake_send)
    monkeypatch.setattr(password_reset, "provider_verify_otp", fake_verify)
    return sent


@pytest.mark.asyncio
async def test_a_reset_retires_carried_over_passwords(client, db, sms):
    user = await user_with_carried_over_password()

    await password_reset.start_session("9876543210")
    token, _ = await password_reset.verify_otp_and_issue_token("9876543210", "123456")
    await password_reset.reset_password(token, "BrandNew1")

    assert (await User.get(user.id)).legacy_hashes == []
    assert (await login(client, "merged", OLD_PASSWORD)).status_code == 401
    assert (await login(client, "merged", "BrandNew1")).status_code == 200


# --------------------------------------------------------------------------
# password reset is decided by the number, never by a username
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_reset_never_reaches_an_account_by_its_username(db, sms):
    """Whoever owns 9876543210 must not be able to reset the account named so.

    The code is sent to the number typed, so a username fallback would bind
    one person's reset to a stranger's phone.
    """
    named = User(
        username="9876543210",
        email="named@example.com",
        mobile="9123456789",
        hashed_password=get_password_hash(PASSWORD),
    )
    await named.insert()

    await password_reset.start_session("9876543210")

    assert sms == []
    assert await PasswordResetSession.find_all().to_list() == []


@pytest.mark.asyncio
async def test_a_reset_reaches_the_holder_of_the_number(db, sms, legacy_user):
    await password_reset.start_session("+91 98765 43210")

    session = await PasswordResetSession.find_one()
    assert session.user_id == legacy_user.id
    assert sms == ["+91 98765 43210"]


@pytest.mark.asyncio
async def test_a_reset_prefers_the_exact_number_over_an_inferred_one(db, sms):
    """The same phone stored two ways on two accounts: the exact form wins."""
    exact = User(
        username="exact",
        email="exact@example.com",
        mobile="919876543210",
        hashed_password=get_password_hash(PASSWORD),
    )
    await exact.insert()
    await User(
        username="short",
        email="short@example.com",
        mobile="9876543210",
        hashed_password=get_password_hash(PASSWORD),
    ).insert()

    await password_reset.start_session("919876543210")

    assert (await PasswordResetSession.find_one()).user_id == exact.id


# --------------------------------------------------------------------------
# registration writes the new shape
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_registration_populates_the_identity_arrays(client, db):
    resp = await client.post(
        "/api/auth/register",
        data={
            "username": "newplayer",
            "email": "new@example.com",
            "password": "NewPass123",
            "mobile": "9876500001",
        },
    )
    assert resp.status_code == 201

    user = await User.find_one(User.username == "newplayer")
    assert user.emails == ["new@example.com"]
    assert user.mobiles == ["9876500001"]
