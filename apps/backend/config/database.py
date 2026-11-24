import logging
from typing import Optional

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.models.admin.audit_log import AdminActionLog
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.carousel import CarouselImage
from app.models.contest import Contest
from app.models.cricheroes import (
    CricHeroesCallCount,
    CricHeroesMatchMvp,
    CricHeroesSnapshot,
)
from app.models.password_reset import PasswordResetSession, PasswordResetToken
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from app.models.rate_limit import RateLimitCounter
from app.models.settings import GlobalSettings
from app.models.sponsor import Sponsor
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.tournament_membership import TournamentMembership
from app.models.user import RefreshToken, User, UserProfile
from config.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# MongoDB client
client: Optional[AsyncIOMotorClient] = None

# Indexes that shipped with a wrong definition, as (collection, name, the
# partial filter they were built with). init_beanie never drops an index, so a
# wrong one outlives its correction -- and MongoDB refuses to redefine one under
# the same name, so a corrected definition would stop the service from
# starting. Each is dropped here -- only while it still has that filter -- and
# init_beanie then builds the corrected one. Once dropped, the check finds
# nothing and does nothing.
FLAWED_INDEXES = [
    # $exists matches null, so this took in every membership the app creates
    # and refused the second (docs/UNIFIED_AUTH_SPEC.md §13.8, R21). Built on
    # Dcpl and rspl while their collections were still empty.
    (
        "tournament_memberships",
        "uniq_legacy_row",
        {"legacy_user_id": {"$exists": True}},
    ),
    # Sponsor priority unique across every tournament, so one database cannot
    # hold two tournaments' priority-3 sponsors (spec §13.11, R38). Its
    # filter was right; its keys lacked tournament_id. The corrected index has
    # its own name, uniq_sponsor_priority_per_tournament.
    (
        "sponsors",
        "featured_1_priority_1",
        {"priority": {"$gt": 0}},
    ),
]


async def drop_flawed_indexes(database) -> list:
    """Drop each FLAWED_INDEXES entry still built with its wrong filter."""
    dropped = []
    for collection, name, wrong_filter in FLAWED_INDEXES:
        existing = (await database[collection].index_information()).get(name)
        if existing and existing.get("partialFilterExpression") == wrong_filter:
            await database[collection].drop_index(name)
            dropped.append(f"{collection}.{name}")
    return dropped


async def connect_to_mongo():
    """Connect to MongoDB and initialize Beanie ODM"""
    global client

    try:
        # Create MongoDB client
        client = AsyncIOMotorClient(settings.mongodb_url)
        mongo_client = client

        # Test connection
        await mongo_client.admin.command("ping")
        logger.info("Connected to MongoDB at %s", settings.mongodb_url_redacted)

        database = mongo_client.get_database(settings.mongodb_db_name)
        for index in await drop_flawed_indexes(database):
            logger.info("Dropped index %s, built with a wrong definition", index)

        # Initialize Beanie with document models
        await init_beanie(
            database=database,
            document_models=[
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
                TournamentMembership,
                RateLimitCounter,
                CricHeroesCallCount,
                CricHeroesSnapshot,
                CricHeroesMatchMvp,
            ],
        )
        logger.info(
            "Initialized Beanie ODM with database: %s", settings.mongodb_db_name
        )

    except Exception:
        logger.exception("Failed to connect to MongoDB")
        raise


async def close_mongo_connection():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        client = None
        logger.info("Closed MongoDB connection")


def get_database():
    """Get MongoDB database instance"""
    mongo_client = client
    if mongo_client is None:
        raise RuntimeError("Database not initialized. Call connect_to_mongo() first.")
    return mongo_client.get_database(settings.mongodb_db_name)
