"""The registry seed (spec §7, Source mapping), and the check that stops every
writing phase from treating a source database as the destination."""

import importlib
import re
import sys
from datetime import datetime
from types import SimpleNamespace

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.common.consts.index import RESERVED_SUBDOMAINS, TOURNAMENT_SLUG_PATTERN
from scripts.unified_auth.destination import refuse_source_as_destination

seed_registry = importlib.import_module("scripts.unified_auth.seed_registry")
phase3 = importlib.import_module("scripts.unified_auth.04_import_tenant_data")

NOW = datetime(2026, 10, 17, 12, 0)
DCPL_ID, RSPL_ID = ObjectId(), ObjectId()

# Phase 2's arguments, as spec §7 lists them.
SECTION_7_MAP = {
    "Dcpl": "dcpl",
    "rspl": "rspl",
    "walle_fantasy": "tpl-s11",
    "mwpl": "mwpl",
    "lodha-park": "lpcl",
    "melangeindia11": "m11",
    "mtc-intervillage": "mtc",
    "world_tower": "wtpl",
    "jypl": "jypl-s9",
    "cccl": "cccl",
    "mjpl": "mjpl",
    "tyrant": "tyrant",
    "jmcl": "jmcl",
    "epl": "epl",
    "jpl": "jpl",
}


def live_row(_id, slug, name, status="live"):
    return {
        "_id": _id,
        "slug": slug,
        "name": name,
        "description": None,
        "logo_url": None,
        "status": status,
        "start_at": None,
        "end_at": None,
        "primary_color": None,
        "secondary_color": None,
        "api_base_url": None,
        "created_at": datetime(2026, 8, 1, 9, 56),
        "updated_at": datetime(2026, 8, 1, 9, 56),
    }


@pytest.fixture
async def client():
    """Dcpl's registry as it is live: both tournaments, and an archived test one."""
    client = AsyncMongoMockClient()
    await client["Dcpl"]["tournaments"].insert_many(
        [
            live_row(DCPL_ID, "dcpl", "DPCL"),
            live_row(ObjectId(), "tests", "Tests", status="archived"),
            live_row(RSPL_ID, "rspl", "Reliance Surface Sankriti Premier League"),
        ]
    )
    return client


async def registry(dest):
    return {t["slug"]: t async for t in dest["tournaments"].find({})}


def test_the_mapping_is_section_7s():
    assert seed_registry.mapping() == SECTION_7_MAP


def test_every_slug_is_a_valid_subdomain():
    for slug in seed_registry.mapping().values():
        assert re.match(TOURNAMENT_SLUG_PATTERN, slug), slug
        assert slug not in RESERVED_SUBDOMAINS, slug


async def test_every_source_gets_a_row_and_the_test_tournament_none(client):
    dest = client["walle_arena"]

    outcomes = await seed_registry.seed(client, dest, apply=True, now=NOW)

    rows = await registry(dest)
    assert set(rows) == set(SECTION_7_MAP.values())
    assert set(outcomes.values()) == {"insert"}
    assert "tests" not in rows


async def test_the_live_tournaments_are_copied_under_their_own_ids(client):
    """Copied, not recreated: same _id, status and creation date. Only the
    name changes, to how each tournament's contests spell it."""
    dest = client["walle_arena"]

    await seed_registry.seed(client, dest, apply=True, now=NOW)

    rows = await registry(dest)
    assert rows["dcpl"]["_id"] == DCPL_ID
    assert rows["dcpl"]["name"] == "DCPL"
    assert rows["dcpl"]["status"] == "live"
    assert rows["dcpl"]["created_at"] == datetime(2026, 8, 1, 9, 56)
    assert rows["rspl"]["_id"] == RSPL_ID
    assert rows["rspl"]["name"] == "Reliance Surfaces Sanskriti Premier League"


