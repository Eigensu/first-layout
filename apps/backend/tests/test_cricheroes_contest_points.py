"""Contest points from CricHeroes' match MVP tables
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.3).

The sync is driven through a real CricHeroesClient over a scripted CricHeroes,
as in test_cricheroes_cache.py, so what is proved about calls is what the quota
sees. MVP rows are built from the API doc's example row.
"""

import copy
import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pytest
import pytest_asyncio

from app.common.enums.tournaments import TournamentStatus
from app.models.admin.player import Player
from app.models.contest import Contest
from app.models.cricheroes import CricHeroesMatchMvp
from app.models.player_contest_points import PlayerContestPoints
from app.models.tournament import Tournament
from app.schemas.cricheroes import TournamentMatch
from app.services import cricheroes_cache, cricheroes_points
from app.services.cricheroes_cache import sync_tournament
from app.services.cricheroes_client import CricHeroesClient
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

DOC = json.loads(
    (Path(__file__).parent / "fixtures" / "cricheroes_doc_examples.json").read_text()
)
BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}
TPL = 2242502
ALPHA = {TENANT_HEADER: "alpha"}
MVP = "get-match-player-mvp"

# Naive UTC, as stored. Matches are on 10-12 Nov; runs happen after them.
T0 = datetime(2026, 11, 13, 10, 0)
WINDOW = (datetime(2026, 11, 9), datetime(2026, 11, 12, 23, 59))

# CricHeroes players: three are linked to players here, ZED is not.
ASH, BEN, CAL, ZED = 101, 102, 103, 199


def match(match_id: int, day: int, a="Lions", b="Tigers", **changes) -> dict:
    row = copy.deepcopy(DOC["get-tournament-match-list"]["data"][0])
    row.update(
        match_id=match_id,
        type=3,
        status="past",
        match_date_time=f"2026-11-{day:02d}T09:00:00.000Z",
        team_a_name=a,
        team_b_name=b,
    )
    row.update(changes)
    return row


def mvp(player_id: int, total: str, name=None, team="Lions") -> dict:
    row = copy.deepcopy(DOC[MVP]["data"][0])
    row.update(
        player_id=player_id, name=name or f"P{player_id}", team_name=team, total=total
    )
    return row


def ok(data) -> httpx.Response:
    return httpx.Response(200, json={"status": True, "data": data})


class CricHeroes:
    """Answers the match list and each match's MVP table, and counts calls."""

    def __init__(self):
        self.match_list = []
        self.tables: dict = {}  # match id -> rows, or an httpx.Response
        self.mvp_reads: list = []
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        endpoint, last = request.url.path.split("/")[-2:]
        if endpoint == MVP:
            match_id = int(last)
            self.mvp_reads.append(match_id)
            table = self.tables.get(match_id, [])
            return table if isinstance(table, httpx.Response) else ok(table)
        if endpoint == "get-tournament-match-list":
            return ok(self.match_list)
        # The cached standings, MVP table and leaderboards.
        return ok(DOC[endpoint]["data"])


@pytest_asyncio.fixture
async def upstream(db):
    cricheroes = CricHeroes()
    http = httpx.AsyncClient(transport=httpx.MockTransport(cricheroes))
    cricheroes.client = CricHeroesClient(**CREDS, base_url=BASE, client=http)
    yield cricheroes
    await http.aclose()


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")
    monkeypatch.setattr(settings, "cricheroes_sync_tournament_ids", str(TPL))
    monkeypatch.setattr(settings, "cricheroes_snapshot_max_age_hours", 24.0)


