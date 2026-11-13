"""The public CricHeroes stats routes (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.2).

Three things are proved here:

1. They cannot spend quota. No route has any dependency but the tenant, the
   module cannot name a client, and with every way of building one made to
   fail, they still answer and no call is counted.
2. They serve the requesting tournament only. "alpha" is linked to one of the
   two CricHeroes tournaments we are served and "bravo" to the other; every
   cached row carries the name of the tournament that should see it, so a
   leak says so in plain text.
3. No link, or nothing cached yet, is an empty table, not an error.

The cache is seeded through its own writer, the way the scheduled sync fills
it, with the API doc's example rows (tests/fixtures/cricheroes_doc_examples.json).
"""

import ast
import copy
import inspect
import json
from datetime import datetime
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.routing import APIRoute

from app.common.enums.tournaments import TournamentStatus
from app.models.cricheroes import CricHeroesCallCount, CricHeroesSnapshot
from app.models.tournament import Tournament
from app.routes import cricheroes as public_cricheroes
from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    PlayerMvp,
    PointTableRow,
)
from app.services import cricheroes_cache, cricheroes_usage
from app.services.cricheroes_client import CricHeroesClient
from app.utils.tenant import TENANT_HEADER, get_tenant
from config.settings import settings

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)
# The two tournaments CricHeroes serve us (§13.12).
TPL = 2242502
OTHER = 2251924
# When the sync last read them: naive UTC, as MongoDB hands it back.
FETCHED = datetime(2026, 11, 5, 10, 0)
FETCHED_IST = "2026-11-05T15:30:00+05:30"

ALPHA = {TENANT_HEADER: "alpha"}
BRAVO = {TENANT_HEADER: "bravo"}
UNLINKED = {TENANT_HEADER: "unlinked"}

# Route -> (cached resource, the doc example it is seeded from, its row model,
# the row field that names the player or team).
ROUTES = {
    "/api/cricheroes/point-table": (
        "point-table",
        "get-tournament-point-table",
        PointTableRow,
        "Team Name",
    ),
    "/api/cricheroes/mvp": ("mvp", "get-tournament-player-mvp", PlayerMvp, "name"),
    "/api/cricheroes/batting-leaderboard": (
        "batting-leaderboard",
        "get-tournament-batting-leaderboard",
        BattingLeaderboardEntry,
        "name",
    ),
    "/api/cricheroes/bowling-leaderboard": (
        "bowling-leaderboard",
        "get-tournament-bowling-leaderboard",
        BowlingLeaderboardEntry,
        "name",
    ),
}
EMPTY_UNLINKED = {"linked": False, "fetched_at": None, "rows": []}
EMPTY_LINKED = {"linked": True, "fetched_at": None, "rows": []}


def _rows(endpoint: str, model, name_field: str, owner: str) -> list:
    """The doc's example rows, each named after the tournament meant to see it."""
    rows = copy.deepcopy(DOC[endpoint]["data"])
    for row in rows:
        row[name_field] = f"{owner}: {row[name_field]}"
    return [model.model_validate(row) for row in rows]


def _names(body: dict) -> list:
    # A player's name, or on the points table, the team's.
    return [row["name"] if "name" in row else row["team_name"] for row in body["rows"]]


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")


@pytest.fixture
def no_upstream(monkeypatch):
    """Any attempt to build a CricHeroes client, counted or bare, fails."""

    def refuse(*args, **kwargs):
        raise AssertionError("a public route tried to build a CricHeroes client")

    monkeypatch.setattr(CricHeroesClient, "__init__", refuse)
    monkeypatch.setattr(cricheroes_usage, "counted_client", refuse)


@pytest_asyncio.fixture
async def tournaments(db, shared):
    for slug, linked in (("alpha", TPL), ("bravo", OTHER), ("unlinked", None)):
        await Tournament(
            slug=slug,
            name=slug.title(),
            status=TournamentStatus.LIVE,
            cricheroes_tournament_id=linked,
        ).insert()


@pytest_asyncio.fixture
async def cached(tournaments):
    for resource, endpoint, model, name_field in ROUTES.values():
        for cricheroes_id, owner in ((TPL, "alpha"), (OTHER, "bravo")):
            await cricheroes_cache._save(
                resource,
                cricheroes_id,
                _rows(endpoint, model, name_field, owner),
                "digest",
                FETCHED,
            )


# -- 1. no upstream calls -----------------------------------------------------


def _public_routes():
    from main import app

    return {
        route.path: route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/api/cricheroes/")
    }


def test_four_read_only_routes():
    routes = _public_routes()
    assert set(routes) == set(ROUTES)
    assert all(route.methods == {"GET"} for route in routes.values())


