import pytest

from app.models.user import User
from app.services.auth.apple import AppleTokenError


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
