from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from pymongo.errors import DuplicateKeyError

from app.models.carousel import CarouselImage
from app.models.user import User
from app.schemas.carousel import (
    CarouselImageCreate,
    CarouselImageResponse,
    CarouselImagesListResponse,
    CarouselImageUpdate,
    ReorderRequest,
    UploadResponse,
)
from app.utils.dependencies import get_current_active_user
from app.utils.gridfs import (
    delete_carousel_image_from_gridfs,
    open_carousel_image_stream,
    upload_carousel_image_to_gridfs,
)

router = APIRouter(prefix="/api/v1/carousel", tags=["carousel"])


def carousel_to_response(carousel: CarouselImage) -> dict:
    """Convert CarouselImage document to response dict"""
    carousel_dict = carousel.model_dump()
    carousel_dict["_id"] = str(carousel.id)
    # Convert HttpUrl to string for JSON serialization
    if carousel_dict.get("link_url"):
        carousel_dict["link_url"] = str(carousel_dict["link_url"])
    return carousel_dict


# Public endpoints (no authentication required)


@router.get("/", response_model=CarouselImagesListResponse)
async def get_carousel_images(
    active: Optional[bool] = Query(True, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=100, description="Items per page"),
):
    """
    Get carousel images with optional filters (Public endpoint)

    - **active**: Filter by active status (default: true, only active images)
    - **page**: Page number for pagination
    - **page_size**: Number of items per page (max 100)
    """
    # Build query
    query = {}

    if active is not None:
        query["active"] = active

    # Get total count
    total = await CarouselImage.find(query).count()

    # Get carousel images with pagination, sorted by display_order and created_at
    images = (
        await CarouselImage.find(query)
        .sort("+display_order", "+created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return CarouselImagesListResponse(
        images=[CarouselImageResponse(**carousel_to_response(img)) for img in images],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{carousel_id}/image")
async def get_carousel_image(carousel_id: str):
    """Serve the carousel image file (Public endpoint)"""
    carousel = await CarouselImage.get(carousel_id)
    if not carousel or not carousel.image_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )
    stream, content_type = await open_carousel_image_stream(carousel.image_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)


# Admin endpoints (authentication required)


@router.post(
    "/", response_model=CarouselImageResponse, status_code=status.HTTP_201_CREATED
)
async def create_carousel_image(
    carousel_data: CarouselImageCreate,
    current_user: User = Depends(get_current_active_user),
):
    """
    Create a new carousel image entry (Admin only)

    Requires authentication. Creates a new carousel image with the provided metadata.
    Image file must be uploaded separately via the upload endpoint.
    """
    # Determine display_order: use provided or get next available
    data = carousel_data.model_dump()
    if data.get("display_order") is None:
        # Find max display_order and add 1
        existing = await CarouselImage.find().sort("-display_order").limit(1).to_list()
        data["display_order"] = (existing[0].display_order + 1) if existing else 0

    # Create new carousel image
    carousel = CarouselImage(**data)
    await carousel.insert()

    return CarouselImageResponse(**carousel_to_response(carousel))


@router.get("/{carousel_id}", response_model=CarouselImageResponse)
async def get_carousel_image_detail(
    carousel_id: str, current_user: User = Depends(get_current_active_user)
):
    """
    Get a single carousel image by ID (Admin only)

    - **carousel_id**: The ID of the carousel image to retrieve
    """
    carousel = await CarouselImage.get(carousel_id)

    if not carousel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carousel image not found"
        )

    return CarouselImageResponse(**carousel_to_response(carousel))


@router.put("/{carousel_id}", response_model=CarouselImageResponse)
async def update_carousel_image(
    carousel_id: str,
    carousel_data: CarouselImageUpdate,
    current_user: User = Depends(get_current_active_user),
):
    """
    Update carousel image metadata (Admin only)

    Requires authentication. Updates the specified carousel image with the provided data.
    Only fields that are provided will be updated.
    """
    carousel = await CarouselImage.get(carousel_id)

    if not carousel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carousel image not found"
        )

    # Update fields
    update_data = carousel_data.model_dump(exclude_unset=True)
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        for field, value in update_data.items():
            setattr(carousel, field, value)
        await carousel.save()

    return CarouselImageResponse(**carousel_to_response(carousel))


@router.delete("/{carousel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_carousel_image(
    carousel_id: str, current_user: User = Depends(get_current_active_user)
):
    """
    Delete a carousel image (Admin only)

    Requires authentication. Permanently deletes the specified carousel image.
    Also attempts to delete the associated image file from GridFS.
    """
    carousel = await CarouselImage.get(carousel_id)

    if not carousel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carousel image not found"
        )

    # Try to delete image from GridFS if it exists
    if carousel.image_file_id:
        await delete_carousel_image_from_gridfs(carousel.image_file_id)

    await carousel.delete()
    return None


@router.post("/{carousel_id}/upload-image", response_model=UploadResponse)
async def upload_carousel_image(
    carousel_id: str,
    file: UploadFile = File(..., description="Carousel image"),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upload carousel image file (Admin only)

    Requires authentication. Uploads an image for the specified carousel entry.

    - **Allowed formats**: JPG, JPEG, PNG, SVG, WebP
    - **Maximum size**: 5MB
    - **Recommended dimensions**: 1920x500px or similar wide aspect ratio
    """
    carousel = await CarouselImage.get(carousel_id)

    if not carousel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carousel image not found"
        )

    # Delete old image if it exists in GridFS
    if carousel.image_file_id:
        await delete_carousel_image_from_gridfs(carousel.image_file_id)

    # Save new image to GridFS
    try:
        file_id = await upload_carousel_image_to_gridfs(
            file, filename_prefix=f"carousel_{carousel_id}"
        )
        # Update carousel with API URL and file id
        carousel.image_file_id = file_id
        carousel.image_url = f"/api/v1/carousel/{carousel_id}/image"
        carousel.updated_at = datetime.utcnow()
        await carousel.save()
        return UploadResponse(
            url=carousel.image_url, message="Image uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(e)}",
        )


@router.patch("/{carousel_id}/toggle-active", response_model=CarouselImageResponse)
async def toggle_active(
    carousel_id: str, current_user: User = Depends(get_current_active_user)
):
    """
    Toggle carousel image active status (Admin only)

    Requires authentication. Toggles the active status of the specified carousel image.
    """
    carousel = await CarouselImage.get(carousel_id)

    if not carousel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carousel image not found"
        )

    carousel.active = not carousel.active
    carousel.updated_at = datetime.utcnow()
    await carousel.save()

    return CarouselImageResponse(**carousel_to_response(carousel))


@router.patch("/reorder", status_code=status.HTTP_200_OK)
async def reorder_carousel_images(
    reorder_data: ReorderRequest, current_user: User = Depends(get_current_active_user)
):
    """
    Batch update display order of carousel images (Admin only)

    Requires authentication. Updates the display_order for multiple carousel images.
    Expects a list of {id: str, display_order: int} objects.
    """
    for item in reorder_data.image_orders:
        carousel_id = item.get("id")
        new_order = item.get("display_order")

        if carousel_id and new_order is not None:
            carousel = await CarouselImage.get(carousel_id)
            if carousel:
                carousel.display_order = new_order
                carousel.updated_at = datetime.utcnow()
                await carousel.save()

    return {"message": "Carousel images reordered successfully"}