def _dependencies(dependant):
    for dependency in dependant.dependencies:
        yield dependency
        yield from _dependencies(dependency)


@pytest.mark.parametrize("path", ROUTES)
def test_the_tenant_is_the_only_dependency(path):
    """No client dependency, direct or nested: nothing a request resolves can
    reach CricHeroes."""
    route = _public_routes()[path]
    assert [d.call for d in _dependencies(route.dependant)] == [get_tenant]
    for parameter in inspect.signature(route.endpoint).parameters.values():
        assert parameter.annotation is not CricHeroesClient


def test_the_module_cannot_name_a_client():
    """Nothing in app/routes/cricheroes.py imports or names a way to call
    CricHeroes, so no later route in it can pick one up by accident."""
    tree = ast.parse(Path(public_cricheroes.__file__).read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom):
            imported |= {node.module, *(alias.name for alias in node.names)}
    names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)} | {
        n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)
    }
    reaching_out = {
        "httpx",
        "app.services.cricheroes_client",
        "app.services.cricheroes_usage",
        "app.routes.admin.cricheroes",
        "cricheroes_client",
        "cricheroes_usage",
        "CricHeroesClient",
        "counted_client",
        "get_cricheroes_client",
        "sync",
        "sync_tournament",
    }
    assert not (imported | names) & reaching_out
    # Of the cache, only its read side.
    used = {
        n.attr
        for n in ast.walk(tree)
        if isinstance(n, ast.Attribute)
        and isinstance(n.value, ast.Name)
        and n.value.id == "cricheroes_cache"
    }
    assert used == {"read"}


async def test_serving_every_table_makes_no_call(anon_client, cached, no_upstream):
    for path in ROUTES:
        resp = await anon_client.get(path, headers=ALPHA)
        assert resp.status_code == 200, resp.text
        assert resp.json()["rows"]

    # Nothing counted, and the cache is as the sync left it: reading it
    # neither refreshed nor claimed anything.
    assert await CricHeroesCallCount.find_all().count() == 0
    for snapshot in await CricHeroesSnapshot.find_all().to_list():
        assert snapshot.fetched_at == FETCHED
        assert snapshot.claimed_at is None


async def test_nothing_cached_makes_no_call_either(
    anon_client, tournaments, no_upstream
):
    """An empty cache is the case a 'helpful' fallback would fill live."""
    for path in ROUTES:
        resp = await anon_client.get(path, headers=ALPHA)
        assert resp.json() == EMPTY_LINKED
    assert await CricHeroesCallCount.find_all().count() == 0
    assert await CricHeroesSnapshot.find_all().count() == 0


# -- 2. the requesting tournament's only --------------------------------------


@pytest.mark.parametrize("path", ROUTES)
async def test_each_tournament_sees_its_own(anon_client, cached, path):
    alpha = (await anon_client.get(path, headers=ALPHA)).json()
    bravo = (await anon_client.get(path, headers=BRAVO)).json()

    assert alpha["rows"] and bravo["rows"]
    assert all(name.startswith("alpha: ") for name in _names(alpha))
    assert all(name.startswith("bravo: ") for name in _names(bravo))


@pytest.mark.parametrize("path", ROUTES)
async def test_the_caller_cannot_choose_the_cricheroes_tournament(
    anon_client, cached, path
):
    resp = await anon_client.get(
        path,
        headers=ALPHA,
        params={
            "tournament_id": OTHER,
            "cricheroes_tournament_id": OTHER,
            "id": OTHER,
        },
    )
    assert all(name.startswith("alpha: ") for name in _names(resp.json()))


async def test_relinking_moves_the_page_to_the_other_tournament(anon_client, cached):
    alpha = await Tournament.find_one(Tournament.slug == "alpha")
    await alpha.set({Tournament.cricheroes_tournament_id: OTHER})

    resp = await anon_client.get("/api/cricheroes/mvp", headers=ALPHA)
    assert all(name.startswith("bravo: ") for name in _names(resp.json()))


async def test_no_tournament_header_is_refused(anon_client, cached):
    resp = await anon_client.get("/api/cricheroes/point-table")
    assert resp.status_code == 400
    assert TENANT_HEADER in resp.json()["detail"]


async def test_an_archived_tournament_is_refused(anon_client, cached):
    alpha = await Tournament.find_one(Tournament.slug == "alpha")
    await alpha.set({Tournament.status: TournamentStatus.ARCHIVED})

    resp = await anon_client.get("/api/cricheroes/point-table", headers=ALPHA)
    assert resp.status_code == 400


# -- what a page gets ---------------------------------------------------------


