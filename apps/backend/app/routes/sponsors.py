from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Response
from fastapi.responses import RedirectResponse
from typing import Optional
from datetime import datetime
from pymongo.errors import DuplicateKeyError

from app.models.sponsor import Sponsor, SponsorTier
from app.models.user import User
from app.schemas.sponsor import (
    SponsorCreate,
    SponsorUpdate,
    SponsorResponse,
    SponsorsListResponse,
    SponsorDetailResponse,
    UploadResponse
)
from app.utils.dependencies import get_current_active_user
from app.utils.gridfs import (
    open_sponsor_logo_stream,
    delete_sponsor_logo_from_gridfs,
)
from app.utils.cloudinary import upload_image, delete_image

router = APIRouter(prefix="/api/v1/sponsors", tags=["sponsors"])


def sponsor_to_response(sponsor: Sponsor) -> dict:
    """Convert Sponsor document to response dict"""
    sponsor_dict = sponsor.model_dump()
    sponsor_dict["_id"] = str(sponsor.id)
    # Normalize legacy/default priority values so response schema (ge=1) doesn't fail
    try:
        if int(sponsor_dict.get("priority", 0) or 0) <= 0:
            sponsor_dict["priority"] = None
    except Exception:
        sponsor_dict["priority"] = None
    return sponsor_dict


async def _get_next_priority(featured: bool) -> int:
    """Find next available priority (max + 1) within the featured group."""
    # Find max priority in the group; skip zeroes (legacy default)
    sponsors = await Sponsor.find({"featured": featured, "priority": {"$gt": 0}})\
        .sort("-priority").limit(1).to_list()
    if not sponsors:
        return 1
    return int((sponsors[0].priority or 0) + 1)


async def _get_available_priorities(featured: bool, limit_gaps: int = 20) -> dict:
    """Compute available priorities: list of lowest gaps and the next available value."""
    # Gather used priorities > 0
    used_docs = await Sponsor.find({"featured": featured, "priority": {"$gt": 0}}).to_list()
    used_set = sorted({int(getattr(s, "priority", 0)) for s in used_docs if getattr(s, "priority", 0)})
    # Find gaps from 1..max-1
    gaps = []
    max_used = used_set[-1] if used_set else 0
    seen = set(used_set)
    for n in range(1, max_used):
        if n not in seen:
            gaps.append(n)
            if len(gaps) >= limit_gaps:
                break
    nxt = max_used + 1 if max_used >= 1 else 1
    return {"gaps": gaps, "next": nxt, "used": used_set}


# Admin helper endpoint MUST be declared before '/{sponsor_id}' to avoid path conflicts
@router.get("/available-priorities")
async def get_available_priorities(
    featured: bool = Query(True, description="Whether to compute priorities for featured or non-featured group"),
    current_user: User = Depends(get_current_active_user)
):
    """Return available priority suggestions (gaps and next) within a group for admin UI."""
    result = await _get_available_priorities(featured)
    return result


# Public endpoints (no authentication required)

@router.get("/", response_model=SponsorsListResponse)
async def get_sponsors(
    tier: Optional[str] = Query(None, description="Filter by tier (platinum, gold, silver, bronze)"),
    featured: Optional[bool] = Query(None, description="Filter by featured status"),
    active: Optional[bool] = Query(True, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=100, description="Items per page")
):
    """
    Get all sponsors with optional filters
    
    - **tier**: Filter by sponsor tier (platinum, gold, silver, bronze)
    - **featured**: Filter by featured status (true/false)
    - **active**: Filter by active status (default: true)
    - **page**: Page number for pagination
    - **page_size**: Number of items per page (max 100)
    """
    # Build query
    query = {}
    
    if tier:
        try:
            query["tier"] = SponsorTier(tier.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid tier. Must be one of: platinum, gold, silver, bronze"
            )
    
    if featured is not None:
        query["featured"] = featured
    
    if active is not None:
        query["active"] = active
    
    # Get total count
    total = await Sponsor.find(query).count()
    
    # Get sponsors with pagination, sorted by priority and created_at
    sponsors = await Sponsor.find(query)\
        .sort("+priority", "-created_at")\
        .skip((page - 1) * page_size)\
        .limit(page_size)\
        .to_list()
    
    return SponsorsListResponse(
        sponsors=[SponsorResponse(**sponsor_to_response(s)) for s in sponsors],
        total=total,
        page=page,
        page_size=page_size
    )


