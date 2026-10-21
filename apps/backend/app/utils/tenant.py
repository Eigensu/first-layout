"""Tenant scoping for a single-database, many-tournament backend.

Every collection is one of two kinds:

  * **global** -- ``users``, ``tournaments``, ``tournament_memberships``,
    ``refresh_tokens``, ``user_profiles``, ``password_reset_*``. No
    ``tournament_id``; shared by every tournament.
  * **tenant-scoped** -- ``contests``, ``teams``, ``players``, ``slots``,
    ``team_contest_enrollments``, ``player_contest_points``, ``sponsors``,
    ``carousel_images``, ``import_logs``, ``admin_action_logs``. Every
    document belongs to exactly one tournament.

There is no third kind. See ``docs/UNIFIED_AUTH_SPEC.md`` §2.1 and §3.5.

Every read of a tenant collection goes through :func:`scoped`,
:func:`scoped_one` or :func:`get_scoped`, and every write sets
``tournament_id`` from the request's tenant. ``tests/test_tenant_scoping.py``
walks the routes and services and fails on a query that does not.

Which tournament a request belongs to depends on ``TENANCY``:

  * ``shared`` -- the one backend serving every tournament from
    ``walle_arena``. The frontend sends the subdomain's slug in
    ``X-Tournament-Slug``; :func:`get_tenant` resolves it through the
    registry, so a header cannot invent a tenant.
  * ``single`` (the default) -- a legacy per-tournament service, whose
    database holds one tournament and none of whose documents has a
    ``tournament_id``. The tenant is ``None``, and ``{"tournament_id": null}``
    matches exactly the documents that lack the field: every one of them.

So the same filter serves both, and a service started in the wrong mode shows
nothing rather than another tournament's data. ``config/startup_checks.py``
refuses to start it at all.

``tournament_id`` stays ``Optional`` on the models for the legacy databases.
Once they are retired the field becomes required and ``single`` goes away.
"""

from typing import Optional, Type, TypeVar

from beanie import Document, PydanticObjectId
from fastapi import HTTPException, Request, status

from app.common.enums.tournaments import TournamentStatus
from app.models.admin.audit_log import AdminActionLog
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player as AdminPlayer
from app.models.admin.slot import Slot
from app.models.carousel import CarouselImage
from app.models.contest import Contest
from app.models.player import Player as PublicPlayer
from app.models.player_contest_points import PlayerContestPoints
from app.models.sponsor import Sponsor
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from app.models.tournament import Tournament
from config.settings import settings

TDoc = TypeVar("TDoc", bound=Document)

# The request's tournament: its registry id under TENANCY=shared, None on a
# legacy single-tournament service.
TenantId = Optional[PydanticObjectId]

TENANT_HEADER = "X-Tournament-Slug"

# Every model whose collection belongs to one tournament. GlobalSettings is
# not here: it keeps one untagged document, the platform default, beside the
# per-tournament rows (app/models/settings.py).
TENANT_MODELS = (
    Contest,
    Team,
    TeamContestEnrollment,
    AdminPlayer,
    PublicPlayer,
    Slot,
    PlayerContestPoints,
    Sponsor,
    CarouselImage,
    ImportLog,
    AdminActionLog,
)


async def get_tenant(request: Request) -> TenantId:
    """FastAPI dependency: which tournament this request belongs to.

    On the shared backend the slug comes from the header the frontend sets
    from its subdomain, and must name a tournament in the registry. An
    archived tournament no longer resolves, as its subdomain does not
    (``GET /api/tournaments/by-slug``).
    """
    if not settings.shared_tenancy:
        return None

    slug = (request.headers.get(TENANT_HEADER) or "").strip().lower()
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing tournament: send the {TENANT_HEADER} header",
        )
    tournament = await Tournament.find_one(Tournament.slug == slug)
    if not tournament or tournament.status == TournamentStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown tournament"
        )
    return tournament.id


async def get_optional_tenant(request: Request) -> TenantId:
    """FastAPI dependency: the tournament a request names, if it names one.

    For routes that serve every site, the apex included, and only use the
    tournament to say something about it: ``/api/users/me`` reports whether
    its caller is admin there. A missing, unknown or archived slug therefore
    reads as no tournament rather than as an error. The frontend signs people
    out when that route fails.
    """
    try:
        return await get_tenant(request)
    except HTTPException:
        return None


async def tournament_name(tournament_id: TenantId) -> Optional[str]:
    """The tournament's display name, for mail sent on its behalf.

    None when the request names no tournament, and always under ``single``,
    where there is no registry row to take a name from.
    """
    if tournament_id is None:
        return None
    tournament = await Tournament.get(tournament_id)
    return tournament.name if tournament else None


def scoped(model: Type[TDoc], tournament_id: TenantId):
    """Start a query against a tenant-scoped collection.

    Routes go through this rather than calling ``model.find()`` on a tenant
    collection directly. The filter is the only thing standing between one
    tournament's data and another's, and a filter that every route has to
    remember is a filter some route will forget. One function is one place to
    review, and one place to test.

    Returns a Beanie ``FindMany``, so ``.find()``, ``.sort()``, ``.count()``,
    ``.update_many()``, ``.delete()`` and the rest all chain off it as normal.
    """
    return model.find(model.tournament_id == tournament_id)


def scoped_one(model: Type[TDoc], tournament_id: TenantId, *args):
    """``scoped`` for a single document, with extra query expressions.

    ``await scoped_one(Contest, tid, Contest.code == "FINAL")`` reads better at
    the call site than threading the tenant filter into every ``find_one``.
    """
    return model.find_one(model.tournament_id == tournament_id, *args)


async def get_scoped(
    model: Type[TDoc], tournament_id: TenantId, document_id
) -> Optional[TDoc]:
    """``model.get(document_id)``, if that document belongs to this tournament.

    Ids are guessable and travel in URLs, so a lookup by id is a cross-tenant
    read unless it is scoped like any other. An id that is not an ObjectId
    finds nothing, which the caller already turns into its 404.
    """
    try:
        oid = PydanticObjectId(document_id)
    except Exception:
        return None
    return await scoped_one(model, tournament_id, model.id == oid)


def tenant_filter(tournament_id: TenantId) -> dict:
    """The raw Mongo filter, for aggregation pipelines and Motor calls.

    Beanie's query builder does not reach into ``aggregate()``, and the
    migration scripts use raw Motor throughout, so both need the filter in
    dict form rather than as a query expression.
    """
    return {"tournament_id": tournament_id}
