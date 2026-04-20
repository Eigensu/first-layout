from pydantic import BaseModel
from typing import Optional

class GlobalSettingsResponse(BaseModel):
    min_players_per_team: int
    max_players_per_team: int
    default_contest_logo_file_id: Optional[str] = None

class GlobalSettingsUpdate(BaseModel):
    min_players_per_team: Optional[int] = None
    max_players_per_team: Optional[int] = None