async def test_the_retired_tournaments_are_archived_with_their_window(client):
    dest = client["walle_arena"]

    await seed_registry.seed(client, dest, apply=True, now=NOW)

    rows = await registry(dest)
    retired = [r for r in rows.values() if r["slug"] not in ("dcpl", "rspl")]
    assert len(retired) == 13
    assert {r["status"] for r in retired} == {"archived"}
    assert all(r["start_at"] <= r["end_at"] for r in retired)
    assert all(r["logo_url"] is None for r in retired)
    # Both WTPL seasons fall inside the one row.
    assert rows["wtpl"]["start_at"] == datetime(2025, 11, 7, 10, 30)
    assert rows["wtpl"]["end_at"] == datetime(2026, 3, 1, 17, 0)


async def test_a_second_run_changes_nothing(client):
    dest = client["walle_arena"]
    await seed_registry.seed(client, dest, apply=True, now=NOW)
    before = await registry(dest)

    outcomes = await seed_registry.seed(
        client, dest, apply=True, now=datetime(2026, 10, 18)
    )

    assert set(outcomes.values()) == {"unchanged"}
    assert await registry(dest) == before


async def test_a_row_that_drifted_is_rewritten_in_place(client):
    dest = client["walle_arena"]
    await seed_registry.seed(client, dest, apply=True, now=NOW)
    original_id = (await registry(dest))["mwpl"]["_id"]
    await dest["tournaments"].update_one(
        {"slug": "mwpl"}, {"$set": {"name": "Old name", "status": "live"}}
    )

    outcomes = await seed_registry.seed(client, dest, apply=True, now=NOW)

    row = (await registry(dest))["mwpl"]
    assert outcomes["mwpl"] == "update"
    assert (row["_id"], row["name"], row["status"]) == (original_id, "MWPL", "archived")


async def test_a_dry_run_writes_nothing(client):
    dest = client["walle_arena"]

    outcomes = await seed_registry.seed(client, dest, apply=False, now=NOW)

    assert set(outcomes.values()) == {"insert"}
    assert await dest["tournaments"].count_documents({}) == 0


async def test_a_live_tournament_missing_from_dcpl_stops_the_seed(client):
    await client["Dcpl"]["tournaments"].delete_one({"slug": "rspl"})

    with pytest.raises(SystemExit):
        await seed_registry.seed(client, client["walle_arena"], apply=True, now=NOW)


# --------------------------------------------------------------------------
# A source database is never the destination
# --------------------------------------------------------------------------


def test_a_source_database_is_refused_as_the_destination():
    with pytest.raises(SystemExit):
        refuse_source_as_destination("Dcpl", ["Dcpl", "rspl"])


def test_the_unified_database_is_accepted():
    refuse_source_as_destination("walle_arena", ["Dcpl", "rspl"])


async def test_the_seed_will_not_write_into_dcpl(client):
    """The root .env sets MONGODB_DB_NAME=Dcpl for the app."""
    with pytest.raises(SystemExit, match="is a source database"):
        await seed_registry.seed(client, client["Dcpl"], apply=True, now=NOW)

    assert await client["Dcpl"]["tournaments"].count_documents({}) == 3


async def test_phase_2_will_not_write_into_one_of_its_sources(monkeypatch):
    import config.settings

    phase2 = importlib.import_module("scripts.unified_auth.03_apply_merges")
    monkeypatch.setattr(
        config.settings,
        "get_settings",
        lambda: SimpleNamespace(mongodb_url="mongodb://unused", mongodb_db_name="Dcpl"),
    )
    monkeypatch.setattr(
        sys, "argv", ["03_apply_merges.py", "--map", "Dcpl=dcpl", "--apply"]
    )

    with pytest.raises(SystemExit, match="is a source database"):
        await phase2.main()


async def test_phase_3_will_not_import_a_database_into_itself(client):
    with pytest.raises(SystemExit, match="is a source database"):
        await phase3.import_tenant(client, client["Dcpl"], "Dcpl", "dcpl", True)
