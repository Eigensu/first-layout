"""Enrolling a team re-checks it against the contest, in every format.

Teams are inserted straight into the database here rather than through
POST /api/teams, standing in for squads that never met the contest's rules:
saved for another contest, saved with no contest from the teams page, or
saved before the contest's rules moved. Both enroll paths, the user's
POST /api/contests/{id}/enroll and the admin's bulk enroll-teams, must refuse
them.
"""

from datetime import timedelta

import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient

from app.common.datetime_utils import utc_now
from app.common.enums.contests import ContestFormat
from app.models.admin.slot import Slot
from app.models.contest import Contest
from app.models.player import Player
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.user import User
from app.utils.dependencies import get_current_active_user


@pytest_asyncio.fixture
async def player(db):
    """An HTTP client signed in as a regular user, and that user."""
    from main import app

    u = User(
        username="enroll-user",
        email="enroll@example.com",
        hashed_password="not-a-real-hash",
        is_active=True,
        is_verified=True,
    )
    await u.insert()

    async def _fake_user():
        return u

    app.dependency_overrides[get_current_active_user] = _fake_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, u
    app.dependency_overrides.pop(get_current_active_user, None)


async def _slots():
    """Two slots, each needing exactly two players."""
    bat = Slot(code="BAT", name="Batters", min_select=2, max_select=2)
    bowl = Slot(code="BOWL", name="Bowlers", min_select=2, max_select=2)
    await bat.insert()
    await bowl.insert()
    return bat, bowl


async def _contest(code="c1", **overrides) -> Contest:
    start = utc_now() + timedelta(days=1)
    fields = {
        "code": code,
        "name": code.upper(),
        "start_at": start,
        "end_at": start + timedelta(days=7),
    }
    fields.update(overrides)
    contest = Contest(**fields)
    await contest.insert()
    return contest


async def _player(name, team, price, slot=None) -> Player:
    p = Player(
        name=name,
        team=team,
        price=price,
        slot=str(slot.id) if slot else None,
        status="Active",
    )
    await p.insert()
    return p


async def _squad(bat, bowl, price=100):
    """Two batters and two bowlers, two from each real-world team."""
    return [
        await _player("bat1", "A", price, bat),
        await _player("bat2", "B", price, bat),
        await _player("bowl1", "A", price, bowl),
        await _player("bowl2", "B", price, bowl),
    ]


async def _team(user_id, players, contest=None, name="Squad") -> Team:
    ids = [str(p.id) for p in players]
    team = Team(
        user_id=user_id,
        team_name=name,
        player_ids=ids,
        captain_id=ids[0],
        vice_captain_id=ids[1],
        contest_id=str(contest.id) if contest else None,
    )
    await team.insert()
    return team


def _uid() -> PydanticObjectId:
    return PydanticObjectId()


async def _enroll(client, contest, team):
    return await client.post(
        f"/api/contests/{contest.id}/enroll", json={"team_id": str(team.id)}
    )


async def _active_enrollments(contest) -> int:
    return await TeamContestEnrollment.find(
        TeamContestEnrollment.contest_id == contest.id
    ).count()


# --- user enroll -------------------------------------------------------------