@pytest_asyncio.fixture
async def alpha(db, configured):
    tournament = Tournament(
        slug="alpha",
        name="Alpha",
        status=TournamentStatus.LIVE,
        cricheroes_tournament_id=TPL,
    )
    await tournament.insert()
    for cricheroes_id, name, team in (
        (ASH, "Ash", "Lions"),
        (BEN, "Ben", "Tigers"),
        (CAL, "Cal", "Bears"),
    ):
        await Player(
            name=name,
            team=team,
            tournament_id=tournament.id,
            cricheroes_player_id=cricheroes_id,
        ).insert()
    # Someone with no CricHeroes link, who only ever has hand-entered points.
    await Player(name="Hand", team="Lions", tournament_id=tournament.id).insert()
    return tournament


async def contest(tournament, code="FULL", on=True, **fields) -> Contest:
    doc = Contest(
        code=code,
        name=code,
        start_at=fields.pop("start_at", WINDOW[0]),
        end_at=fields.pop("end_at", WINDOW[1]),
        tournament_id=tournament.id,
        points_from_cricheroes=on,
        **fields,
    )
    await doc.insert()
    return doc


async def player(name: str) -> Player:
    return await Player.find_one(Player.name == name)


async def points(contest_doc: Contest) -> dict:
    """Player name -> their points in the contest."""
    docs = await PlayerContestPoints.find(
        PlayerContestPoints.contest_id == contest_doc.id
    ).to_list()
    names = {p.id: p.name for p in await Player.find_all().to_list()}
    return {names[d.player_id]: d.points for d in docs}


# -- when MVP tables are read --------------------------------------------------


async def test_no_table_is_read_without_an_opted_in_contest(upstream, alpha):
    await contest(alpha, on=False)
    upstream.match_list = [match(1, 10)]

    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert upstream.mvp_reads == []
    assert (report.mvp_tables_read, report.contests_scored) == ([], 0)


async def test_a_completed_match_is_read_and_its_points_scored(upstream, alpha):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "8.719"), mvp(BEN, "3.250"), mvp(ZED, "5.000")]

    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert upstream.mvp_reads == [1]
    assert report.mvp_tables_read == [1]
    assert report.contests_scored == 1
    # The match list, the four cached resources, and one MVP table.
    assert report.calls == upstream.calls == 6
    # ZED is not linked here, so scores nothing; Hand was never scored.
    assert await points(full) == {"Ash": 8.719, "Ben": 3.25}
    # A full contest mirrors its points into Player.points, as the form does.
    assert (await player("Ash")).points == 8.719


async def test_matches_in_play_or_to_come_are_not_read(upstream, alpha):
    await contest(alpha)
    upstream.match_list = [
        match(1, 10, type=1, status="live"),
        match(2, 11, type=2, status="upcoming"),
    ]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert upstream.mvp_reads == []


async def test_a_table_is_read_again_a_day_later_and_then_settles(upstream, alpha):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "8.000")]

    await sync_tournament(upstream.client, TPL, now=T0)
    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=2))
    assert upstream.mvp_reads == [1]

    # The scorer corrected the scorecard after the match.
    upstream.tables[1] = [mvp(ASH, "9.500")]
    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=25))
    assert upstream.mvp_reads == [1, 1]
    assert await points(full) == {"Ash": 9.5}

    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=60))
    assert upstream.mvp_reads == [1, 1]


async def test_a_corrected_result_makes_a_settled_table_due_again(upstream, alpha):
    await contest(alpha)
    upstream.match_list = [match(1, 10)]
    for hours in (0, 25):
        await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=hours))
    assert upstream.mvp_reads == [1, 1]

    upstream.match_list = [match(1, 10, winning_team_id="999")]
    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=60))

    assert upstream.mvp_reads == [1, 1, 1]
    assert (await CricHeroesMatchMvp.find_one()).reads == 1


async def test_a_failed_read_is_retried_after_three_hours_not_every_run(
    upstream, alpha
):
    await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = httpx.Response(500, text="down")

    report = await sync_tournament(upstream.client, TPL, now=T0)
    assert list(report.mvp_tables_failed) == ["1"]
    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))
    assert upstream.mvp_reads == [1]

    upstream.tables[1] = [mvp(ASH, "4.000")]
    report = await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=4))
    assert upstream.mvp_reads == [1, 1]
    assert report.mvp_tables_read == [1]
    assert (await CricHeroesMatchMvp.find_one()).last_error is None


