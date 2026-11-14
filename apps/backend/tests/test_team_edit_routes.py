"""Editing an existing team: it saves before the match and locks during it."""

from datetime import timedelta

from app.common.datetime_utils import utc_now
from app.common.enums.contests import ContestFormat
from app.models.admin.slot import Slot
from app.models.team import Team
from tests.test_auction_team_routes import (  # noqa: F401  (fixtures)
    _body,
    _make_contest,
    _players,
    user,
    user_client,
)


async def _enrolled_team(user_client, **contest_overrides):
    slot = Slot(code="BAT", name="Batters", min_select=2, max_select=4)
    await slot.insert()
    contest = await _make_contest(
        contest_format=ContestFormat.SLOT_BASED, **contest_overrides
    )
    players = await _players(
        [
            (name, team, 10, str(slot.id))
            for name, team in [("a1", "A"), ("b1", "B"), ("c1", "C")]
        ]
    )
    res = await user_client.post("/api/teams/", json=_body(players[:2], contest))
    assert res.status_code == 201, res.text
    team_id = res.json()["id"]
    res = await user_client.post(
        f"/api/contests/{contest.id}/enroll", json={"team_id": team_id}
    )
    assert res.status_code in (200, 201), res.text
    return team_id, [str(p.id) for p in players], contest


async def test_edits_save_before_the_match_starts(user_client, db):
    team_id, ids, _ = await _enrolled_team(user_client)

    res = await user_client.put(
        f"/api/teams/{team_id}",
        json={
            "player_ids": [ids[0], ids[2]],
            "captain_id": ids[2],
            "vice_captain_id": ids[0],
        },
    )
    assert res.status_code == 200, res.text

    res = await user_client.patch(
        f"/api/teams/{team_id}/rename", params={"team_name": "Renamed"}
    )
    assert res.status_code == 200, res.text

    saved = await Team.get(team_id)
    assert saved.player_ids == [ids[0], ids[2]]
    assert saved.captain_id == ids[2]
    assert saved.team_name == "Renamed"


async def test_edits_are_refused_while_the_contest_is_ongoing(user_client, db):
    team_id, ids, contest = await _enrolled_team(user_client)
    contest.start_at = utc_now() - timedelta(hours=1)
    await contest.save()

    res = await user_client.put(
        f"/api/teams/{team_id}", json={"captain_id": ids[1], "vice_captain_id": ids[0]}
    )
    assert res.status_code == 409
    assert "locked" in res.json()["detail"]

    assert (await Team.get(team_id)).captain_id == ids[0]
