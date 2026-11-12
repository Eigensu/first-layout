"""Tournament memberships (spec stage E, §6).

A row appears the moment someone signs in on a tournament's site or plays
there; the numbers on it come from the stats job, which also repairs rows the
inline writes missed. GET /api/users/me/tournaments reads them back.

Only the shared backend has memberships. A legacy single-tournament service
writes none.
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient
from pymongo.errors import PyMongoError

from app.common.datetime_utils import to_ist, utc_now
from app.common.enums.enrollments import EnrollmentStatus
from app.common.enums.tournaments import TournamentStatus
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.contest import Contest
from app.models.player_contest_points import PlayerContestPoints
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from app.models.tournament_membership import (
    STATUS_PLAYED,
    STATUS_REGISTERED,
    MembershipStats,
    TournamentMembership,
)
from app.models.user import User
from app.services import membership as membership_service
from app.services.membership import record_play, record_sign_in
from app.services.membership_stats import refresh_tournament
from app.utils.dependencies import get_current_active_user
from app.utils.security import get_password_hash
from app.utils.tenant import TENANT_HEADER
from config.settings import settings

ALPHA = {TENANT_HEADER: "alpha"}
BRAVO = {TENANT_HEADER: "bravo"}
PASSWORD = "Secret123"


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(settings, "tenancy", "shared")


@pytest_asyncio.fixture
async def tournaments(db):
    alpha = Tournament(slug="alpha", name="Alpha", status=TournamentStatus.LIVE)
    bravo = Tournament(slug="bravo", name="Bravo", status=TournamentStatus.LIVE)
    for t in (alpha, bravo):
        await t.insert()
    return alpha, bravo


async def _user(name: str) -> User:
    user = User(
        username=name,
        email=f"{name}@example.com",
        hashed_password=get_password_hash(PASSWORD),
        is_active=True,
        is_verified=True,
    )
    await user.insert()
    return user


async def _row(user: User, tournament: Tournament):
    return await TournamentMembership.find_one(
        TournamentMembership.user_id == user.id,
        TournamentMembership.tournament_id == tournament.id,
    )


@pytest_asyncio.fixture
async def http(db):
    """A client whose signed-in user is set per test by `as_user`."""
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


def as_user(user: User) -> None:
    from main import app

    async def _signed_in():
        return user

    app.dependency_overrides[get_current_active_user] = _signed_in


# --- signing in on a tournament's site ----------------------------------------


async def test_registering_on_a_tournament_site_makes_you_a_member(
    shared, tournaments, anon_client
):
    alpha, _ = tournaments
    response = await anon_client.post(
        "/api/auth/register",
        headers=ALPHA,
        data={
            "username": "newplayer",
            "email": "new@example.com",
            "password": "NewPass123",
            "mobile": "9876500001",
        },
    )
    assert response.status_code == 201, response.text

    user = await User.find_one(User.username == "newplayer")
    row = await _row(user, alpha)
    assert row.tournament_slug == "alpha"
    assert row.display_name == "newplayer"
    assert row.role == "player"
    assert row.status == STATUS_REGISTERED
    assert row.joined_at is not None and row.last_login_at is not None
    assert row.first_played_at is None
    assert await TournamentMembership.find_all().count() == 1


@pytest.mark.parametrize(
    "headers", [{}, {TENANT_HEADER: "nowhere"}], ids=["apex", "unknown"]
)
async def test_signing_in_off_a_tournament_records_nothing(
    shared, tournaments, anon_client, headers
):
    await _user("rahul")
    response = await anon_client.post(
        "/api/auth/login",
        headers=headers,
        json={"username": "rahul", "password": PASSWORD},
    )
    assert response.status_code == 200
    assert await TournamentMembership.find_all().count() == 0


async def test_signing_in_on_another_tournament_joins_it(
    shared, tournaments, anon_client
):
    alpha, bravo = tournaments
    user = await _user("rahul")
    await record_play(user, alpha.id)

    response = await anon_client.post(
        "/api/auth/login",
        headers=BRAVO,
        json={"username": "rahul", "password": PASSWORD},
    )

    assert response.status_code == 200
    assert (await _row(user, bravo)).status == STATUS_REGISTERED
    assert (await _row(user, alpha)).status == STATUS_PLAYED


async def test_signing_in_again_never_undoes_having_played(
    shared, tournaments, anon_client
):
    alpha, _ = tournaments
    user = await _user("rahul")
    await record_play(user, alpha.id)

    for _ in range(2):
        response = await anon_client.post(
            "/api/auth/login",
            headers=ALPHA,
            json={"username": "rahul", "password": PASSWORD},
        )
        assert response.status_code == 200

    row = await _row(user, alpha)
    assert row.status == STATUS_PLAYED
    assert row.last_login_at is not None
    assert await TournamentMembership.find_all().count() == 1


async def test_google_sign_in_joins_the_tournament(
    shared, tournaments, anon_client, monkeypatch
):
    alpha, _ = tournaments
    monkeypatch.setattr(
        "app.routes.auth.verify_google_id_token",
        lambda token: {
            "sub": "google-sub-1",
            "email": "g@example.com",
            "email_verified": True,
            "name": "G",
        },
    )
    response = await anon_client.post(
        "/api/auth/google", headers=ALPHA, json={"id_token": "fake"}
    )
    assert response.status_code == 200, response.text
    user = await User.find_one(User.email == "g@example.com")
    assert (await _row(user, alpha)).status == STATUS_REGISTERED


async def test_apple_sign_in_joins_the_tournament(
    shared, tournaments, anon_client, monkeypatch
):
    alpha, _ = tournaments

    async def _verify(token):
        return {"sub": "apple-sub-1", "email": "a@example.com"}

    monkeypatch.setattr("app.routes.auth.verify_apple_identity_token", _verify)
    response = await anon_client.post(
        "/api/auth/apple",
        headers=ALPHA,
        json={"identity_token": "fake", "full_name": "A"},
    )
    assert response.status_code == 200, response.text
    user = await User.find_one(User.email == "a@example.com")
    assert (await _row(user, alpha)).status == STATUS_REGISTERED


# --- playing --------------------------------------------------------------------


@pytest_asyncio.fixture
async def squad(tournaments):
    """What alpha needs before anyone can make a team there."""
    alpha, _ = tournaments
    slot = Slot(
        tournament_id=alpha.id, code="BAT", name="Bat", min_select=2, max_select=2
    )
    await slot.insert()
    players = [
        AdminPlayer(
            tournament_id=alpha.id,
            name=f"p{i}",
            team="XI",
            price=100,
            slot=str(slot.id),
        )
        for i in range(2)
    ]
    for p in players:
        await p.insert()
    start = utc_now() + timedelta(days=1)
    contest = Contest(
        tournament_id=alpha.id,
        code="FINAL",
        name="Final",
        start_at=start,
        end_at=start + timedelta(days=1),
    )
    await contest.insert()
    return contest, [str(p.id) for p in players]


async def test_making_a_team_marks_you_as_having_played(
    shared, tournaments, squad, http
):
    alpha, _ = tournaments
    contest, player_ids = squad
    user = await _user("rahul")
    await record_sign_in(user, alpha.id)

    as_user(user)
    response = await http.post(
        "/api/teams/",
        headers=ALPHA,
        json={
            "team_name": "first",
            "contest_id": str(contest.id),
            "player_ids": player_ids,
            "captain_id": player_ids[0],
            "vice_captain_id": player_ids[1],
        },
    )
    assert response.status_code == 201, response.text

    row = await _row(user, alpha)
    assert row.status == STATUS_PLAYED
    assert row.first_played_at is not None
    assert row.last_active_at is not None


async def test_entering_a_contest_marks_you_as_having_played(
    shared, tournaments, squad, http
):
    alpha, _ = tournaments
    contest, player_ids = squad
    user = await _user("rahul")
    team = Team(
        tournament_id=alpha.id, user_id=user.id, team_name="t", player_ids=player_ids
    )
    await team.insert()

    as_user(user)
    response = await http.post(
        f"/api/contests/{contest.id}/enroll",
        headers=ALPHA,
        json={"team_id": str(team.id)},
    )
    assert response.status_code == 200, response.text

    row = await _row(user, alpha)
    assert row.status == STATUS_PLAYED
    assert row.joined_at is not None and row.first_played_at is not None


async def test_first_played_is_set_once(shared, tournaments):
    alpha, _ = tournaments
    user = await _user("rahul")
    await record_sign_in(user, alpha.id)
    await record_play(user, alpha.id)
    # Pinned in the past: two plays in one test land in the same millisecond,
    # which is as fine as Mongo stores a date.
    first = datetime(2026, 1, 1, 9, 0)
    row = await _row(user, alpha)
    row.first_played_at = first
    await row.save()

    await record_play(user, alpha.id)

    row = await _row(user, alpha)
    assert row.first_played_at.replace(tzinfo=None) == first
    assert row.last_active_at.replace(tzinfo=None) > first


@pytest.mark.parametrize("record", [record_sign_in, record_play])
async def test_without_a_tournament_nothing_is_touched(
    tournaments, monkeypatch, record
):
    """A legacy service has no tournament: no query, not even a lookup."""

    def _untouchable():
        raise AssertionError("membership collection touched")

    monkeypatch.setattr(membership_service, "_collection", _untouchable)
    await record(await _user("rahul"), None)


async def test_a_single_tournament_service_writes_no_memberships(
    tournaments, squad, anon_client, http
):
    """TENANCY=single, the default: the header is ignored and nothing is written."""
    contest, player_ids = squad
    await anon_client.post(
        "/api/auth/register",
        headers=ALPHA,
        data={
            "username": "newplayer",
            "email": "new@example.com",
            "password": "NewPass123",
            "mobile": "9876500001",
        },
    )
    user = await User.find_one(User.username == "newplayer")
    team = Team(user_id=user.id, team_name="t", player_ids=player_ids)
    await team.insert()
    legacy_contest = Contest(
        code="LEGACY",
        name="Legacy",
        start_at=contest.start_at,
        end_at=contest.end_at,
    )
    await legacy_contest.insert()

    as_user(user)
    response = await http.post(
        f"/api/contests/{legacy_contest.id}/enroll", json={"team_id": str(team.id)}
    )
    assert response.status_code == 200, response.text
    assert await TournamentMembership.find_all().count() == 0


async def test_a_failed_write_does_not_fail_the_sign_in(
    shared, tournaments, anon_client, monkeypatch, caplog
):
    class Broken:
        async def update_one(self, *args, **kwargs):
            raise PyMongoError("primary stepped down")

    monkeypatch.setattr(membership_service, "_collection", lambda: Broken())
    await _user("rahul")

    response = await anon_client.post(
        "/api/auth/login",
        headers=ALPHA,
        json={"username": "rahul", "password": PASSWORD},
    )

    assert response.status_code == 200
    assert await TournamentMembership.find_all().count() == 0
    assert "membership write failed" in caplog.text


async def test_a_failed_first_play_date_does_not_fail_the_entry(
    shared, tournaments, squad, http, monkeypatch, caplog
):
    """The entry is saved before the membership is touched, so an error from
    the set-once write must not reach the player either."""
    alpha, _ = tournaments
    contest, player_ids = squad
    user = await _user("rahul")
    await record_sign_in(user, alpha.id)
    team = Team(
        tournament_id=alpha.id, user_id=user.id, team_name="t", player_ids=player_ids
    )
    await team.insert()
    real = TournamentMembership.get_motor_collection()

    class FailsOnSetOnce:
        async def update_one(self, query, update, **kwargs):
            if "first_played_at" in query:
                raise PyMongoError("primary stepped down")
            return await real.update_one(query, update, **kwargs)

    monkeypatch.setattr(membership_service, "_collection", lambda: FailsOnSetOnce())

    as_user(user)
    response = await http.post(
        f"/api/contests/{contest.id}/enroll",
        headers=ALPHA,
        json={"team_id": str(team.id)},
    )

    assert response.status_code == 200, response.text
    assert "membership write failed" in caplog.text
    row = await _row(user, alpha)
    assert row.status == STATUS_PLAYED
    assert row.first_played_at is None  # left for the job


async def test_a_row_created_concurrently_still_gets_this_write(
    shared, tournaments, monkeypatch
):
    """Another request inserts the row between this one's update and insert."""
    alpha, _ = tournaments
    user = await _user("rahul")
    real_get = Tournament.get

    async def _get_after_a_concurrent_sign_in(tournament_id, *args, **kwargs):
        await TournamentMembership(
            user_id=user.id,
            tournament_id=alpha.id,
            tournament_slug="alpha",
            display_name="rahul",
        ).insert()
        return await real_get(tournament_id)

    monkeypatch.setattr(Tournament, "get", _get_after_a_concurrent_sign_in)

    await record_play(user, alpha.id)

    row = await _row(user, alpha)
    assert row.status == STATUS_PLAYED
    assert row.first_played_at is not None
    assert await TournamentMembership.find_all().count() == 1