async def test_reads_per_run_are_capped_oldest_match_first(upstream, alpha):
    await contest(alpha)
    total = cricheroes_points.MAX_READS_PER_RUN + 2
    # Listed newest first, as a match list may be.
    upstream.match_list = [match(i, 10) for i in range(total, 0, -1)]
    for i in range(1, total + 1):
        upstream.match_list[total - i][
            "match_date_time"
        ] = f"2026-11-10T{i:02d}:00:00.000Z"

    await sync_tournament(upstream.client, TPL, now=T0)
    assert upstream.mvp_reads == list(range(1, cricheroes_points.MAX_READS_PER_RUN + 1))

    await sync_tournament(upstream.client, TPL, now=T0 + timedelta(hours=1))
    assert upstream.mvp_reads[-2:] == [total - 1, total]


# -- how a contest is scored -------------------------------------------------


async def test_only_matches_in_the_contest_window_count(upstream, alpha):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10), match(2, 11), match(3, 8)]  # 3: before
    for match_id in (1, 2, 3):
        upstream.tables[match_id] = [mvp(ASH, "2.500")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(full) == {"Ash": 5.0}


async def test_a_daily_contest_counts_only_matches_between_its_teams(upstream, alpha):
    daily = await contest(
        alpha,
        code="DAILY",
        contest_type="daily",
        allowed_teams=["lions", "  TIGERS "],
    )
    upstream.match_list = [match(1, 10), match(2, 10, a="Lions", b="Bears")]
    upstream.tables[1] = [mvp(ASH, "1.000"), mvp(BEN, "2.000")]
    upstream.tables[2] = [mvp(ASH, "10.000"), mvp(CAL, "7.000")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(daily) == {"Ash": 1.0, "Ben": 2.0}
    # A daily contest leaves Player.points alone.
    assert (await player("Ash")).points == 0.0


async def test_hand_entered_points_are_replaced(upstream, alpha):
    full = await contest(alpha)
    for name, value in (("Ash", 50.0), ("Hand", 30.0)):
        await PlayerContestPoints(
            tournament_id=alpha.id,
            contest_id=full.id,
            player_id=(await player(name)).id,
            points=value,
        ).insert()
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "6.000")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(full) == {"Ash": 6.0, "Hand": 0.0}


async def test_a_contest_left_off_keeps_its_hand_entered_points(upstream, alpha):
    await contest(alpha, code="ON")
    manual = await contest(alpha, code="MANUAL", on=False)
    await PlayerContestPoints(
        tournament_id=alpha.id,
        contest_id=manual.id,
        player_id=(await player("Ash")).id,
        points=50.0,
    ).insert()
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "6.000")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(manual) == {"Ash": 50.0}


async def test_a_repeated_row_counts_once(upstream, alpha):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "6.000"), mvp(ASH, "6.000")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(full) == {"Ash": 6.0}


async def test_another_tournament_linked_elsewhere_is_not_scored(upstream, alpha):
    other = Tournament(
        slug="bravo",
        name="Bravo",
        status=TournamentStatus.LIVE,
        cricheroes_tournament_id=2251924,
    )
    await other.insert()
    theirs = await contest(other, code="THEIRS")
    await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "6.000")]

    await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(theirs) == {}


def while_reading(monkeypatch, edit):
    """Run `edit` -- what an admin does -- while the sync reads MVP tables,
    after it has listed the contests and before it scores them."""
    read = cricheroes_points.read_mvp_tables

    async def read_then_edit(*args, **kwargs):
        reads = await read(*args, **kwargs)
        await edit()
        return reads

    monkeypatch.setattr(cricheroes_points, "read_mvp_tables", read_then_edit)