# Accept collection GET without trailing slash to prevent 405 when clients omit the slash
@router.get("", response_model=SponsorsListResponse)
async def get_sponsors_no_slash(
    tier: Optional[str] = Query(None, description="Filter by tier (platinum, gold, silver, bronze)"),
    featured: Optional[bool] = Query(None, description="Filter by featured status"),
    active: Optional[bool] = Query(True, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=100, description="Items per page")
):
    return await get_sponsors(tier=tier, featured=featured, active=active, page=page, page_size=page_size)


@router.get("/{sponsor_id}", response_model=SponsorDetailResponse)
async def get_sponsor(sponsor_id: str):
    """
    Get a single sponsor by ID
    
    - **sponsor_id**: The ID of the sponsor to retrieve
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    return SponsorDetailResponse(
        sponsor=SponsorResponse(**sponsor_to_response(sponsor))
    )




# Accept collection POST without trailing slash to prevent 307 redirects that can drop headers in some clients
@router.post("", response_model=SponsorDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_sponsor_no_slash(
    sponsor_data: SponsorCreate,
    current_user: User = Depends(get_current_active_user)
):
    return await create_sponsor(sponsor_data, current_user)


# Admin endpoints (authentication required)

@router.post("/", response_model=SponsorDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_sponsor(
    sponsor_data: SponsorCreate,
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new sponsor (Admin only)
    
    Requires authentication. Creates a new sponsor with the provided data.
    """
    # Check if sponsor with same name already exists
    existing_sponsor = await Sponsor.find_one(Sponsor.name == sponsor_data.name)
    if existing_sponsor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sponsor with name '{sponsor_data.name}' already exists"
        )
    
    # Determine priority: assign next if not provided or invalid
    data = sponsor_data.model_dump()
    desired_priority = data.get("priority")
    if not isinstance(desired_priority, int) or desired_priority <= 0:
        data["priority"] = await _get_next_priority(featured=data.get("featured", False))

    # Create new sponsor
    sponsor = Sponsor(**data)
    try:
        await sponsor.insert()
    except DuplicateKeyError:
        # Likely (featured, priority) unique index violation
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Priority already in use for this group. Please choose another."
        )
    
    return SponsorDetailResponse(
        sponsor=SponsorResponse(**sponsor_to_response(sponsor))
    )