# --- GET /api/users/me/tournaments ----------------------------------------------


async def test_my_tournaments_lists_what_was_played_and_what_was_not(
    shared, tournaments, http
):
    alpha, bravo = tournaments
    closed = Tournament(slug="closed", name="Closed", status=TournamentStatus.ARCHIVED)
    gone = Tournament(slug="gone", name="Gone", status=TournamentStatus.LIVE)
    for t in (closed, gone):
        await t.insert()
    user = await _user("rahul")
    other = await _user("other")
    long_ago = datetime(2025, 4, 2, 10, 0)

    def row(owner, t, **fields):
        return TournamentMembership(
            user_id=owner.id,
            tournament_id=t.id,
            tournament_slug=t.slug,
            display_name=f"{owner.username}@{t.slug}",
            **fields,
        )

    for doc in (
        row(
            user,
            alpha,
            status=STATUS_PLAYED,
            joined_at=long_ago,
            last_active_at=datetime(2026, 9, 1),
            stats=MembershipStats(
                teams_count=3, contests_count=2, best_rank=14, total_points=812.5
            ),
        ),
        row(user, closed, status=STATUS_PLAYED, joined_at=long_ago),
        row(user, bravo, joined_at=datetime(2026, 1, 1)),
        row(user, gone, joined_at=datetime(2026, 2, 1)),
        row(other, bravo, status=STATUS_PLAYED, joined_at=long_ago),
    ):
        await doc.insert()
    await gone.delete()

    # What alpha's numbers are counted from: three teams, two of them entered
    # in contests, plus an entry that was withdrawn and another player's team.
    contests = [PydanticObjectId(), PydanticObjectId()]
    for i in range(3):
        team = Team(
            tournament_id=alpha.id,
            user_id=user.id,
            team_name=f"rahul {i}",
            player_ids=[],
            captain_id="c",
            vice_captain_id="v",
        )
        await team.insert()
        if i < 2:
            await TeamContestEnrollment(
                tournament_id=alpha.id,
                team_id=team.id,
                user_id=user.id,
                contest_id=contests[i],
                status=EnrollmentStatus.ACTIVE,
            ).insert()
    await TeamContestEnrollment(
        tournament_id=alpha.id,
        team_id=PydanticObjectId(),
        user_id=user.id,
        contest_id=PydanticObjectId(),
        status=EnrollmentStatus.REMOVED,
    ).insert()
    await Team(
        tournament_id=alpha.id,
        user_id=other.id,
        team_name="not rahul's",
        player_ids=[],
        captain_id="c",
        vice_captain_id="v",
    ).insert()

    as_user(user)
    response = await http.get("/api/users/me/tournaments")
    assert response.status_code == 200, response.text
    body = response.json()

    assert [t["slug"] for t in body["played"]] == ["alpha", "closed"]
    first = body["played"][0]
    assert first["display_name"] == "rahul@alpha"
    assert (first["teams_count"], first["contests_count"]) == (3, 2)
    assert (first["best_rank"], first["total_points"]) == (14, 812.5)
    assert body["played"][1]["status"] == "archived"
    assert [t["slug"] for t in body["registered_only"]] == ["bravo"]
    # Stored as UTC without a zone; served in IST with the offset written out.
    assert first["joined_at"] == "2025-04-02T15:30:00+05:30"
    assert body["registered_only"][0]["joined_at"] == "2026-01-01T05:30:00+05:30"
    # closed has no teams or entries left to count.
    assert body["totals"] == {
        "tournaments_played": 2,
        "teams_count": 3,
        "contests_count": 2,
    }


