from typing import Optional

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from app.common.datetime_utils import to_utc_naive, utc_now
from app.common.enums.tournaments import TournamentStatus
from app.models.admin.audit_log import AdminActionLog
from app.models.tournament import Tournament
from app.models.tournament_membership import (
    ROLE_ADMIN,
    ROLE_PLAYER,
    TournamentMembership,
)
from app.models.user import User
from app.schemas.tournament import (
    SlugAvailabilityResponse,
    TournamentAdminAppoint,
    TournamentAdminListResponse,
    TournamentAdminResponse,
    TournamentCreate,
    TournamentListResponse,
    TournamentResponse,
    TournamentUpdate,
    validate_slug,
)
from app.services.auth.identity import AmbiguousIdentifier, resolve_login_identity
from app.utils.dependencies import get_platform_admin
from config.settings import settings

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
async def check_slug(slug: str, current_user: User = Depends(get_platform_admin)):
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
    current_user: User = Depends(get_platform_admin),
):
    if data.start_at and data.end_at and data.start_at >= data.end_at:
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    existing = await Tournament.find_one(Tournament.slug == data.slug)
    if existing:
        raise HTTPException(status_code=400, detail="Slug is already taken")

    now = utc_now()
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
    current_user: User = Depends(get_platform_admin),
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
    rows = (
        await query.skip(skip).limit(page_size).sort(-Tournament.created_at).to_list()
    )
    return TournamentListResponse(
        tournaments=[to_response(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{tournament_id}", response_model=TournamentResponse)
async def get_tournament(
    tournament_id: str,
    current_user: User = Depends(get_platform_admin),
):
    tournament = await _get_or_404(tournament_id)
    return to_response(tournament)


@router.put("/{tournament_id}", response_model=TournamentResponse)
async def update_tournament(
    tournament_id: str,
    data: TournamentUpdate,
    current_user: User = Depends(get_platform_admin),
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
        and to_utc_naive(tournament.start_at) >= to_utc_naive(tournament.end_at)
    ):
        raise HTTPException(status_code=400, detail="start_at must be before end_at")

    tournament.updated_at = utc_now()
    await tournament.save()
    return to_response(tournament)


@router.delete("/{tournament_id}")
async def delete_tournament(
    tournament_id: str,
    force: bool = Query(False, description="Permanently delete instead of archiving"),
    current_user: User = Depends(get_platform_admin),
):
    tournament = await _get_or_404(tournament_id)

    if force:
        await tournament.delete()
        return {"message": f"Tournament '{tournament.slug}' permanently deleted"}

    tournament.status = TournamentStatus.ARCHIVED
    tournament.updated_at = utc_now()
    await tournament.save()
    return {
        "message": f"Tournament '{tournament.slug}' archived; its subdomain no longer resolves"
    }


# --- who administers a tournament ----------------------------------------------
#
# Under shared tenancy, admin is a role on one tournament's membership
# (spec §4.7); these are how a platform admin hands it out. A legacy
# single-tournament service still uses the global is_admin, so there is nothing
# for them to do there.


def _require_shared_tenancy() -> None:
    if not settings.shared_tenancy:
        raise HTTPException(
            status_code=409,
            detail=(
                "Tournament admins are appointed on the shared backend only. "
                "On this service, admins are the accounts with is_admin set."
            ),
        )


def _admin_response(
    user: User, membership: TournamentMembership
) -> TournamentAdminResponse:
    return TournamentAdminResponse(
        user_id=str(user.id),
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        display_name=membership.display_name,
    )


async def _log_admin_change(
    admin: User, action: str, user_id: PydanticObjectId, tournament: Tournament
) -> None:
    await AdminActionLog(
        admin_id=str(admin.id),
        action=action,
        target_type="user",
        target_id=str(user_id),
        details={"tournament_slug": tournament.slug},
        tournament_id=tournament.id,
    ).insert()


def _membership_of(user_id: PydanticObjectId, tournament: Tournament):
    return TournamentMembership.find_one(
        TournamentMembership.user_id == user_id,
        TournamentMembership.tournament_id == tournament.id,
    )


async def _set_role(membership: TournamentMembership, role: str) -> None:
    # Only the role is written. A save() would write back every field as it
    # was loaded, undoing a sign-in, a first play or a stats refresh that
    # landed in between.
    await membership.set({TournamentMembership.role: role})


_NOT_SHARED = {
    409: {"description": "Not the shared backend; admins there are is_admin"}
}


@router.get(
    "/{tournament_id}/admins",
    response_model=TournamentAdminListResponse,
    responses={404: {"description": "Tournament not found"}, **_NOT_SHARED},
)
async def list_tournament_admins(
    tournament_id: str,
    current_user: User = Depends(get_platform_admin),
):
    """Who administers this tournament. Platform admins run every tournament
    and are not listed unless they were also appointed here."""
    _require_shared_tenancy()
    tournament = await _get_or_404(tournament_id)
    memberships = await TournamentMembership.find(
        TournamentMembership.tournament_id == tournament.id,
        TournamentMembership.role == ROLE_ADMIN,
    ).to_list()
    users = {
        user.id: user
        for user in await User.find(
            In(User.id, [m.user_id for m in memberships])
        ).to_list()
    }
    admins = [
        _admin_response(users[m.user_id], m) for m in memberships if m.user_id in users
    ]
    admins.sort(key=lambda a: a.display_name.lower())
    return TournamentAdminListResponse(admins=admins)


@router.post(
    "/{tournament_id}/admins",
    response_model=TournamentAdminResponse,
    responses={
        400: {"description": "That account is disabled"},
        404: {"description": "Tournament not found, or no account by that identifier"},
        409: {
            "description": "Not the shared backend, or a username held by more than one account"
        },
    },
)
async def appoint_tournament_admin(
    tournament_id: str,
    data: TournamentAdminAppoint,
    current_user: User = Depends(get_platform_admin),
):
    """Make someone an admin of this tournament, found by whatever they sign in with.

    They need an account already. Someone who has never been to this
    tournament gets a membership here, as if they had signed in on its site.
    Appointing an existing admin again changes nothing.
    """
    _require_shared_tenancy()
    tournament = await _get_or_404(tournament_id)
    try:
        user = await resolve_login_identity(data.identifier)
    except AmbiguousIdentifier:
        raise HTTPException(
            status_code=409,
            detail=(
                "That username belongs to more than one account. "
                "Use their mobile number or email instead."
            ),
        )
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="No account signs in with that mobile number, email or username",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="That account is disabled")

    membership = await _membership_of(user.id, tournament)
    if membership is None:
        try:
            membership = await TournamentMembership(
                user_id=user.id,
                tournament_id=tournament.id,
                tournament_slug=tournament.slug,
                display_name=user.username,
                role=ROLE_ADMIN,
            ).insert()
        except DuplicateKeyError:
            # They signed in on the tournament's site at the same moment, which
            # created their row first. Promote that one instead.
            membership = await _membership_of(user.id, tournament)
        else:
            await _log_admin_change(
                current_user, "tournament_admin.appoint", user.id, tournament
            )
            return _admin_response(user, membership)

    if membership.role != ROLE_ADMIN:
        await _set_role(membership, ROLE_ADMIN)
        await _log_admin_change(
            current_user, "tournament_admin.appoint", user.id, tournament
        )
    return _admin_response(user, membership)


@router.delete(
    "/{tournament_id}/admins/{user_id}",
    responses={
        400: {"description": "Invalid user id"},
        404: {"description": "Tournament not found, or not an admin of it"},
        **_NOT_SHARED,
    },
)
async def remove_tournament_admin(
    tournament_id: str,
    user_id: str,
    current_user: User = Depends(get_platform_admin),
):
    """Stop someone administering this tournament.

    They stay a member: the teams and results they have here are still theirs.
    """
    _require_shared_tenancy()
    tournament = await _get_or_404(tournament_id)
    try:
        uid = PydanticObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
    membership = await _membership_of(uid, tournament)
    if membership is None or membership.role != ROLE_ADMIN:
        raise HTTPException(status_code=404, detail="Not an admin of this tournament")
    await _set_role(membership, ROLE_PLAYER)
    await _log_admin_change(current_user, "tournament_admin.remove", uid, tournament)
    return {"message": f"No longer an admin of '{tournament.slug}'"}