@router.put("/{sponsor_id}", response_model=SponsorDetailResponse)
async def update_sponsor(
    sponsor_id: str,
    sponsor_data: SponsorUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """
    Update sponsor information (Admin only)
    
    Requires authentication. Updates the specified sponsor with the provided data.
    Only fields that are provided will be updated.
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    # Check if new name conflicts with existing sponsor
    if sponsor_data.name and sponsor_data.name != sponsor.name:
        existing_sponsor = await Sponsor.find_one(Sponsor.name == sponsor_data.name)
        if existing_sponsor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sponsor with name '{sponsor_data.name}' already exists"
            )
    
    # Update fields with priority logic
    update_data = sponsor_data.model_dump(exclude_unset=True)
    if update_data:
        # If featured flag changes, adjust priority if not provided
        featured_changing = "featured" in update_data and update_data["featured"] is not None and update_data["featured"] != sponsor.featured
        if featured_changing and "priority" not in update_data:
            update_data["priority"] = await _get_next_priority(update_data["featured"])  # type: ignore[arg-type]

        # If priority not set or invalid but other fields change, keep existing
        if "priority" in update_data:
            pr = update_data["priority"]
            if not isinstance(pr, int) or pr <= 0:
                update_data["priority"] = await _get_next_priority(update_data.get("featured", sponsor.featured))

        update_data["updated_at"] = datetime.utcnow()
        for field, value in update_data.items():
            setattr(sponsor, field, value)
        try:
            await sponsor.save()
        except DuplicateKeyError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Priority already in use for this group. Please choose another."
            )
    
    return SponsorDetailResponse(
        sponsor=SponsorResponse(**sponsor_to_response(sponsor))
    )


@router.delete("/{sponsor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sponsor(
    sponsor_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a sponsor (Admin only)
    
    Requires authentication. Permanently deletes the specified sponsor.
    Also attempts to delete the associated logo file.
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    # Try to delete logo from the storage provider used for this sponsor.
    if sponsor.logo_file_id:
        await delete_sponsor_logo_from_gridfs(sponsor.logo_file_id)
    if sponsor.logo_public_id:
        await delete_image(sponsor.logo_public_id)
    
    await sponsor.delete()
    return None


@router.post("/{sponsor_id}/upload-logo", response_model=UploadResponse)
async def upload_sponsor_logo(
    sponsor_id: str,
    file: UploadFile = File(..., description="Sponsor logo image"),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload sponsor logo image (Admin only)
    
    Requires authentication. Uploads a logo image for the specified sponsor.
    
    - **Allowed formats**: JPG, JPEG, PNG, SVG, WebP
    - **Maximum size**: 5MB
    - **Recommended size**: 400x400px or larger
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    # Delete previous logo if it exists in either storage backend.
    if sponsor.logo_file_id:
        await delete_sponsor_logo_from_gridfs(sponsor.logo_file_id)
    if sponsor.logo_public_id:
        await delete_image(sponsor.logo_public_id)
    
    # Save new logo to Cloudinary.
    try:
        upload_result = await upload_image(
            file,
            folder="sponsors",
            public_id_prefix=f"sponsor_{sponsor_id}",
        )
        uploaded_logo_url = str(upload_result["secure_url"])
        sponsor.logo = uploaded_logo_url
        sponsor.logo_public_id = upload_result["public_id"]
        # Keep this null to indicate the asset is no longer stored in GridFS.
        sponsor.logo_file_id = None
        sponsor.updated_at = datetime.utcnow()
        await sponsor.save()
        return UploadResponse(
            url=uploaded_logo_url,
            message="Logo uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload logo: {str(e)}"
        )


@router.get("/{sponsor_id}/logo")
async def get_sponsor_logo(sponsor_id: str):
    sponsor = await Sponsor.get(sponsor_id)
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")

    # New logos are stored on Cloudinary and served via direct URL.
    if sponsor.logo_public_id and sponsor.logo:
        return RedirectResponse(url=sponsor.logo)

    if not sponsor.logo_file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")

    stream, content_type = await open_sponsor_logo_stream(sponsor.logo_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)


# Additional utility endpoints

@router.patch("/{sponsor_id}/toggle-featured", response_model=SponsorDetailResponse)
async def toggle_featured(
    sponsor_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Toggle sponsor featured status (Admin only)
    
    Requires authentication. Toggles the featured status of the specified sponsor.
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    sponsor.featured = not sponsor.featured
    # When moving groups, assign next available priority if current priority conflicts or is zero
    if not sponsor.priority or sponsor.priority <= 0:
        sponsor.priority = await _get_next_priority(sponsor.featured)
    sponsor.updated_at = datetime.utcnow()
    await sponsor.save()
    
    return SponsorDetailResponse(
        sponsor=SponsorResponse(**sponsor_to_response(sponsor))
    )


@router.patch("/{sponsor_id}/toggle-active", response_model=SponsorDetailResponse)
async def toggle_active(
    sponsor_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Toggle sponsor active status (Admin only)
    
    Requires authentication. Toggles the active status of the specified sponsor.
    Inactive sponsors can be hidden from public view.
    """
    sponsor = await Sponsor.get(sponsor_id)
    
    if not sponsor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sponsor not found"
        )
    
    sponsor.active = not sponsor.active
    sponsor.updated_at = datetime.utcnow()
    await sponsor.save()
    
    return SponsorDetailResponse(
        sponsor=SponsorResponse(**sponsor_to_response(sponsor))
    )