async def test_my_tournaments_counts_a_team_before_the_job_runs(
    shared, tournaments, http
):
    alpha, _ = tournaments
    user = await _user("rahul")
    await Team(
        tournament_id=alpha.id,
        user_id=user.id,
        team_name="fresh",
        player_ids=[],
        captain_id="c",
        vice_captain_id="v",
    ).insert()
    await record_play(user, alpha.id)

    as_user(user)
    body = (await http.get("/api/users/me/tournaments")).json()

    # The job has not run, so rank and points are still unknown, but the team
    # is already counted.
    played = body["played"][0]
    assert (played["teams_count"], played["contests_count"]) == (1, 0)
    assert played["best_rank"] is None
    assert body["totals"]["teams_count"] == 1


async def test_my_tournaments_is_empty_for_a_new_account(shared, tournaments, http):
    as_user(await _user("rahul"))
    response = await http.get("/api/users/me/tournaments")
    assert response.json() == {
        "played": [],
        "registered_only": [],
        "totals": {"tournaments_played": 0, "teams_count": 0, "contests_count": 0},
    }


async def test_my_tournaments_needs_a_sign_in(anon_client):
    assert (await anon_client.get("/api/users/me/tournaments")).status_code == 401


# --- the stats job ----------------------------------------------------------------