@pytest.mark.parametrize("path", ROUTES)
async def test_the_rows_are_the_caches_with_when_they_were_fetched(
    anon_client, cached, path
):
    resource = ROUTES[path][0]
    body = (await anon_client.get(path, headers=ALPHA)).json()

    # The envelope, and nothing else: the reason a refresh failed is for
    # admins (GET /api/admin/cricheroes/cache), not visitors.
    assert set(body) == {"linked", "fetched_at", "rows"}
    assert body["linked"] is True
    assert body["fetched_at"] == FETCHED_IST
    expected = (await cricheroes_cache.read(resource, TPL)).data
    assert body["rows"] == [row.model_dump(mode="json") for row in expected]


async def test_our_field_names_not_cricheroes(anon_client, cached):
    """response_model_by_alias=False, as on the admin routes (§8.3)."""
    table = (await anon_client.get("/api/cricheroes/point-table", headers=ALPHA)).json()
    team = table["rows"][0]
    assert (team["team_name"], team["net_rr"], team["last_5"]) == (
        "alpha: Australia (WC19)",
        "1.065",
        "W-W-W-W-W-W-W-L",
    )
    assert (team["points"], team["no_result"], team["team_id"]) == (14, 0, 362535)
    assert not {"Team Name", "Net RR", "Last 5", "N/R"} & set(team)

    batting = (
        await anon_client.get("/api/cricheroes/batting-leaderboard", headers=ALPHA)
    ).json()["rows"][0]
    assert (batting["fours"], batting["sixes"], batting["hundreds"]) == (67, 14, 5)
    assert (batting["average"], batting["strike_rate"]) == ("81.00", "98.33")
    assert not {"4s", "6s", "50s", "100s"} & set(batting)

    bowling = (
        await anon_client.get("/api/cricheroes/bowling-leaderboard", headers=ALPHA)
    ).json()["rows"][0]
    assert (bowling["total_wickets"], bowling["economy"]) == (27, "5.45")
    assert (bowling["strike_rate"], bowling["average"]) == ("20.52", 18.63)
    assert (bowling["four_wickets"], bowling["five_wickets"]) == (2, 2)
    assert not {"SR", "avg", "3_wickets", "4_wickets", "5_wickets"} & set(bowling)

    mvp = (await anon_client.get("/api/cricheroes/mvp", headers=ALPHA)).json()
    assert (mvp["rows"][0]["rank"], mvp["rows"][0]["total"]) == (1, "94.183")


async def test_a_failed_refresh_still_serves_the_last_good_rows(anon_client, cached):
    await cricheroes_cache._save_error(
        "point-table", TPL, RuntimeError("CricHeroes said no"), datetime(2026, 11, 6)
    )

    body = (await anon_client.get("/api/cricheroes/point-table", headers=ALPHA)).json()
    assert body["rows"] and body["fetched_at"] == FETCHED_IST
    assert "CricHeroes said no" not in json.dumps(body)


# -- 3. empty states ----------------------------------------------------------


@pytest.mark.parametrize("path", ROUTES)
async def test_an_unlinked_tournament_gets_an_empty_table(anon_client, cached, path):
    resp = await anon_client.get(path, headers=UNLINKED)
    assert resp.status_code == 200
    assert resp.json() == EMPTY_UNLINKED


@pytest.mark.parametrize("path", ROUTES)
async def test_a_linked_tournament_not_yet_fetched_gets_an_empty_table(
    anon_client, tournaments, path
):
    resp = await anon_client.get(path, headers=ALPHA)
    assert resp.status_code == 200
    assert resp.json() == EMPTY_LINKED


async def test_a_first_refresh_that_failed_is_an_empty_table(anon_client, tournaments):
    """The error is recorded, but there was never data to keep."""
    await cricheroes_cache._save_error(
        "mvp", TPL, RuntimeError("CricHeroes said no"), FETCHED
    )

    resp = await anon_client.get("/api/cricheroes/mvp", headers=ALPHA)
    assert resp.json() == EMPTY_LINKED


async def test_unlinking_empties_the_page(anon_client, cached):
    alpha = await Tournament.find_one(Tournament.slug == "alpha")
    await alpha.set({Tournament.cricheroes_tournament_id: None})

    resp = await anon_client.get("/api/cricheroes/mvp", headers=ALPHA)
    assert resp.json() == EMPTY_UNLINKED


async def test_a_single_tournament_service_has_nothing_linked(
    anon_client, db, monkeypatch
):
    """A legacy per-tournament service has no registry row to link."""
    monkeypatch.setattr(settings, "tenancy", "single")

    resp = await anon_client.get("/api/cricheroes/point-table")
    assert resp.status_code == 200
    assert resp.json() == EMPTY_UNLINKED
