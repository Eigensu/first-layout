from typing import Optional

from pydantic import BaseModel, Field


class GlobalSettingsResponse(BaseModel):
    min_players_per_team: int
    max_players_per_team: int
    default_contest_logo_file_id: Optional[str] = None


class GlobalSettingsUpdate(BaseModel):
    min_players_per_team: Optional[int] = Field(default=None, ge=0)
    max_players_per_team: Optional[int] = Field(default=None, ge=1)