@pytest_asyncio.fixture
async def season(shared, tournaments):
    """Two contests in alpha, scored per contest, and a few kinds of member.

    ann  -- registered, then played both contests: won the first
    bob  -- played both, won the second, and has no row (an inline write failed)
    cat  -- made a team whose entry was withdrawn
    erin -- signed in, never played
    dan  -- plays only in bravo
    """
    alpha, bravo = tournaments
    p1, p2, p3 = (PydanticObjectId() for _ in range(3))
    start = utc_now() - timedelta(days=2)
    c1, c2 = (
        Contest(
            tournament_id=alpha.id,
            code=code,
            name=code,
            start_at=start,
            end_at=start + timedelta(days=1),
        )
        for code in ("C1", "C2")
    )
    for c in (c1, c2):
        await c.insert()
    for contest, points in ((c1, (10, 5, 1)), (c2, (1, 2, 10))):
        for player, value in zip((p1, p2, p3), points):
            await PlayerContestPoints(
                tournament_id=alpha.id,
                contest_id=contest.id,
                player_id=player,
                points=value,
            ).insert()

    ann, bob, cat, erin, dan = [
        await _user(n) for n in ("ann", "bob", "cat", "erin", "dan")
    ]
    for person in (ann, cat, erin):
        await record_sign_in(person, alpha.id)
    await record_sign_in(dan, bravo.id)

    async def enter(owner, contest, players, captain, vice, status, made_at):
        team = Team(
            tournament_id=alpha.id,
            user_id=owner.id,
            team_name=f"{owner.username} {contest.code}",
            player_ids=[str(p) for p in players],
            captain_id=str(captain),
            vice_captain_id=str(vice),
            created_at=made_at,
        )
        await team.insert()
        await TeamContestEnrollment(
            tournament_id=alpha.id,
            team_id=team.id,
            user_id=owner.id,
            contest_id=contest.id,
            status=status,
            enrolled_at=made_at + timedelta(hours=1),
        ).insert()

    active = EnrollmentStatus.ACTIVE
    first_day = datetime(2026, 10, 1, 9, 0)
    # Captain doubles, vice-captain is one and a half times:
    # C1: ann 10*2 + 5*1.5 = 27.5, bob 5*2 + 1*1.5 = 11.5
    # C2: ann 1*2 + 2*1.5 = 5,     bob 10*2 + 2*1.5 = 23
    await enter(ann, c1, (p1, p2), p1, p2, active, first_day)
    await enter(ann, c2, (p1, p2), p1, p2, active, first_day + timedelta(days=1))
    await enter(bob, c1, (p2, p3), p2, p3, active, first_day)
    await enter(bob, c2, (p2, p3), p3, p2, active, first_day)
    await enter(cat, c1, (p1, p3), p3, p1, EnrollmentStatus.REMOVED, first_day)
    # A team whose owner's account is gone takes no rank and gets no row.
    ghost = User(username="ghost", email="ghost@example.com", hashed_password="x")
    ghost.id = PydanticObjectId()
    await enter(ghost, c2, (p3,), p3, p3, active, first_day)

    return alpha, bravo, (c1, c2), dict(ann=ann, bob=bob, cat=cat, erin=erin, dan=dan)


