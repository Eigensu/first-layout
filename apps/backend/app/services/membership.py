"""Membership rows, written as people turn up and play (spec §6.2).

A row appears the moment someone signs in on a tournament's site or makes a
team there, so their profile lists the tournament straight away. Every number
on it comes later, from scripts/refresh_membership_stats.py, which also
creates any row these writes missed.

Neither function may fail the request that called it: by then the account
signed in or the team exists, and an error would only make the player retry
and make a second one. A write that fails is logged and left to that job.
"""

import logging
from typing import Optional

from pymongo.errors import DuplicateKeyError, PyMongoError

from app.models.tournament import Tournament
from app.models.tournament_membership import (
    STATUS_PLAYED,
    STATUS_REGISTERED,
    TournamentMembership,
)
from app.models.user import User
from app.utils.tenant import TenantId
from app.utils.timezone import now_ist

logger = logging.getLogger("app.membership")


async def record_sign_in(user: User, tournament_id: TenantId) -> None:
    """Note that this person signed in, or signed up, on this tournament's site.

    With one account across every tournament, turning up on a new tournament's
    site signed in is what registering for it now means. A row that already
    exists only has its last_login_at moved on; its status never goes back.
    """
    now = now_ist()
    await _touch(
        user,
        tournament_id,
        {"$set": {"last_login_at": now}},
        status=STATUS_REGISTERED,
        joined_at=now,
        last_login_at=now,
    )


async def record_play(user: User, tournament_id: TenantId) -> None:
    """Note that this person made a team or entered a contest in this tournament."""
    now = now_ist()
    await _touch(
        user,
        tournament_id,
        {"$set": {"status": STATUS_PLAYED, "last_active_at": now}},
        # Set by whichever play came first, not moved on by every team after.
        set_once={"first_played_at": now},
        status=STATUS_PLAYED,
        joined_at=now,
        first_played_at=now,
        last_active_at=now,
    )


async def _touch(
    user: User,
    tournament_id: TenantId,
    update: dict,
    set_once: Optional[dict] = None,
    **new_row,
) -> None:
    """Apply `update` to this person's row here, creating it from `new_row`.

    `set_once` fields are written to an existing row only where still empty.
    A legacy single-tournament service has no tournament to record, so it
    never writes.
    """
    if tournament_id is None:
        return
    key = _key(user, tournament_id)
    try:
        existing = await _collection().update_one(key, update)
        if not existing.matched_count:
            tournament = await Tournament.get(tournament_id)
            if tournament is None:
                return
            try:
                await TournamentMembership(
                    user_id=user.id,
                    tournament_id=tournament_id,
                    tournament_slug=tournament.slug,
                    display_name=user.username,
                    **new_row,
                ).insert()
                return
            except DuplicateKeyError:
                # A concurrent request created the row first. Apply this one to it.
                await _collection().update_one(key, update)
        for field, value in (set_once or {}).items():
            await _collection().update_one(
                {**key, field: None}, {"$set": {field: value}}
            )
    except PyMongoError:
        logger.exception(
            "membership write failed for user %s in tournament %s",
            user.id,
            tournament_id,
        )


def _key(user: User, tournament_id: TenantId) -> dict:
    return {"user_id": user.id, "tournament_id": tournament_id}


def _collection():
    return TournamentMembership.get_motor_collection()
