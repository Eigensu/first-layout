from typing import List, Optional

from pydantic import BaseModel


class LeaderboardEntrySchema(BaseModel):
    """Schema for a single leaderboard entry"""

    rank: int
    username: str
    displayName: str
    teamName: str
    points: float
    rankChange: Optional[int] = None
    avatarUrl: Optional[str] = None
    teamId: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "rank": 1,
                "username": "CricketMaster2024",
                "displayName": "Cricket Master",
                "teamName": "Mumbai Warriors",
                "points": 2456.0,
                "rankChange": 1,
            }
        }


class LeaderboardResponseSchema(BaseModel):
    """Schema for leaderboard response"""

    entries: List[LeaderboardEntrySchema]
    currentUserEntry: Optional[LeaderboardEntrySchema] = None

    class Config:
        json_schema_extra = {
            "example": {
                "entries": [
                    {
                        "rank": 1,
                        "username": "CricketMaster2024",
                        "displayName": "Cricket Master",
                        "teamName": "Mumbai Warriors",
                        "points": 2456.0,
                        "rankChange": 1,
                    }
                ],
                "currentUserEntry": None,
            }
        }
