from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime


class TeamCreate(BaseModel):
    """Schema for creating a new team"""
    team_name: str = Field(..., min_length=1, max_length=100)
    player_ids: List[str] = Field(..., description="List of player IDs (1-16 players)")
    captain_id: str
    vice_captain_id: str
    contest_id: Optional[str] = None

    @field_validator('player_ids')
    @classmethod
    def validate_player_ids(cls, v):
        if not v or len(v) < 1:
            raise ValueError('At least 1 player is required')
        if len(v) > 16:
            raise ValueError('Maximum 16 players allowed')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "team_name": "My Dream Team",
                "player_ids": ["player1", "player2", "player3", "player4"],
                "captain_id": "player1",
                "vice_captain_id": "player2",
                "contest_id": "contest123"
            }
        }


class TeamUpdate(BaseModel):
    """Schema for updating a team"""
    team_name: Optional[str] = None
    player_ids: Optional[List[str]] = None
    captain_id: Optional[str] = None
    vice_captain_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "team_name": "Updated Team Name",
                "captain_id": "player3"
            }
        }


class TeamResponse(BaseModel):
    """Schema for team response"""
    id: str
    user_id: str
    team_name: str
    player_ids: List[str]
    captain_id: Optional[str] = None
    vice_captain_id: Optional[str] = None
    total_points: float = 0.0
    total_value: float = 0.0
    rank: Optional[int] = None
    rank_change: Optional[int] = None
    contest_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "user_id": "507f1f77bcf86cd799439012",
                "team_name": "My Dream Team",
                "player_ids": ["player1", "player2", "player3", "player4"],
                "captain_id": "player1",
                "vice_captain_id": "player2",
                "total_points": 450.5,
                "total_value": 1000.0,
                "rank": 1,
                "rank_change": 2,
                "contest_id": "contest123",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }


class TeamsListResponse(BaseModel):
    """Schema for list of teams response"""
    teams: List[TeamResponse]
    total: int

    class Config:
        json_schema_extra = {
            "example": {
                "teams": [
                    {
                        "id": "507f1f77bcf86cd799439011",
                        "user_id": "507f1f77bcf86cd799439012",
                        "team_name": "My Dream Team",
                        "player_ids": ["player1", "player2"],
                        "captain_id": "player1",
                        "vice_captain_id": "player2",
                        "total_points": 450.5,
                        "total_value": 1000.0,
                        "rank": 1,
                        "rank_change": 2,
                        "contest_id": "contest123",
                        "created_at": "2024-01-01T00:00:00",
                        "updated_at": "2024-01-01T00:00:00"
                    }
                ],
                "total": 1
            }
        }


class TeamEditHistoryEntry(BaseModel):
    """Schema for a single team edit history entry"""
    id: str
    user_id: str
    username: Optional[str] = None
    action: str  # "update" | "rename"
    changes: dict  # {"field": {"old": ..., "new": ...}}
    edited_at: datetime

    class Config:
        from_attributes = True


class TeamEditHistoryResponse(BaseModel):
    """Schema for paginated team edit history"""
    history: List[TeamEditHistoryEntry]
    total: int
