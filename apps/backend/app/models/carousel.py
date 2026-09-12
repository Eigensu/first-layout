from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import Field, HttpUrl
from pymongo import IndexModel


class CarouselImage(Document):
    """Carousel image document model for MongoDB using Beanie ODM"""

    title: Optional[str] = None
    subtitle: Optional[str] = None
    # GridFS file id for the stored image
    image_file_id: Optional[str] = None
    # Public URL to image served via API; will be '/api/v1/carousel/{id}/image'
    image_url: Optional[str] = None
    link_url: Optional[HttpUrl] = None
    display_order: int = 0
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "carousel_images"  # MongoDB collection name
        use_state_management = False  # Disabled to avoid HttpUrl encoding issues
        indexes = [
            "display_order",
            "active",
            [(("created_at", -1))],
            # Compound index for efficient querying of active images by order
            IndexModel([("active", 1), ("display_order", 1)]),
        ]

    def __repr__(self):
        return (
            f"<CarouselImage {self.title or 'Untitled'} (order: {self.display_order})>"
        )

    def __str__(self):
        return self.title or f"Carousel Image {self.id}"
