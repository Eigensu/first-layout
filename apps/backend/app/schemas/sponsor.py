from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models.sponsor import SponsorTier


class SponsorBase(BaseModel):
    """Base sponsor schema"""

    name: str = Field(..., min_length=1, max_length=100)
    logo: str = Field(..., description="URL or path to sponsor logo")
    tier: SponsorTier
    description: str = Field(..., min_length=1, max_length=500)
    website: Optional[HttpUrl] = None
    featured: bool = False
    active: bool = True
    display_order: int = Field(default=0, ge=0)
    # Priority controls ordering within featured/non-featured groups. Optional on create; backend will assign next if omitted.
    priority: Optional[int] = Field(default=None, ge=1)


class SponsorCreate(SponsorBase):
    """Schema for creating a new sponsor"""

    pass


class SponsorUpdate(BaseModel):
    """Schema for updating a sponsor - all fields optional"""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    logo: Optional[str] = None
    tier: Optional[SponsorTier] = None
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    website: Optional[HttpUrl] = None
    featured: Optional[bool] = None
    active: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)
    priority: Optional[int] = Field(None, ge=1)


class SponsorResponse(SponsorBase):
    """Schema for sponsor response"""

    id: str = Field(..., alias="_id")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "name": "TechCorp Solutions",
                "logo": "https://example.com/logos/techcorp.png",
                "tier": "platinum",
                "description": "Leading technology partner powering our fantasy platform",
                "website": "https://techcorp.example.com",
                "featured": True,
                "active": True,
                "display_order": 1,
                "priority": 1,
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00",
            }
        },
    )


class SponsorsListResponse(BaseModel):
    """Schema for list of sponsors response"""

    sponsors: list[SponsorResponse]
    total: int
    page: int = 1
    page_size: int = 100

    model_config = ConfigDict(from_attributes=True)


class SponsorDetailResponse(BaseModel):
    """Schema for single sponsor detail response"""

    sponsor: SponsorResponse

    model_config = ConfigDict(from_attributes=True)


class UploadResponse(BaseModel):
    """Schema for file upload response"""

    url: str
    message: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "url": "https://example.com/uploads/sponsor-logo.png",
                "message": "Logo uploaded successfully",
            }
        }
    )