async def test_valid_team_built_for_the_contest_is_enrolled(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest()
    team = await _team(user.id, await _squad(bat, bowl), contest)

    res = await _enroll(client, contest, team)

    assert res.status_code == 200, res.text
    assert await _active_enrollments(contest) == 1


async def test_team_built_for_another_contest_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    built_for = await _contest("c1")
    other = await _contest("c2")
    team = await _team(user.id, await _squad(bat, bowl), built_for)

    res = await _enroll(client, other, team)

    assert res.status_code == 400
    assert "built for a different contest" in res.json()["detail"]
    assert await _active_enrollments(other) == 0


async def test_slot_based_team_breaking_slot_rules_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest()
    # Three batters and one bowler: the wrong shape.
    players = [
        await _player("bat1", "A", 10, bat),
        await _player("bat2", "B", 10, bat),
        await _player("bat3", "C", 10, bat),
        await _player("bowl1", "A", 10, bowl),
    ]
    team = await _team(user.id, players, contest)

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert (
        res.json()["detail"]["message"]
        == "Team violates per-slot selection constraints"
    )
    assert await _active_enrollments(contest) == 0


async def test_slot_purse_team_over_the_purse_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest(contest_format=ContestFormat.SLOT_PURSE, purse=300)
    team = await _team(user.id, await _squad(bat, bowl, price=100), contest)

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert res.json()["detail"]["over_by"] == 100
    assert await _active_enrollments(contest) == 0


async def test_auction_team_of_the_wrong_size_is_refused(player, db):
    client, user = player
    contest = await _contest(
        contest_format=ContestFormat.AUCTION_PURSE, squad_size=3, purse=1_000
    )
    players = [
        await _player("p1", "A", 100),
        await _player("p2", "B", 100),
    ]
    team = await _team(user.id, players, contest)

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert "exactly 3 players" in res.json()["detail"]
    assert await _active_enrollments(contest) == 0


async def test_daily_team_with_players_outside_allowed_teams_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest(contest_type="daily", allowed_teams=["A", "C"])
    team = await _team(user.id, await _squad(bat, bowl), contest)

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert set(res.json()["detail"]["disallowed_players"]) == {"bat2", "bowl2"}


async def test_team_with_a_deleted_player_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest()
    players = await _squad(bat, bowl)
    team = await _team(user.id, players, contest)
    await players[3].delete()

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert res.json()["detail"] == "Some player IDs are invalid"


async def test_contest_less_team_that_meets_the_rules_joins_and_is_bound(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest()
    team = await _team(user.id, await _squad(bat, bowl), contest=None)

    res = await _enroll(client, contest, team)

    assert res.status_code == 200, res.text
    assert (await Team.get(team.id)).contest_id == str(contest.id)


async def test_contest_less_team_that_breaks_the_rules_is_refused(player, db):
    client, user = player
    bat, bowl = await _slots()
    contest = await _contest(contest_format=ContestFormat.SLOT_PURSE, purse=300)
    team = await _team(user.id, await _squad(bat, bowl, price=100), contest=None)

    res = await _enroll(client, contest, team)

    assert res.status_code == 400
    assert res.json()["detail"]["over_by"] == 100
    assert (await Team.get(team.id)).contest_id is None


# --- admin bulk enroll -------------------------------------------------------


async def _admin_enroll(client, contest, *teams):
    return await client.post(
        f"/api/admin/contests/{contest.id}/enroll-teams",
        json={"team_ids": [str(t.id) for t in teams]},
    )


async def test_admin_enrolls_valid_teams(client, db):
    bat, bowl = await _slots()
    contest = await _contest()
    team = await _team(_uid(), await _squad(bat, bowl), contest)

    res = await _admin_enroll(client, contest, team)

    assert res.status_code == 200, res.text
    assert len(res.json()) == 1


async def test_admin_batch_with_one_bad_team_enrolls_nothing(client, db):
    bat, bowl = await _slots()
    contest = await _contest(contest_format=ContestFormat.SLOT_PURSE, purse=400)
    other = await _contest("c2")
    good = await _team(_uid(), await _squad(bat, bowl, price=100), contest, "Good")
    pricey = [
        await _player("star-bat1", "A", 200, bat),
        await _player("star-bat2", "B", 200, bat),
        await _player("star-bowl1", "A", 200, bowl),
        await _player("star-bowl2", "B", 200, bowl),
    ]
    over = await _team(_uid(), pricey, contest, "Over Purse")
    elsewhere = await _team(_uid(), await _squad(bat, bowl), other, "Elsewhere")

    res = await _admin_enroll(client, contest, good, over, elsewhere)

    assert res.status_code == 400
    detail = res.json()["detail"]
    assert detail["message"].startswith("2 team(s) cannot join")
    rejected = detail["rejected_teams"]
    assert any(line.startswith("Over Purse: Squad exceeds") for line in rejected)
    assert any(
        line.startswith("Elsewhere:") and "different contest" in line
        for line in rejected
    )
    assert await _active_enrollments(contest) == 0
