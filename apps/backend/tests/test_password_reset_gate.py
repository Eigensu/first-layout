"""The unauthenticated password-reset endpoint must stay gone.

POST /api/auth/reset-password-mobile accepted {mobile, new_password} and set the
password with no OTP, no token and no authentication, so knowing a registered
number was enough to take the account over. It was removed in favour of the
OTP flow that already existed at /api/auth/forgot-password/*.

These tests exist so a merge or a revert cannot quietly bring it back.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.models.user import User
from app.utils.security import get_password_hash, verify_password

ORIGINAL_PASSWORD = "OriginalPass1"
ATTACKER_PASSWORD = "AttackerPass1"


@pytest_asyncio.fixture
async def victim(db):
    user = User(
        username="victim",
        email="victim@example.com",
        mobile="9876543210",
        hashed_password=get_password_hash(ORIGINAL_PASSWORD),
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def client(db):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_reset_password_by_mobile_endpoint_is_gone(client, victim):
    resp = await client.post(
        "/api/auth/reset-password-mobile",
        json={"mobile": "9876543210", "new_password": ATTACKER_PASSWORD},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_knowing_a_mobile_cannot_change_a_password(client, victim):
    """The property that actually matters, stated independently of any one route.

    Walks the app's actual route table instead of guessing paths, so this still
    fails if the same unauthenticated {mobile, new_password} takeover returns
    under a different path or verb on any /api/auth/* route.
    """
    from main import app

    payload = {"mobile": "9876543210", "new_password": ATTACKER_PASSWORD}
    unsafe_methods = {"POST", "PUT", "PATCH", "DELETE"}

    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/auth") or "{" in path:
            continue
        for method in getattr(route, "methods", set()) & unsafe_methods:
            await client.request(method, path, json=payload)

    stored = await User.get(victim.id)
    assert verify_password(ORIGINAL_PASSWORD, stored.hashed_password)
    assert not verify_password(ATTACKER_PASSWORD, stored.hashed_password)


@pytest.mark.asyncio
async def test_schema_is_gone_too():
    """The route is the vulnerability, but a stranded schema invites its return."""
    import app.schemas.auth as auth_schemas

    assert not hasattr(auth_schemas, "ResetPasswordByMobile")


@pytest.mark.asyncio
async def test_otp_reset_flow_is_still_mounted(client):
    """The supported replacement must still be routed.

    A 404 here would mean the app has no password reset at all, which is the
    one outcome worse than the endpoint this change removed.
    """
    resp = await client.post(
        "/api/auth/forgot-password/request", json={"phone": "9876543210"}
    )
    assert resp.status_code == 200
    # Generic by design: the response must not reveal whether the number exists.
    assert "OTP" in resp.json()["message"]
