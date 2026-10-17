import pytest

from app.models.user import User
from app.services.auth.apple import AppleTokenError
from app.utils.dependencies import subject_claims
from app.utils.security import create_access_token


def _fake_payload(**overrides):
    payload = {
        "sub": "apple-sub-123",
        "email": "newuser@example.com",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_creates_new_user_when_email_unknown(anon_client, monkeypatch):
    async def _verify(token):
        return _fake_payload()

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post(
        "/api/auth/apple",
        json={"identity_token": "fake", "full_name": "New User"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]

    user = await User.find_one(User.email == "newuser@example.com")
    assert user is not None
    assert user.apple_id == "apple-sub-123"
    assert user.auth_provider == "apple"
    assert user.hashed_password is None
    assert user.is_verified is True
    assert user.full_name == "New User"


@pytest.mark.asyncio
async def test_links_existing_password_account_by_email(anon_client, monkeypatch):
    existing = User(
        username="existinguser",
        email="existing@example.com",
        hashed_password="some-real-hash",
        auth_provider="password",
        is_verified=False,
    )
    await existing.insert()

    async def _verify(token):
        return _fake_payload(sub="apple-sub-456", email="existing@example.com")

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "fake"})

    assert resp.status_code == 200

    matches = await User.find(User.email == "existing@example.com").to_list()
    assert len(matches) == 1
    linked = matches[0]
    assert linked.apple_id == "apple-sub-456"
    assert linked.hashed_password == "some-real-hash"  # password login still works
    assert linked.is_verified is True


@pytest.mark.asyncio
async def test_missing_email_falls_back_to_placeholder(anon_client, monkeypatch):
    """Apple's native flow always includes email with the right scopes, but
    the fallback must not crash or collide with the unique email index."""

    async def _verify(token):
        return _fake_payload(sub="apple-sub-noemail", email=None)

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "fake"})

    assert resp.status_code == 200

    user = await User.find_one(User.apple_id == "apple-sub-noemail")
    assert user is not None
    assert user.email == "apple-sub-noemail@apple.private"


@pytest.mark.asyncio
async def test_rejects_invalid_token(anon_client, monkeypatch):
    async def _raise(token):
        raise AppleTokenError("Token expired")

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _raise)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "bad"})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Token expired"


@pytest.mark.asyncio
async def test_rejects_disabled_user(anon_client, monkeypatch):
    existing = User(
        username="disableduser",
        email="disabled@example.com",
        apple_id="apple-sub-789",
        auth_provider="apple",
        is_active=False,
        is_verified=True,
    )
    await existing.insert()

    async def _verify(token):
        return _fake_payload(sub="apple-sub-789", email="disabled@example.com")

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "fake"})

    assert resp.status_code == 403


async def _apple_only_user():
    user = User(
        username="appleuser",
        email="appleuser@privaterelay.appleid.com",
        emails=["appleuser@privaterelay.appleid.com"],
        apple_id="apple-sub-123",
        apple_ids=["apple-sub-123"],
        hashed_password=None,
        auth_provider="apple",
    )
    await user.insert()
    return user


def _signed_in(user):
    token = create_access_token(data=subject_claims(user))
    return {"Authorization": f"Bearer {token}"}


async def _delete(client, user, body):
    return await client.request(
        "DELETE", "/api/users/me", json=body, headers=_signed_in(user)
    )


@pytest.mark.asyncio
async def test_an_apple_only_account_can_delete_itself(anon_client, monkeypatch):
    """The App Store requires it, and Apple accounts have nothing else to offer."""
    user = await _apple_only_user()

    async def _verify(token):
        return _fake_payload(sub="apple-sub-123")

    monkeypatch.setattr("app.routes.users.verify_apple_identity_token", _verify)

    resp = await _delete(anon_client, user, {"apple_identity_token": "fresh"})

    assert resp.status_code == 200
    assert (await User.get(user.id)).is_active is False


@pytest.mark.asyncio
async def test_deleting_needs_a_fresh_apple_sign_in(anon_client):
    user = await _apple_only_user()

    resp = await _delete(anon_client, user, {})

    assert resp.status_code == 401
    assert "Apple" in resp.json()["detail"]
    assert (await User.get(user.id)).is_active is True


@pytest.mark.asyncio
async def test_another_apple_account_cannot_delete_this_one(anon_client, monkeypatch):
    user = await _apple_only_user()

    async def _verify(token):
        return _fake_payload(sub="apple-sub-someone-else")

    monkeypatch.setattr("app.routes.users.verify_apple_identity_token", _verify)

    resp = await _delete(anon_client, user, {"apple_identity_token": "fresh"})

    assert resp.status_code == 401
    assert (await User.get(user.id)).is_active is True


@pytest.mark.asyncio
async def test_a_google_only_account_still_deletes_with_google(
    anon_client, monkeypatch
):
    user = User(
        username="googleonly",
        email="googleonly@example.com",
        google_id="google-sub-1",
        google_ids=["google-sub-1"],
        hashed_password=None,
        auth_provider="google",
    )
    await user.insert()
    monkeypatch.setattr(
        "app.routes.users.verify_google_id_token",
        lambda token: {"sub": "google-sub-1"},
    )

    resp = await _delete(anon_client, user, {"google_id_token": "fresh"})

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_an_apple_email_held_by_another_account_does_not_block_sign_in(
    anon_client, monkeypatch
):
    user = await _apple_only_user()
    await User(
        username="holder",
        email="taken@example.com",
        emails=["taken@example.com"],
        hashed_password="some-real-hash",
    ).insert()

    async def _verify(token):
        return _fake_payload(sub="apple-sub-123", email="taken@example.com")

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "fake"})

    assert resp.status_code == 200
    assert (await User.get(user.id)).emails == ["appleuser@privaterelay.appleid.com"]


@pytest.mark.asyncio
async def test_apple_sign_in_tokens_carry_the_subject_claim(anon_client, monkeypatch):
    from jose import jwt

    from app.utils.dependencies import SUBJECT_KIND_CLAIM, SUBJECT_KIND_USER_ID
    from config.settings import get_settings

    async def _verify(token):
        return _fake_payload()

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)

    resp = await anon_client.post("/api/auth/apple", json={"identity_token": "fake"})
    settings = get_settings()
    claims = jwt.decode(
        resp.json()["access_token"],
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )

    assert claims[SUBJECT_KIND_CLAIM] == SUBJECT_KIND_USER_ID
