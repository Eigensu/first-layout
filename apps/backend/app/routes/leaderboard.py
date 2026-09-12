from datetime import datetime
from typing import List, Optional, Tuple

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.models.player import Player as PublicPlayer
from app.models.team import Team
from app.models.user import User
from app.schemas.leaderboard import LeaderboardEntrySchema, LeaderboardResponseSchema
from app.utils.security import decode_token

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


async def get_optional_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """Get current user if authenticated, otherwise return None"""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        token = authorization.replace("Bearer ", "")
        payload = decode_token(token)
        if payload is None:
            return None

        username = payload.get("sub")
        if not username or not isinstance(username, str):
            return None

        # Find user in MongoDB
        user = await User.find_one(User.username == username)
        return user
    except Exception:
        return None


async def _compute_team_points(team: Team) -> float:
    """Sum current points of all players in a team."""
    player_object_ids = []
    for pid in team.player_ids:
        try:
            player_object_ids.append(PydanticObjectId(pid))
        except Exception:
            continue
    if not player_object_ids:
        return 0.0
    players = await PublicPlayer.find({"_id": {"$in": player_object_ids}}).to_list()
    return float(sum(float(p.points or 0.0) for p in players))


@router.get("", response_model=LeaderboardResponseSchema)
async def get_leaderboard(
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> LeaderboardResponseSchema:
    """
    Get the global leaderboard with all teams ranked by total points.
    If user is authenticated, also returns their position.
    """
    try:
        # Fetch all teams
        teams = await Team.find_all().to_list()

        # If no teams exist, return mock data for development
        if not teams:
            return _get_mock_leaderboard(current_user)

        # Build leaderboard entries
        entries = []
        current_user_entry = None

        # Compute points for all teams with a single players query to avoid N+1
        # 1) Collect all player ObjectIds across teams
        all_player_ids: set[PydanticObjectId] = set()
        team_player_ids_map: dict[str, list[PydanticObjectId]] = {}
        for team in teams:
            obj_ids: list[PydanticObjectId] = []
            for pid in team.player_ids:
                try:
                    obj_ids.append(PydanticObjectId(pid))
                except Exception:
                    continue
            team_player_ids_map[str(team.id)] = obj_ids
            all_player_ids.update(obj_ids)

        # 2) Fetch all needed players once
        players = []
        if all_player_ids:
            players = await PublicPlayer.find(
                {"_id": {"$in": list(all_player_ids)}}
            ).to_list()

        # 3) Build a points lookup
        player_points_map = {str(p.id): float(p.points or 0.0) for p in players}

        # 4) Compute per-team totals using the lookup and optionally sync stored totals
        team_points_list: List[Tuple[Team, float]] = []
        for team in teams:
            ids_for_team = team_player_ids_map.get(str(team.id), [])
            computed_points = sum(
                player_points_map.get(str(obj_id), 0.0) for obj_id in ids_for_team
            )
            team_points_list.append((team, float(computed_points)))
            # Sync stored total if differs
            try:
                if float(team.total_points or 0.0) != float(computed_points):
                    team.total_points = float(computed_points)
                    team.updated_at = datetime.utcnow()
                    await team.save()
            except Exception:
                pass

        # Sort by computed points desc
        team_points_list.sort(key=lambda x: x[1], reverse=True)

        for idx, (team, points) in enumerate(team_points_list):
            rank = idx + 1
            # Get user info for this team
            user = await User.get(team.user_id)
            if not user:
                continue

            entry = LeaderboardEntrySchema(
                rank=rank,
                username=user.username,
                displayName=user.full_name or user.username,
                teamName=team.team_name,
                points=points,
                rankChange=team.rank_change,
                avatarUrl=user.avatar_url if hasattr(user, "avatar_url") else None,
            )

            entries.append(entry)

            # Check if this is the current user's team
            if current_user and str(team.user_id) == str(current_user.id):
                current_user_entry = entry

        return LeaderboardResponseSchema(
            entries=entries, currentUserEntry=current_user_entry
        )
    except Exception as e:
        # In case of error, return mock data
        print(f"Error fetching leaderboard: {e}")
        return _get_mock_leaderboard(current_user)
