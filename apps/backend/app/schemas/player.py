from typing import Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class PlayerOut(BaseModel):
    id: str = Field(..., description="Mongo ObjectId as string")
    name: str
    team: Optional[str] = None
    role: Optional[str] = None
    price: float | int = 0
    slot: int
    points: float | int = 0
    is_available: Optional[bool] = True
    stats: Optional[dict[str, Any]] = None
    form: Optional[str] = None
    injury_status: Optional[str] = None
    image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        json_schema_extra = {
            "example": {
                "id": "68e29ab234bf368cda47fce9",
                "name": "Ankit Shah",
                "team": "DV SPARTANS",
                "role": "User",
                "price": 1000,
                "slot": 1,
                "points": 0,
                "is_available": True,
            }
        }
