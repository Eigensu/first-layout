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

``tournament_id`` is declared ``Optional`` on the models today, and that is a
migration artifact rather than the intended shape: no existing document has the
field until the backfill runs (§7, Phase 3). Until then, ``None`` means "written
before the backfill", not "belongs to no tournament". Once the backfill has run
and the routes go through :func:`scoped`, the field becomes required and this
paragraph goes away.

Nothing in the app filters on ``tournament_id`` yet. Adding the field and the
filter in the same change would have meant deploying a query that matches
nothing -- every contest, team and player would vanish for the live
tournaments, whose data has no ``tournament_id`` until it is backfilled.
"""

from typing import Optional, Type, TypeVar

from beanie import Document, PydanticObjectId

TDoc = TypeVar("TDoc", bound=Document)


def scoped(model: Type[TDoc], tournament_id: PydanticObjectId):
    """Start a query against a tenant-scoped collection.

    Routes are expected to go through this rather than calling ``model.find()``
    on a tenant collection directly. The filter is the only thing standing
    between one tournament's data and another's, and a filter that every route
    has to remember is a filter some route will forget. One function is one
    place to review, and one place to test.

    Returns a Beanie ``FindMany``, so the usual ``.sort()``, ``.limit()``,
    ``.to_list()`` and friends all chain off it as normal.
    """
    return model.find(model.tournament_id == tournament_id)


def scoped_one(model: Type[TDoc], tournament_id: PydanticObjectId, *args):
    """``scoped`` for a single document, with extra query expressions.

    ``await scoped_one(Contest, tid, Contest.code == "FINAL")`` reads better at
    the call site than threading the tenant filter into every ``find_one``.
    """
    return model.find_one(model.tournament_id == tournament_id, *args)


def tenant_filter(tournament_id: Optional[PydanticObjectId]) -> dict:
    """The raw Mongo filter, for aggregation pipelines and Motor calls.

    Beanie's query builder does not reach into ``aggregate()``, and the
    migration scripts use raw Motor throughout, so both need the filter in
    dict form rather than as a query expression.
    """
    return {"tournament_id": tournament_id}