async def test_a_switch_turned_off_during_the_reads_keeps_the_hand_points(
    upstream, alpha, monkeypatch
):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "8.719")]
    ash = await player("Ash")

    async def switch_off_and_enter_points():
        doc = await Contest.get(full.id)
        doc.points_from_cricheroes = False
        await doc.save()
        await PlayerContestPoints(
            tournament_id=alpha.id, contest_id=full.id, player_id=ash.id, points=50.0
        ).insert()

    while_reading(monkeypatch, switch_off_and_enter_points)
    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(full) == {"Ash": 50.0}
    assert (await player("Ash")).points == 0.0
    # Passed over, not failed: the switch being off is not an error.
    assert (report.contests_scored, report.contests_failed) == (0, {})


async def test_a_window_moved_during_the_reads_is_scored_as_moved(
    upstream, alpha, monkeypatch
):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10), match(2, 11)]
    upstream.tables[1] = [mvp(ASH, "8.000")]
    upstream.tables[2] = [mvp(BEN, "3.000")]

    async def move_start_past_match_1():
        doc = await Contest.get(full.id)
        doc.start_at = datetime(2026, 11, 11)
        await doc.save()

    while_reading(monkeypatch, move_start_past_match_1)
    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert report.contests_scored == 1
    assert await points(full) == {"Ben": 3.0}


async def test_a_tournament_unlinked_during_the_reads_is_not_scored(
    upstream, alpha, monkeypatch
):
    full = await contest(alpha)
    upstream.match_list = [match(1, 10)]
    upstream.tables[1] = [mvp(ASH, "8.000")]

    async def unlink():
        doc = await Tournament.get(alpha.id)
        doc.cricheroes_tournament_id = None
        await doc.save()

    while_reading(monkeypatch, unlink)
    report = await sync_tournament(upstream.client, TPL, now=T0)

    assert await points(full) == {}
    assert (report.contests_scored, report.contests_failed) == (0, {})


# -- the admin routes ------------------------------------------------------------


async def stored(match_rows, tables):
    """The cache and MVP tables as a sync would have left them."""
    matches = [TournamentMatch.model_validate(row) for row in match_rows]
    await cricheroes_cache._save("matches", TPL, matches, "digest", T0)
    for match_id, rows in tables.items():
        await CricHeroesMatchMvp(
            match_id=match_id,
            cricheroes_tournament_id=TPL,
            data=rows,
            fetched_at=T0,
            result_key="x",
            reads=1,
        ).insert()


@pytest.fixture
def no_upstream(monkeypatch):
    """Admin contest routes must never call CricHeroes."""

    def refuse(*args, **kwargs):
        raise AssertionError("a contest route tried to build a CricHeroes client")

    monkeypatch.setattr(CricHeroesClient, "__init__", refuse)


async def test_turning_it_on_scores_at_once_from_what_is_stored(
    client, alpha, no_upstream
):
    full = await contest(alpha, on=False)
    await stored([match(1, 10)], {1: [mvp(ASH, "8.719"), mvp(ZED, "1.000")]})

    response = await client.put(
        f"/api/admin/contests/{full.id}",
        json={"points_from_cricheroes": True},
        headers=ALPHA,
    )

    assert response.status_code == 200, response.text
    assert response.json()["points_from_cricheroes"] is True
    assert await points(full) == {"Ash": 8.719}


async def test_creating_a_contest_with_it_on_scores_it(client, alpha, no_upstream):
    await stored([match(1, 10)], {1: [mvp(BEN, "2.000")]})

    response = await client.post(
        "/api/admin/contests",
        json={
            "code": "NEW",
            "name": "New",
            "start_at": "2026-11-09T00:00:00Z",
            "end_at": "2026-11-12T23:59:00Z",
            "points_from_cricheroes": True,
        },
        headers=ALPHA,
    )

    assert response.status_code == 201, response.text
    created = await Contest.find_one(Contest.code == "NEW")
    assert await points(created) == {"Ben": 2.0}


