import logging
from datetime import datetime, timezone
from typing import Annotated

from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.errors import DuplicateKeyError

from app.models.tournament import Tournament
from app.models.tournament_membership import STATUS_PLAYED, TournamentMembership
from app.models.user import RefreshToken, User
from app.schemas.membership import (
    MyTournamentsResponse,
    PlayedTournament,
    RegisteredTournament,
)
from app.schemas.user import (
    ASCII_DIGITS,
    DeleteAccountRequest,
    EmailChangeRequest,
    EmailChangeVerify,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth import email_otp
from app.services.auth.apple import AppleTokenError, verify_apple_identity_token
from app.services.auth.email_change import EmailTaken, EmailUnchanged
from app.services.auth.email_change import confirm_email_change as confirm_change
from app.services.auth.email_change import request_email_change as request_change
from app.services.auth.google import GoogleTokenError, verify_google_id_token
from app.services.auth.identity import set_profile_mobile, verify_user_password
from app.utils.dependencies import (
    get_current_active_user,
    is_platform_admin,
    is_tournament_admin,
)
from app.utils.gridfs import open_avatar_stream
from app.utils.rate_limit import rate_limit
from app.utils.security import verify_password
from app.utils.tenant import TenantId, get_optional_tenant, tournament_name
from app.utils.timezone import to_ist
from config.settings import get_settings

router = APIRouter(prefix="/api/users", tags=["Users"])
settings = get_settings()
logger = logging.getLogger("app.users")


async def _user_response(user: User, tournament_id: TenantId) -> UserResponse:
    """Build the public view of a user, pointing avatar_url at the streaming
    endpoint when the avatar lives in GridFS rather than at an external URL.

    is_admin is about the tournament the request came from, which is the site
    the frontend shows or hides its admin pages on.
    """
    avatar_url = user.avatar_url
    if user.avatar_file_id and not avatar_url:
        avatar_url = f"/api/users/{user.id}/avatar"

    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        mobile=user.mobile,
        is_active=user.is_active,
        is_verified=user.is_verified,
        is_admin=await is_tournament_admin(user, tournament_id),
        is_platform_admin=is_platform_admin(user),
        created_at=user.created_at,
        avatar_url=avatar_url,
        auth_provider=user.auth_provider,
    )


async def _mobile_taken_by_other(mobile: str, current_user: User) -> bool:
    """True if another account already holds this number.

    Compared digits-only rather than by exact string, because POST
    /api/auth/login accepts a mobile as the identifier and takes the FIRST
    digit match it finds -- two accounts sharing a number make that login
    ambiguous. Soft-deleted accounts are included on purpose: they keep their
    mobile, and login matches them before rejecting them as disabled.
    """
    target = "".join(ch for ch in mobile if ch in ASCII_DIGITS)
    if not target:
        return False

    # Every write path normalizes to digits, so an indexed equality lookup
    # settles the common case without reading the collection. `mobiles` too:
    # login and password reset read it first, so a number held only there is
    # as much another account's as one in `mobile`.
    for query in (User.mobile == target, User.mobiles == target):
        existing = await User.find_one(query)
        if existing is not None and str(existing.id) != str(current_user.id):
            return True

    # Rows written before normalization may hold the same number with symbols,
    # which the lookup above cannot match. Scan only those, not every user.
    async for other in User.find({"mobile": {"$not": {"$regex": "^[0-9]+$"}}}):
        if str(other.id) == str(current_user.id):
            continue
        if "".join(ch for ch in (other.mobile or "") if ch in ASCII_DIGITS) == target:
            return True
    return False


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_active_user)],
    tournament_id: Annotated[TenantId, Depends(get_optional_tenant)],
):
    """Get current user information"""
    return await _user_response(current_user, tournament_id)


