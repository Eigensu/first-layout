"""A service whose TENANCY disagrees with its database refuses to start."""

import pytest
from beanie import PydanticObjectId

from app.models.admin.player import Player as AdminPlayer
from app.models.settings import GlobalSettings
from app.models.team import Team
from config.settings import settings
from config.startup_checks import assert_tenancy_matches_data

TOURNAMENT = PydanticObjectId()


@pytest.fixture(params=["single", "shared"])
def tenancy(request, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", request.param)
    return request.param


async def test_an_empty_database_starts_either_way(db, tenancy):
    await assert_tenancy_matches_data()


async def test_a_legacy_database_starts_single(db, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "single")
    await AdminPlayer(name="untagged", team="XI").insert()
    await Team(user_id=PydanticObjectId(), team_name="untagged").insert()

    await assert_tenancy_matches_data()


async def test_the_unified_database_starts_shared(db, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")
    await AdminPlayer(tournament_id=TOURNAMENT, name="tagged", team="XI").insert()
    await Team(
        tournament_id=TOURNAMENT, user_id=PydanticObjectId(), team_name="tagged"
    ).insert()
    # The platform default stays untagged on the unified database too.
    await GlobalSettings.get_instance()

    await assert_tenancy_matches_data()


async def test_single_refuses_the_unified_database(db, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "single")
    await AdminPlayer(name="untagged", team="XI").insert()
    await Team(
        tournament_id=TOURNAMENT, user_id=PydanticObjectId(), team_name="tagged"
    ).insert()

    with pytest.raises(RuntimeError, match="TENANCY=single.*teams.*TENANCY=shared"):
        await assert_tenancy_matches_data()


async def test_shared_refuses_untagged_documents(db, monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")
    await AdminPlayer(tournament_id=TOURNAMENT, name="tagged", team="XI").insert()
    await AdminPlayer(name="missed by the backfill", team="XI").insert()

    with pytest.raises(RuntimeError, match="TENANCY=shared.*players.*no tournament_id"):
        await assert_tenancy_matches_data()


async def test_a_field_absent_altogether_counts_as_untagged(db, monkeypatch):
    """Legacy documents lack the field rather than hold null."""
    monkeypatch.setattr(settings, "tenancy", "shared")
    await Team.get_motor_collection().insert_one({"team_name": "pre-field"})

    with pytest.raises(RuntimeError, match="teams"):
        await assert_tenancy_matches_data()