async def test_it_cannot_be_turned_on_without_a_linked_tournament(client, alpha):
    alpha.cricheroes_tournament_id = None
    await alpha.save()
    full = await contest(alpha, on=False)

    response = await client.put(
        f"/api/admin/contests/{full.id}",
        json={"points_from_cricheroes": True},
        headers=ALPHA,
    )

    assert response.status_code == 422
    assert "not linked" in response.json()["detail"]
    assert (await Contest.get(full.id)).points_from_cricheroes is False


async def test_it_cannot_be_turned_on_for_a_tournament_the_sync_skips(
    client, alpha, monkeypatch
):
    monkeypatch.setattr(settings, "cricheroes_sync_tournament_ids", "")
    full = await contest(alpha, on=False)

    response = await client.put(
        f"/api/admin/contests/{full.id}",
        json={"points_from_cricheroes": True},
        headers=ALPHA,
    )

    assert response.status_code == 422
    assert "CRICHEROES_SYNC_TOURNAMENT_IDS" in response.json()["detail"]


async def test_moving_the_window_rescores(client, alpha, no_upstream):
    full = await contest(alpha)
    await stored(
        [match(1, 10), match(2, 11)],
        {1: [mvp(ASH, "1.000")], 2: [mvp(ASH, "2.000")]},
    )
    await cricheroes_points.score_contest(
        full, TPL, (await cricheroes_cache.read("matches", TPL)).data
    )
    assert await points(full) == {"Ash": 3.0}

    response = await client.put(
        f"/api/admin/contests/{full.id}",
        json={"end_at": "2026-11-10T23:59:00Z"},
        headers=ALPHA,
    )

    assert response.status_code == 200, response.text
    assert await points(full) == {"Ash": 1.0}


async def test_an_edit_resending_the_same_times_is_not_refused_over_the_link(
    client, alpha
):
    """A contest already on, whose tournament has since been unlinked, can
    still be edited: only turning the switch on checks the link."""
    full = await contest(alpha)
    alpha.cricheroes_tournament_id = None
    await alpha.save()

    response = await client.put(
        f"/api/admin/contests/{full.id}",
        json={
            "name": "Renamed",
            "start_at": "2026-11-09T00:00:00Z",
            "end_at": "2026-11-12T23:59:00Z",
        },
        headers=ALPHA,
    )

    assert response.status_code == 200, response.text


async def test_hand_edits_are_refused_while_it_is_on(client, alpha):
    full = await contest(alpha)
    ash = await player("Ash")

    response = await client.put(
        f"/api/admin/contests/{full.id}/player-points",
        json={"updates": [{"player_id": str(ash.id), "points": 99}]},
        headers=ALPHA,
    )

    assert response.status_code == 409
    assert "Points from CricHeroes" in response.json()["detail"]
    assert await points(full) == {}


async def test_the_summary_shows_what_counts_and_who_is_missing(
    client, alpha, no_upstream
):
    full = await contest(alpha)
    await stored(
        [match(1, 10), match(2, 11), match(3, 8)],
        {1: [mvp(ASH, "1.000"), mvp(ZED, "2.000", name="Zed", team="Lions")]},
    )

    response = await client.get(
        f"/api/admin/contests/{full.id}/cricheroes-points", headers=ALPHA
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cricheroes_tournament_id"] == TPL
    assert [m["match_id"] for m in body["matches_counted"]] == [1]
    assert body["matches_counted"][0]["teams"] == "Lions vs Tigers"
    # Match 2 is in the window but its table has not been read; 3 is outside.
    assert body["matches_awaiting_mvp"] == [2]
    assert body["players_scored"] == 1
    assert body["unlinked_players"] == ["Zed (Lions)"]
    # Reading the summary writes nothing.
    assert await points(full) == {}
