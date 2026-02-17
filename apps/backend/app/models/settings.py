from typing import Optional
from beanie import Document
from datetime import datetime
from pydantic import Field
from app.utils.timezone import now_ist

class GlobalSettings(Document):
    """
    Singleton document for global application settings.
    We will ensure only one instance exists (ID="global").
    """
    id: str = Field(default="global")  # Fixed ID
    default_contest_logo_file_id: Optional[str] = None
    updated_at: datetime = Field(default_factory=now_ist)

    class Settings:
        name = "global_settings"

    @classmethod
    async def get_instance(cls) -> "GlobalSettings":
        """Get the singleton instance, creating it if it doesn't exist."""
        instance = await cls.get("global")
        if not instance:
            instance = cls(id="global")
            await instance.insert()
        return instance
