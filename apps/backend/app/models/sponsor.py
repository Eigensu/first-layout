from beanie import Document, Indexed
from pydantic import Field, HttpUrl, ConfigDict
from datetime import datetime
from typing import Optional
from enum import Enum
from pymongo import IndexModel


class SponsorTier(str, Enum):
    """Sponsor tier levels"""
    PLATINUM = "platinum"
    GOLD = "gold"
    SILVER = "silver"
    BRONZE = "bronze"


class Sponsor(Document):
    """Sponsor document model for MongoDB using Beanie ODM"""

    name: Indexed(str, unique=True)  # type: ignore
    tier: SponsorTier
    # Public URL to logo served via API; will be '/api/v1/sponsors/{id}/logo'
    logo: Optional[str] = None
    # GridFS file id for the stored logo
    logo_file_id: Optional[str] = None
    # Cloudinary public_id for future updates/deletes
    logo_public_id: Optional[str] = None
    website: Optional[HttpUrl] = None
    description: Optional[str] = None
    featured: bool = False
    active: bool = True
    display_order: int = 0  # Legacy field; superseded by `priority`
    # New priority used to control ordering within featured and non-featured groups
    # Default 0 for backward compatibility; migration will set to >= 1
    priority: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sponsors"  # MongoDB collection name
        use_state_management = False  # Disabled to avoid HttpUrl encoding issues
        indexes = [
            "name",
            "tier",
            [("display_order", 1)],
            [("created_at", -1)],
            # Enforce uniqueness of priority per group (featured vs non-featured)
            # Partial index so it only applies when priority > 0 (before migration many docs have 0)
            IndexModel([("featured", 1), ("priority", 1)], unique=True, partialFilterExpression={"priority": {"$gt": 0}}),
        ]

    def __repr__(self):
        return f"<Sponsor {self.name} ({self.tier})>"

    def __str__(self):
        return self.name