@router.get("/me/tournaments", response_model=MyTournamentsResponse)
async def get_my_tournaments(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Every tournament this account has joined, played or not (spec §6.1).

    Archived tournaments are included: a profile is a history. Most recently
    active first, falling back to when they joined.
    """
    memberships = await TournamentMembership.find(
        TournamentMembership.user_id == current_user.id
    ).to_list()
    tournaments = {
        t.id: t
        for t in await Tournament.find(
            In(Tournament.id, [m.tournament_id for m in memberships])
        ).to_list()
    }

    played, registered_only = [], []
    for m in sorted(
        memberships,
        key=lambda m: to_ist(m.last_active_at or m.joined_at),
        reverse=True,
    ):
        tournament = tournaments.get(m.tournament_id)
        if tournament is None:
            continue
        common = {
            "slug": tournament.slug,
            "name": tournament.name,
            "logo_url": tournament.logo_url,
            "status": tournament.status,
            "joined_at": m.joined_at,
        }
        if m.status == STATUS_PLAYED:
            played.append(
                PlayedTournament(
                    **common,
                    display_name=m.display_name,
                    first_played_at=m.first_played_at,
                    last_active_at=m.last_active_at,
                    teams_count=m.stats.teams_count,
                    contests_count=m.stats.contests_count,
                    best_rank=m.stats.best_rank,
                    total_points=m.stats.total_points,
                )
            )
        else:
            registered_only.append(RegisteredTournament(**common))
    return MyTournamentsResponse(played=played, registered_only=registered_only)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    tournament_id: Annotated[TenantId, Depends(get_optional_tenant)],
    full_name: str = None,
    mobile: str = None,
    avatar_url: str = None,
):
    """Update current user information"""

    changes = {}
    if full_name:
        current_user.full_name = full_name
        changes[User.full_name] = full_name

    if mobile:
        normalized_mobile = "".join(ch for ch in mobile.strip() if ch in ASCII_DIGITS)
        if len(normalized_mobile) != 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile must be exactly 10 digits",
            )

        if await _mobile_taken_by_other(normalized_mobile, current_user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile already registered",
            )

        set_profile_mobile(current_user, normalized_mobile)
        changes[User.mobile] = current_user.mobile
        changes[User.mobiles] = current_user.mobiles

    if avatar_url:
        current_user.avatar_url = avatar_url
        changes[User.avatar_url] = avatar_url

    changes[User.updated_at] = datetime.now(timezone.utc)
    try:
        # The fields this request changed, not the whole document; see
        # patch_current_user.
        await current_user.set(changes)
    except DuplicateKeyError:
        # See patch_current_user: the check above is read-then-write, so
        # uniq_mobile is what actually settles a concurrent claim.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile already registered",
        )

    return await _user_response(current_user, tournament_id)


@router.patch("/me", response_model=UserResponse)
async def patch_current_user(
    payload: UserUpdateRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    tournament_id: Annotated[TenantId, Depends(get_optional_tenant)],
):
    """Partially update the current user's own profile.

    JSON-bodied counterpart to PUT /me (which takes query params and is kept
    as-is for backwards compatibility). Exists so a client can collect a
    mobile number after the fact -- a Google ID token never carries one, so
    Google accounts are created with mobile unset.
    """

    changes = {}
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None
        changes[User.full_name] = current_user.full_name

    if payload.mobile is not None:
        if await _mobile_taken_by_other(payload.mobile, current_user):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This mobile number is already linked to another account",
            )
        set_profile_mobile(current_user, payload.mobile)
        changes[User.mobile] = current_user.mobile
        changes[User.mobiles] = current_user.mobiles

    changes[User.updated_at] = datetime.now(timezone.utc)
    try:
        # Only what this request changed. The user was read when the request
        # began, and a whole-document save would put back any field changed
        # since -- an email change confirmed on another device, say.
        await current_user.set(changes)
    except DuplicateKeyError:
        # The check above is read-then-write, so a concurrent request can take
        # the number in between. uniq_mobile rejects the loser; surface it as
        # the same 409 rather than a 500.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already linked to another account",
        )

    return await _user_response(current_user, tournament_id)


async def _reauthenticate(user: User, payload: EmailChangeRequest) -> None:
    """The password if the account has one; otherwise a fresh provider sign-in.

    Refused with 400, as change-password refuses a wrong current password, and
    not the 401 deleting an account uses: the clients read a 401 on a
    signed-in route as an expired session, and refresh it or sign out.
    """
    if user.hashed_password or user.legacy_hashes:
        ok, _ = verify_user_password(user, payload.password or "")
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password"
            )
        return
    try:
        await _reauthenticate_passwordless(user, payload, action="change your email")
    except HTTPException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.detail)


@router.post(
    "/me/email/request",
    responses={
        400: {"description": "Re-authentication failed, or no change"},
        409: {"description": "Another account uses that address"},
        502: {"description": "The code could not be sent"},
        503: {"description": "The email channel is not configured here"},
    },
)
async def request_email_change(
    request: Request,
    payload: EmailChangeRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    tournament_id: Annotated[TenantId, Depends(get_optional_tenant)],
):
    """Send a code to the new address; the email changes once it comes back."""
    if not email_otp.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "channel_unavailable",
                "message": "Changing your email isn't available right now.",
            },
        )
    # Before the password check, so guessing it through here is counted too.
    await rate_limit(
        "email_change_request",
        request,
        identifier=str(current_user.id),
        account=current_user,
    )
    await _reauthenticate(current_user, payload)
    try:
        address = await request_change(
            current_user, str(payload.email), await tournament_name(tournament_id)
        )
    except EmailUnchanged:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That is already your email",
        )
    except EmailTaken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already linked to another account",
        )
    except ValueError:
        logger.exception("Could not send the email-change code")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="We couldn't send the code. Please try again in a moment.",
        )
    return {"email": address, "expires_in_sec": settings.otp_expiry_seconds}


@router.post(
    "/me/email/verify",
    response_model=UserResponse,
    responses={
        400: {"description": "Wrong, expired or used-up code"},
        409: {"description": "Another account took the address meanwhile"},
    },
)
async def verify_email_change(
    request: Request,
    payload: EmailChangeVerify,
    current_user: Annotated[User, Depends(get_current_active_user)],
    tournament_id: Annotated[TenantId, Depends(get_optional_tenant)],
):
    """Commit the change with the code sent to the new address."""
    await rate_limit(
        "email_change_verify",
        request,
        identifier=str(current_user.id),
        account=current_user,
    )
    try:
        await confirm_change(current_user, payload.otp)
    except EmailTaken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already linked to another account",
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code"
        )
    return await _user_response(current_user, tournament_id)


def _linked(ids: list, scalar) -> set:
    return set(ids) | ({scalar} if scalar else set())


async def _reauthenticate_passwordless(
    user: User,
    request: DeleteAccountRequest | EmailChangeRequest,
    action: str = "delete this account",
):
    """Require a fresh sign-in with a provider this account is linked to.

    A bearer token alone must not be enough to delete a passwordless account,
    or a stolen or unattended session could lock its owner out with nothing to
    fall back on. Apple counts as well as Google: an account created by Sign in
    with Apple has neither a password nor a Google identity, so without it the
    account could not be deleted at all -- which the App Store requires of any
    app that lets people create one.
    """
    apple_ids = _linked(user.apple_ids, user.apple_id)
    google_ids = _linked(user.google_ids, user.google_id)

    if request.apple_identity_token and apple_ids:
        try:
            token_payload = await verify_apple_identity_token(
                request.apple_identity_token
            )
        except AppleTokenError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
        if token_payload.get("sub") not in apple_ids:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apple account does not match this user",
            )
        return

    if request.google_id_token and google_ids:
        try:
            token_payload = verify_google_id_token(request.google_id_token)
        except GoogleTokenError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
        if token_payload.get("sub") not in google_ids:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google account does not match this user",
            )
        return

    provider = "Apple" if apple_ids and not google_ids else "Google"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Re-authenticate with {provider} to {action}",
    )


@router.delete("/me")
async def delete_current_user(
    request: DeleteAccountRequest, current_user: User = Depends(get_current_active_user)
):
    """Soft delete current user account, reauthenticating by whatever
    credential the account actually has (password, or a fresh Google or Apple
    sign-in for passwordless accounts)."""

    if current_user.hashed_password:
        try:
            is_valid = verify_password(
                request.password or "", current_user.hashed_password
            )
        except Exception:
            # If verification fails (e.g. invalid hash format), treat as auth failure
            is_valid = False

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
            )
    else:
        await _reauthenticate_passwordless(current_user, request)

    # Soft delete by deactivating and recording timestamp, writing those fields
    # only, as patch_current_user does.
    now = datetime.now(timezone.utc)
    await current_user.set(
        {
            User.is_active: False,
            User.deleted_at: now,
            User.deletion_reason: request.reason,
            User.updated_at: now,
        }
    )

    # Revoke all refresh tokens for this user
    await RefreshToken.find(
        RefreshToken.user_id == current_user.id, RefreshToken.revoked == False
    ).update({"$set": {"revoked": True}})

    return {"message": "Account successfully deleted"}


@router.get("/{user_id}/avatar")
async def get_user_avatar(user_id: str):
    """Stream the user's avatar from GridFS"""
    user = await User.get(user_id)
    if not user or not user.avatar_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found"
        )

    stream, content_type = await open_avatar_stream(user.avatar_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
