from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class CarouselImageCreate(BaseModel):
    """Schema for creating a new carousel image"""

    title: Optional[str] = None
    subtitle: Optional[str] = None
    link_url: Optional[HttpUrl] = None
    display_order: Optional[int] = Field(
        None, ge=0, description="Display order (0 or higher)"
    )
    active: bool = True


class CarouselImageUpdate(BaseModel):
    """Schema for updating carousel image metadata"""

    title: Optional[str] = None
    subtitle: Optional[str] = None
    link_url: Optional[HttpUrl] = None
    display_order: Optional[int] = Field(None, ge=0)
    active: Optional[bool] = None


class CarouselImageResponse(BaseModel):
    """Schema for carousel image API response"""

    id: str = Field(serialization_alias="_id")
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    display_order: int
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class CarouselImagesListResponse(BaseModel):
    """Schema for paginated list of carousel images"""

    images: List[CarouselImageResponse]
    total: int
    page: int
    page_size: int


class UploadResponse(BaseModel):
    """Schema for image upload response"""

    url: str
    message: str


class ReorderRequest(BaseModel):
    """Schema for batch reordering carousel images"""

    image_orders: List[dict] = Field(
        ..., description="List of {id: str, display_order: int}"
    )