async def test_the_job_writes_each_members_numbers(season):
    alpha, _, _, people = season

    report = await refresh_tournament(alpha)

    assert (report.slug, report.members, report.created) == ("alpha", 4, 1)
    rows = {
        name: await _row(people[name], alpha) for name in ("ann", "bob", "cat", "erin")
    }
    numbers = {
        name: (
            r.status,
            r.stats.teams_count,
            r.stats.contests_count,
            r.stats.best_rank,
            r.stats.total_points,
        )
        for name, r in rows.items()
    }
    # The ghost's 20 points in C2 would top it, but a team without an owner
    # takes no rank, so bob still wins there.
    assert numbers == {
        "ann": (STATUS_PLAYED, 2, 2, 1, 32.5),
        "bob": (STATUS_PLAYED, 2, 2, 1, 34.5),
        "cat": (STATUS_PLAYED, 1, 0, None, 0.0),
        "erin": (STATUS_REGISTERED, 0, 0, None, 0.0),
    }
    assert all(r.stats.refreshed_at is not None for r in rows.values())


async def test_the_job_creates_the_rows_inline_writes_missed(season):
    alpha, _, _, people = season
    await refresh_tournament(alpha)

    bob = await _row(people["bob"], alpha)
    assert bob.display_name == "bob"
    assert bob.tournament_slug == "alpha"
    # Dated from their first team, not from when the job happened to run.
    assert bob.first_played_at.replace(tzinfo=None) == datetime(2026, 10, 1, 9, 0)
    assert bob.joined_at.replace(tzinfo=None) == datetime(2026, 10, 1, 9, 0)


