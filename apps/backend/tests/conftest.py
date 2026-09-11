import os

# Must be set before any import that touches config.settings (Settings() is
# instantiated at import time in config/settings.py).
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use-0000")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-not-for-production-00000")

import pytest
import pytest_asyncio
from beanie import init_beanie
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.models.admin.audit_log import AdminActionLog
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.carousel import CarouselImage
from app.models.contest import Contest
from app.models.password_reset import PasswordResetSession, PasswordResetToken
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from app.models.settings import GlobalSettings
from app.models.sponsor import Sponsor
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.user import RefreshToken, User, UserProfile
from app.utils.dependencies import get_admin_user

DOCUMENT_MODELS = [
    User,
    RefreshToken,
    UserProfile,
    Sponsor,
    CarouselImage,
    Team,
    AdminPlayer,
    PublicPlayer,
    PlayerContestPoints,
    Slot,
    ImportLog,
    AdminActionLog,
    Contest,
    TeamContestEnrollment,
    PasswordResetSession,
    PasswordResetToken,
    GlobalSettings,
    Tournament,
]


# mongomock ignores partialFilterExpression and applies a unique index to every
# document, so User's uniq_mobile would collide on the shared null of any two
# accounts without a mobile -- which real MongoDB excludes from the index
# entirely. Drop it for tests rather than forcing every fixture to invent a
# distinct number. The routes' DuplicateKeyError handling is covered directly in
# tests/test_users_patch_me.py.
_UNEMULATED_INDEXES = {"uniq_mobile"}


@pytest_asyncio.fixture
async def db():
    """Fresh in-memory MongoDB (via mongomock) and Beanie init per test."""
    original = list(User.Settings.indexes)
    User.Settings.indexes = [
        idx
        for idx in original
        if getattr(idx, "document", {}).get("name") not in _UNEMULATED_INDEXES
    ]
    client = AsyncMongoMockClient()
    try:
        await init_beanie(database=client["test-db"], document_models=DOCUMENT_MODELS)
        yield client
    finally:
        User.Settings.indexes = original


@pytest.fixture
def admin_user():
    return User(
        username="test-admin",
        email="admin@example.com",
        hashed_password="not-a-real-hash",
        is_admin=True,
        is_active=True,
        is_verified=True,
    )


@pytest_asyncio.fixture
async def client(db, admin_user):
    """HTTP client for the FastAPI app with admin auth pre-authorized.

    Uses a bare ASGI transport (no lifespan events), so main.py's real
    connect_to_mongo() never runs — Beanie is already wired to the mock
    client via the `db` fixture by the time any route executes.
    """
    from main import app

    async def _fake_admin_user():
        return admin_user

    app.dependency_overrides[get_admin_user] = _fake_admin_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_admin_user, None)


@pytest_asyncio.fixture
async def anon_client(db):
    """HTTP client with no auth override — for testing public routes and
    the admin auth gate itself."""
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
