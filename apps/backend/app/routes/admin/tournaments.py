from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from beanie import PydanticObjectId

from app.models.tournament import Tournament
from app.models.user import User
from app.common.enums.tournaments import TournamentStatus
from app.schemas.tournament import (
    TournamentCreate,
    TournamentUpdate,
    TournamentResponse,
    TournamentListResponse,
    SlugAvailabilityResponse,
    validate_slug,
)
from app.utils.dependencies import get_admin_user
from app.utils.timezone import now_ist, to_ist

router = APIRouter(prefix="/api/admin/tournaments", tags=["Admin - Tournaments"])


def to_response(t: Tournament) -> TournamentResponse:
    return TournamentResponse(
        id=str(t.id),
        slug=t.slug,
        name=t.name,
        description=t.description,
        logo_url=t.logo_url,
        status=t.status,
        start_at=t.start_at,
        end_at=t.end_at,
        primary_color=t.primary_color,
        secondary_color=t.secondary_color,
        api_base_url=t.api_base_url,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


async def _get_or_404(tournament_id: str) -> Tournament:
    try:
        oid = PydanticObjectId(tournament_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tournament id")
    tournament = await Tournament.get(oid)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament


@router.get("/check-slug/{slug}", response_model=SlugAvailabilityResponse)
async def check_slug(slug: str, current_user: User = Depends(get_admin_user)):
    """Live availability check used by the create form."""
    try:
        normalized = validate_slug(slug)
    except ValueError as e:
        return SlugAvailabilityResponse(slug=slug, available=False, reason=str(e))

    existing = await Tournament.find_one(Tournament.slug == normalized)
    if existing:
        return SlugAvailabilityResponse(
            slug=normalized, available=False, reason="Slug is already taken"
        )
    return SlugAvailabilityResponse(slug=normalized, available=True)


@router.post("", response_model=TournamentResponse, status_code=201)
async def create_tournament(
    data: TournamentCreate,
    current_user: User = Depends(get_admin_user),
):
    if data.start_at and data.end_at and data.start_at >= data.end_at:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    existing = await Tournament.find_one(Tournament.slug == data.slug)
    if existing:
        raise HTTPException(status_code=400, detail="Slug is already taken")

    now = now_ist()
    tournament = Tournament(
        slug=data.slug,
        name=data.name,
        description=data.description,
        logo_url=data.logo_url,
        status=data.status,
        start_at=data.start_at,
        end_at=data.end_at,
        primary_color=data.primary_color,
        secondary_color=data.secondary_color,
        api_base_url=data.api_base_url,
        created_at=now,
        updated_at=now,
    )
    await tournament.insert()
    return to_response(tournament)


@router.get("", response_model=TournamentListResponse)
async def list_tournaments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[TournamentStatus] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_admin_user),
):
    conditions = []
    if status:
        conditions.append(Tournament.status == status)
    if search:
        from beanie.operators import Or, RegEx

        conditions.append(
            Or(
                RegEx(Tournament.slug, search, options="i"),
                RegEx(Tournament.name, search, options="i"),
            )
        )

    query = Tournament.find(conditions[0]) if conditions else Tournament.find_all()
    for cond in conditions[1:]:
        query = query.find(cond)

    total = await query.count()
    skip = (page - 1) * page_size
    rows = await query.skip(skip).limit(page_size).sort(-Tournament.created_at).to_list()
    return TournamentListResponse(
        tournaments=[to_response(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{tournament_id}", response_model=TournamentResponse)
async def get_tournament(
    tournament_id: str,
    current_user: User = Depends(get_admin_user),
):
    tournament = await _get_or_404(tournament_id)
    return to_response(tournament)


@router.put("/{tournament_id}", response_model=TournamentResponse)
async def update_tournament(
    tournament_id: str,
    data: TournamentUpdate,
    current_user: User = Depends(get_admin_user),
):
    tournament = await _get_or_404(tournament_id)

    updates = data.model_dump(exclude_unset=True)

    # Optional fields may be sent as null to clear them, but core identity
    # fields can only be replaced, never nulled.
    for required_field in ("slug", "name", "status"):
        if required_field in updates and updates[required_field] is None:
            updates.pop(required_field)

    new_slug = updates.get("slug")
    if new_slug and new_slug != tournament.slug:
        existing = await Tournament.find_one(Tournament.slug == new_slug)
        if existing:
            raise HTTPException(status_code=400, detail="Slug is already taken")

    for field, value in updates.items():
        setattr(tournament, field, value)

    # Values just set from the request are IST-aware (schema validation);
    # values still on the document from a prior fetch may be naive (Mongo
    # round-trips datetimes as naive UTC). Normalize both before comparing.
    if (
        tournament.start_at
        and tournament.end_at
        and to_ist(tournament.start_at) >= to_ist(tournament.end_at)
    ):
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    tournament.updated_at = now_ist()
    await tournament.save()
    return to_response(tournament)


@router.delete("/{tournament_id}")
async def delete_tournament(
    tournament_id: str,
    force: bool = Query(False, description="Permanently delete instead of archiving"),
    current_user: User = Depends(get_admin_user),
):
    tournament = await _get_or_404(tournament_id)

    if force:
        await tournament.delete()
        return {"message": f"Tournament '{tournament.slug}' permanently deleted"}

    tournament.status = TournamentStatus.ARCHIVED
    tournament.updated_at = now_ist()
    await tournament.save()
    return {"message": f"Tournament '{tournament.slug}' archived; its subdomain no longer resolves"}
