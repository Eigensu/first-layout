import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.models.user import User
from app.utils.dependencies import get_current_active_user


@pytest_asyncio.fixture
async def google_user(db):
    """A Google-signup account, which by definition lands with no mobile."""
    user = User(
        username="googleuser",
        email="googleuser@example.com",
        auth_provider="google",
        google_id="google-sub-123",
        hashed_password=None,
        is_verified=True,
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def user_client(db, google_user):
    """HTTP client authenticated as google_user (not an admin)."""
    from main import app

    async def _fake_current_user():
        return google_user

    app.dependency_overrides[get_current_active_user] = _fake_current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


@pytest.mark.asyncio
async def test_patch_sets_mobile_for_google_account(user_client, google_user):
    assert google_user.mobile is None

    resp = await user_client.patch("/api/users/me", json={"mobile": "+91 98765 43210"})

    assert resp.status_code == 200
    body = resp.json()
    # Stored digits-only so the signup collision check can still see it
    assert body["mobile"] == "919876543210"
    assert body["auth_provider"] == "google"

    stored = await User.get(google_user.id)
    assert stored.mobile == "919876543210"


@pytest.mark.asyncio
async def test_patch_rejects_mobile_held_by_another_account(user_client):
    other = User(
        username="other",
        email="other@example.com",
        mobile="9876543210",
        hashed_password="not-a-real-hash",
    )
    await other.insert()

    # Same number, different formatting -- an exact-string check would miss it
    resp = await user_client.patch("/api/users/me", json={"mobile": "98765-43210"})

    assert resp.status_code == 409
    assert "already linked" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_patch_allows_resaving_own_mobile(user_client, google_user):
    google_user.mobile = "9876543210"
    await google_user.save()

    resp = await user_client.patch("/api/users/me", json={"mobile": "9876543210"})

    assert resp.status_code == 200
    assert resp.json()["mobile"] == "9876543210"


@pytest.mark.asyncio
async def test_patch_rejects_mobile_outside_digit_range(user_client):
    assert (
        await user_client.patch("/api/users/me", json={"mobile": "12345"})
    ).status_code == 422
    assert (
        await user_client.patch("/api/users/me", json={"mobile": "1234567890123456"})
    ).status_code == 422


@pytest.mark.asyncio
async def test_patch_full_name_leaves_mobile_untouched(user_client, google_user):
    google_user.mobile = "9876543210"
    await google_user.save()

    resp = await user_client.patch("/api/users/me", json={"full_name": "  New Name  "})

    assert resp.status_code == 200
    body = resp.json()
    assert body["full_name"] == "New Name"
    assert body["mobile"] == "9876543210"


@pytest.mark.asyncio
async def test_get_me_exposes_auth_provider(user_client):
    resp = await user_client.get("/api/users/me")

    assert resp.status_code == 200
    assert resp.json()["auth_provider"] == "google"
