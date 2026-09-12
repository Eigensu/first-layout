"""tournament_id: the field, the scoped() helper, and per-tournament settings.

Nothing in the app filters on tournament_id yet -- the field is added ahead of
the backfill, so the routes keep behaving exactly as before (see
app/utils/tenant.py for why the two cannot land together). These tests cover
the foundation rather than any route.
"""

import pytest
import pytest_asyncio
from beanie import PydanticObjectId

from app.models.admin.audit_log import AdminActionLog
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.carousel import CarouselImage
from app.models.contest import Contest
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from app.models.settings import PLATFORM_DEFAULTS_ID, GlobalSettings
from app.models.sponsor import Sponsor
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.user import RefreshToken, User, UserProfile
from app.utils.tenant import scoped, scoped_one, tenant_filter

# Every collection that belongs to exactly one tournament. A new tenant model
# added without tournament_id fails here rather than silently becoming visible
# to every tournament at once.
TENANT_MODELS = [
    Contest,
    Team,
    TeamContestEnrollment,
    AdminPlayer,
    PublicPlayer,
    Slot,
    PlayerContestPoints,
    Sponsor,
    CarouselImage,
    ImportLog,
    AdminActionLog,
]

# Shared by every tournament; must NOT grow a tournament_id.
GLOBAL_MODELS = [User, RefreshToken, UserProfile, Tournament]

TOURNAMENT_A = PydanticObjectId()
TOURNAMENT_B = PydanticObjectId()


@pytest.mark.parametrize("model", TENANT_MODELS, ids=lambda m: m.__name__)
def test_tenant_models_carry_tournament_id(model):
    assert "tournament_id" in model.model_fields, (
        f"{model.__name__} is tenant-scoped but has no tournament_id; "
        "it would be visible to every tournament at once"
    )


@pytest.mark.parametrize("model", TENANT_MODELS, ids=lambda m: m.__name__)
def test_tournament_id_defaults_to_none_until_the_backfill(model):
    """Required would break every live row, none of which has the field yet."""
    assert model.model_fields["tournament_id"].default is None


@pytest.mark.parametrize("model", GLOBAL_MODELS, ids=lambda m: m.__name__)
def test_global_models_have_no_tournament_id(model):
    assert "tournament_id" not in model.model_fields


@pytest.mark.parametrize("model", TENANT_MODELS, ids=lambda m: m.__name__)
def test_tenant_models_index_tournament_id(model):
    """Without the index, every scoped() query is a collection scan."""
    assert "tournament_id" in model.Settings.indexes


@pytest_asyncio.fixture
async def teams(db):
    """One team in tournament A, one in B, one written before the backfill."""
    a = Team(user_id=PydanticObjectId(), team_name="A team", tournament_id=TOURNAMENT_A)
    b = Team(user_id=PydanticObjectId(), team_name="B team", tournament_id=TOURNAMENT_B)
    legacy = Team(user_id=PydanticObjectId(), team_name="Pre-backfill team")
    for t in (a, b, legacy):
        await t.insert()
    return a, b, legacy


@pytest.mark.asyncio
async def test_scoped_returns_only_that_tournament(teams):
    a, b, legacy = teams

    found = await scoped(Team, TOURNAMENT_A).to_list()

    assert [t.team_name for t in found] == ["A team"]
    assert b.id not in {t.id for t in found}
    assert legacy.id not in {t.id for t in found}


@pytest.mark.asyncio
async def test_scoped_isolates_the_other_tournament(teams):
    found = await scoped(Team, TOURNAMENT_B).to_list()
    assert [t.team_name for t in found] == ["B team"]


@pytest.mark.asyncio
async def test_scoped_one_takes_extra_expressions(teams):
    found = await scoped_one(Team, TOURNAMENT_A, Team.team_name == "A team")
    assert found is not None

    # The same name under a tournament that does not own it must not resolve.
    assert await scoped_one(Team, TOURNAMENT_B, Team.team_name == "A team") is None


@pytest.mark.asyncio
async def test_unscoped_find_still_sees_everything(teams):
    """States the risk plainly: the filter is the only thing separating tenants.

    This is what a route that forgets scoped() does, and why the helper exists.
    """
    assert len(await Team.find_all().to_list()) == 3


def test_tenant_filter_is_the_raw_mongo_shape():
    assert tenant_filter(TOURNAMENT_A) == {"tournament_id": TOURNAMENT_A}


def test_contest_code_is_unique_per_tournament():
    """Two tournaments should each be able to run a contest called FINAL.

    Asserted against the declared index rather than by inserting: the legacy
    global unique index on `code` is still in place and still wins until the
    migration drops it, so the behaviour cannot be exercised yet -- but the
    index that replaces it must be declared, or the migration has nothing to
    fall back to.
    """
    named = {
        getattr(idx, "document", {}).get("name"): idx
        for idx in Contest.Settings.indexes
        if hasattr(idx, "document")
    }
    index = named.get("uniq_contest_code_per_tournament")
    assert index is not None, "the per-tournament contest code index is missing"
    assert index.document["unique"] is True
    assert list(index.document["key"].items()) == [("tournament_id", 1), ("code", 1)]


@pytest.mark.asyncio
async def test_settings_fall_back_to_the_platform_default(db):
    platform = await GlobalSettings.get_instance()
    platform.max_players_per_team = 5
    await platform.save()

    resolved = await GlobalSettings.get_for_tournament(TOURNAMENT_A)

    assert resolved.id == PLATFORM_DEFAULTS_ID
    assert resolved.max_players_per_team == 5


@pytest.mark.asyncio
async def test_a_tournaments_own_settings_win(db):
    platform = await GlobalSettings.get_instance()
    platform.max_players_per_team = 5
    await platform.save()

    await GlobalSettings(
        id="settings-a", tournament_id=TOURNAMENT_A, max_players_per_team=9
    ).insert()

    assert (
        await GlobalSettings.get_for_tournament(TOURNAMENT_A)
    ).max_players_per_team == 9
    # B has no row of its own and keeps tracking the platform default.
    assert (
        await GlobalSettings.get_for_tournament(TOURNAMENT_B)
    ).max_players_per_team == 5


@pytest.mark.asyncio
async def test_get_instance_still_works_for_existing_callers(db):
    """team_composition and auction still call this; it must not change."""
    instance = await GlobalSettings.get_instance()
    assert instance.id == PLATFORM_DEFAULTS_ID
    assert instance.tournament_id is None
