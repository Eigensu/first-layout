import os

# Must be set before any import that touches config.settings (Settings() is
# instantiated at import time in config/settings.py).
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use-0000")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-not-for-production-00000")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from app.models.user import User, RefreshToken, UserProfile
from app.models.sponsor import Sponsor
from app.models.carousel import CarouselImage
from app.models.team import Team
from app.models.contest import Contest
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.admin.import_log import ImportLog
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from app.models.password_reset import PasswordResetSession, PasswordResetToken
from app.models.settings import GlobalSettings
from app.models.tournament import Tournament
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
    Contest,
    TeamContestEnrollment,
    PasswordResetSession,
    PasswordResetToken,
    GlobalSettings,
    Tournament,
]


@pytest_asyncio.fixture
async def db():
    """Fresh in-memory MongoDB (via mongomock) and Beanie init per test."""
    client = AsyncMongoMockClient()
    await init_beanie(database=client["test-db"], document_models=DOCUMENT_MODELS)
    yield client


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
