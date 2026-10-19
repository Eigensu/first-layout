"""A contest's standings: every active entry and its points, best first.

The leaderboard serves these, and the membership stats job reads each
player's rank from them. One computation, so a profile's best rank is always
the rank its leaderboard showed.
"""

from typing import Dict, List, Tuple

from beanie import PydanticObjectId
from bson import ObjectId

from app.common.enums.enrollments import EnrollmentStatus
from app.models.player_contest_points import PlayerContestPoints
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.user import User
from app.utils.tenant import TenantId, scoped

Standing = Tuple[Team, User, float]


async def contest_standings(
    contest_id: PydanticObjectId, tournament_id: TenantId
) -> List[Standing]:
    """(team, owner, points) for each active entry, highest points first.

    An entry whose team or owner no longer exists is left out, and so takes no
    rank. Points are the contest's own player points, doubled for the captain
    and one and a half times for the vice-captain.
    """
    # fetch active enrollments
    enrollments = (
        await scoped(TeamContestEnrollment, tournament_id)
        .find(
            {
                "contest_id": contest_id,
                "status": EnrollmentStatus.ACTIVE,
            }
        )
        .to_list()
    )

    if not enrollments:
        return []

    team_ids = [enr.team_id for enr in enrollments]

    # fetch teams in batch
    teams = await scoped(Team, tournament_id).find({"_id": {"$in": team_ids}}).to_list()
    teams_by_id: Dict[str, Team] = {str(t.id): t for t in teams}

    # fetch users in batch
    user_ids = list({t.user_id for t in teams})
    users = await User.find({"_id": {"$in": user_ids}}).to_list()
    users_by_id: Dict[str, User] = {str(u.id): u for u in users}

    # 1) Collect all player ObjectIds across enrolled teams
    all_player_ids: set[PydanticObjectId] = set()
    team_player_oids_map: Dict[str, list[PydanticObjectId]] = {}
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        oids = _player_ids(team)
        team_player_oids_map[str(enr.team_id)] = oids
        all_player_ids.update(oids)

    # 2) Fetch all PlayerContestPoints for this contest once
    pcp_docs = []
    if all_player_ids:
        pcp_docs = (
            await scoped(PlayerContestPoints, tournament_id)
            .find(
                {
                    "contest_id": contest_id,
                    "player_id": {"$in": list(all_player_ids)},
                }
            )
            .to_list()
        )

    # 3) Build lookup: player_id(str) -> points(float)
    pcp_points_map: Dict[str, float] = {
        str(doc.player_id): float(doc.points or 0.0) for doc in pcp_docs
    }

    # 4) Sum per team and build computed list (apply C/VC multipliers)
    computed: List[Standing] = []
    for enr in enrollments:
        team = teams_by_id.get(str(enr.team_id))
        if not team:
            continue
        user = users_by_id.get(str(team.user_id))
        if not user:
            continue
        oids = team_player_oids_map.get(str(enr.team_id), [])
        computed.append((team, user, _team_points(team, oids, pcp_points_map)))

    # sort by points desc
    computed.sort(key=lambda tup: tup[2], reverse=True)
    return computed


def _player_ids(team: Team) -> List[PydanticObjectId]:
    """The team's players as ObjectIds; an id that is not one is skipped."""
    oids: List[PydanticObjectId] = []
    for pid in team.player_ids:
        if ObjectId.is_valid(pid):
            try:
                oids.append(PydanticObjectId(pid))
            except Exception:
                continue
    return oids


def _team_points(
    team: Team, oids: List[PydanticObjectId], points_by_player: Dict[str, float]
) -> float:
    """Sum the players' points, with the captain and vice-captain multipliers.

    Compared as strings, which is how the points map is keyed.
    """
    total = 0.0
    captain_id = str(team.captain_id) if team.captain_id else None
    vice_id = str(team.vice_captain_id) if team.vice_captain_id else None
    for oid in oids:
        pid = str(oid)
        base = float(points_by_player.get(pid, 0.0))
        if captain_id and pid == captain_id:
            base *= 2.0
        elif vice_id and pid == vice_id:
            base *= 1.5
        total += base
    return float(total)
