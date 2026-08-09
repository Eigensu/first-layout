import pytest

from app.models.user import User
from app.services.auth.google import GoogleTokenError


def _fake_payload(**overrides):
    payload = {
        "sub": "google-sub-123",
        "email": "newuser@example.com",
        "email_verified": True,
        "name": "New User",
        "picture": "https://example.com/avatar.png",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_creates_new_user_when_email_unknown(anon_client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.auth.verify_google_id_token", lambda token: _fake_payload()
    )

    resp = await anon_client.post("/api/auth/google", json={"id_token": "fake"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]

    user = await User.find_one(User.email == "newuser@example.com")
    assert user is not None
    assert user.google_id == "google-sub-123"
    assert user.auth_provider == "google"
    assert user.hashed_password is None
    assert user.is_verified is True


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

    monkeypatch.setattr(
        "app.routes.auth.verify_google_id_token",
        lambda token: _fake_payload(sub="google-sub-456", email="existing@example.com"),
    )

    resp = await anon_client.post("/api/auth/google", json={"id_token": "fake"})

    assert resp.status_code == 200

    matches = await User.find(User.email == "existing@example.com").to_list()
    assert len(matches) == 1
    linked = matches[0]
    assert linked.google_id == "google-sub-456"
    assert linked.hashed_password == "some-real-hash"  # password login still works
    assert linked.is_verified is True


@pytest.mark.asyncio
async def test_rejects_invalid_token(anon_client, monkeypatch):
    def _raise(token):
        raise GoogleTokenError("Token expired")

    monkeypatch.setattr("app.routes.auth.verify_google_id_token", _raise)

    resp = await anon_client.post("/api/auth/google", json={"id_token": "bad"})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Token expired"


@pytest.mark.asyncio
async def test_rejects_disabled_user(anon_client, monkeypatch):
    existing = User(
        username="disableduser",
        email="disabled@example.com",
        google_id="google-sub-789",
        auth_provider="google",
        is_active=False,
        is_verified=True,
    )
    await existing.insert()

    monkeypatch.setattr(
        "app.routes.auth.verify_google_id_token",
        lambda token: _fake_payload(sub="google-sub-789", email="disabled@example.com"),
    )

    resp = await anon_client.post("/api/auth/google", json={"id_token": "fake"})

    assert resp.status_code == 403