async def test_the_job_dates_first_play_for_a_registered_member(season):
    alpha, _, _, people = season
    await refresh_tournament(alpha)
    ann = await _row(people["ann"], alpha)
    assert ann.first_played_at.replace(tzinfo=None) == datetime(2026, 10, 1, 9, 0)


def _utc(value):
    """Naive UTC, whatever zone a date was read back with."""
    return to_ist(value).astimezone(timezone.utc).replace(tzinfo=None)


async def test_the_job_rebuilds_latest_activity(season):
    """The inline writes never recorded ann's or bob's play: the job does."""
    alpha, _, _, people = season
    await refresh_tournament(alpha)

    # ann's second team, entered an hour after it was made; bob's first entry.
    ann = await _row(people["ann"], alpha)
    bob = await _row(people["bob"], alpha)
    assert _utc(ann.last_active_at) == datetime(2026, 10, 2, 10, 0)
    assert _utc(bob.last_active_at) == datetime(2026, 10, 1, 10, 0)


async def test_the_job_keeps_later_activity_written_inline(season):
    alpha, _, _, people = season
    cat = await _row(people["cat"], alpha)
    cat.last_active_at = datetime(2026, 10, 15, 12, 0)
    await cat.save()

    await refresh_tournament(alpha)

    cat = await _row(people["cat"], alpha)
    assert _utc(cat.last_active_at) == datetime(2026, 10, 15, 12, 0)


async def test_the_job_leaves_other_tournaments_alone(season):
    alpha, bravo, _, people = season
    await refresh_tournament(alpha)
    dan = await _row(people["dan"], bravo)
    assert dan.status == STATUS_REGISTERED
    assert dan.stats.refreshed_at is None


async def test_running_the_job_twice_changes_nothing(season):
    alpha, _, _, people = season
    await refresh_tournament(alpha)
    before = (await _row(people["ann"], alpha)).stats.model_dump(
        exclude={"refreshed_at"}
    )

    again = await refresh_tournament(alpha)

    assert again.created == 0
    after = (await _row(people["ann"], alpha)).stats.model_dump(
        exclude={"refreshed_at"}
    )
    assert after == before
    assert (
        await TournamentMembership.find(
            TournamentMembership.tournament_id == alpha.id
        ).count()
        == 4
    )


async def test_the_job_ranks_as_the_leaderboard_does(season, anon_client):
    alpha, _, (c1, c2), people = season
    await refresh_tournament(alpha)

    boards = {}
    for contest in (c1, c2):
        response = await anon_client.get(
            f"/api/contests/{contest.id}/leaderboard", headers=ALPHA
        )
        assert response.status_code == 200, response.text
        boards[contest.code] = [
            (e["username"], e["rank"], e["points"]) for e in response.json()["entries"]
        ]

    assert boards == {
        "C1": [("ann", 1, 27.5), ("bob", 2, 11.5)],
        "C2": [("bob", 1, 23.0), ("ann", 2, 5.0)],
    }
