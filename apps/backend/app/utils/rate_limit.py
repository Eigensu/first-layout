"""Rate limits on the auth routes (docs/RATE_LIMITING_SPEC.md).

Each limited route calls `rate_limit(rule, request, identifier=...)` before it
does any work. A rule limits up to two axes at once -- the identifier being
signed in as, and the client's address -- and whichever trips first wins.

Counted in fixed windows in MongoDB, rather than through slowapi as the spec
first proposed: slowapi's key functions see only the request, so they cannot
key on an identifier inside a JSON body, and that is the axis doing the
security work (spec §4.2). A fixed window can let up to twice a limit through
across a window boundary; at limits this coarse that is a fair price for one
upsert per request and an exact Retry-After.
"""

import asyncio
import hashlib
import logging
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, Request, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.rate_limit import RateLimitCounter
from app.models.user import User
from app.services.auth.identity import canonical_mobile, digits_only, is_phone_shaped
from config.settings import get_settings

logger = logging.getLogger("app.rate_limit")
settings = get_settings()

MINUTE = 60
HOUR = 60 * MINUTE

IDENTIFIER = "identifier"
IP = "ip"


@dataclass(frozen=True)
class Limit:
    hits: int
    seconds: int


# Every limit in one table, so tuning them from the observe-mode logs (spec §8)
# is one edit. These are the spec's starting points, not settled numbers.
RULES: Dict[str, Dict[str, Limit]] = {
    "login": {IDENTIFIER: Limit(5, 15 * MINUTE), IP: Limit(60, 15 * MINUTE)},
    "register": {IP: Limit(10, HOUR)},
    "google": {IP: Limit(30, HOUR)},
    "apple": {IP: Limit(30, HOUR)},
    "forgot_password_request": {IDENTIFIER: Limit(3, HOUR), IP: Limit(20, HOUR)},
    "forgot_password_verify": {IDENTIFIER: Limit(10, HOUR), IP: Limit(40, HOUR)},
    "refresh": {IP: Limit(120, HOUR)},
    # Signed in, so the identifier is the account itself. The request also
    # checks the password, so its limit is the guessing limit there too.
    "email_change_request": {IDENTIFIER: Limit(3, HOUR), IP: Limit(20, HOUR)},
    "email_change_verify": {IDENTIFIER: Limit(10, HOUR), IP: Limit(40, HOUR)},
}

# Routes that spend money on every call (an SMS or an email). When the
# counters cannot be read these refuse instead of letting requests through
# (spec §5): a store outage must not become an open tap on the SMS budget.
SPENDS_MONEY = {"forgot_password_request", "email_change_request"}

# How long counting may take before it counts as the store being down. The
# limiter sits in front of sign-in, and a stalled write must not hold it up.
STORE_TIMEOUT_SECONDS = 1.0

# How much of X-Forwarded-For a blocked request's log line keeps.
FORWARDED_FOR_LOG_LIMIT = 256


def _enforcing(rule: str) -> bool:
    """RATE_LIMIT_ENFORCE turns on every rule; RATE_LIMIT_ENFORCE_RULES names
    some, so the money routes can be enforced first (spec §8)."""
    if settings.rate_limit_enforce:
        return True
    named = {r.strip() for r in settings.rate_limit_enforce_rules.split(",")}
    return rule in named


def _now() -> float:
    """The clock, as a function so tests can move it instead of sleeping."""
    return time.time()


def client_ip(request: Request) -> str:
    """The client address, as seen past our own proxies.

    Counted from the RIGHT. Each proxy appends the peer it received the
    connection from, so the rightmost entries are the ones our infrastructure
    wrote and the leftmost is whatever the caller claimed. Reading left to
    right -- which is the obvious implementation and the wrong one -- lets any
    caller pick their own rate-limit bucket by sending a header.
    """
    hops = settings.rate_limit_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if hops > 0 and len(parts) >= hops:
        return parts[-hops]
    return request.client.host if request.client else "unknown"


def identifier_key(identifier: str, account: Optional[User] = None) -> str:
    """One bucket per account, however its identifier is typed.

    When the identifier resolved to an account, the bucket is that account:
    every way of typing someone's number lands in it, and nothing else does.
    Normalising the text instead cannot tell a username like "98_765_432_10"
    from the mobile 9876543210, which may belong to someone else, and would
    let attempts on one lock the other out.

    With no account there is no one to lock out, so the text is the key, with
    a number reduced to its digits so that reformatting it buys no fresh
    allowance against an enumeration sweep.
    """
    if account is not None:
        return f"account:{account.id}"
    value = identifier.strip().lower()
    if "@" not in value and is_phone_shaped(value):
        return canonical_mobile(digits_only(value))
    return value


def _digest(value: str) -> str:
    # A counter outlives its request by up to a window, and it does not need
    # anyone's address or mobile number to do its job.
    return hashlib.sha256(value.encode()).hexdigest()[:32]


async def _hit(
    rule: str, axis: str, value: str, limit: Limit, now: float
) -> Optional[int]:
    """Count one request. Seconds until its window resets if that went over."""
    start = int(now // limit.seconds) * limit.seconds
    end = start + limit.seconds
    key = f"{rule}:{axis}:{_digest(value)}:{start}"
    update = {
        "$inc": {"count": 1},
        "$setOnInsert": {"expires_at": datetime.fromtimestamp(end, tz=timezone.utc)},
    }
    collection = RateLimitCounter.get_motor_collection()
    try:
        row = await collection.find_one_and_update(
            {"key": key}, update, upsert=True, return_document=ReturnDocument.AFTER
        )
    except DuplicateKeyError:
        # The first two requests of a window raced to insert its row. The row
        # exists now, so the loser's retry is a plain increment.
        row = await collection.find_one_and_update(
            {"key": key}, update, upsert=True, return_document=ReturnDocument.AFTER
        )
    if row["count"] <= limit.hits:
        return None
    return max(1, math.ceil(end - now))


def _wait_phrase(seconds: int) -> str:
    minutes = math.ceil(seconds / MINUTE)
    return "1 minute" if minutes == 1 else f"{minutes} minutes"


async def _count(rule: str, values: Dict[str, str], now: float) -> Dict[str, int]:
    """Count the request on each axis; the seconds to wait on any that went over."""
    tripped: Dict[str, int] = {}
    for axis, limit in RULES[rule].items():
        if axis in values:
            wait = await _hit(rule, axis, values[axis], limit, now)
            if wait is not None:
                tripped[axis] = wait
    return tripped


async def rate_limit(
    rule: str,
    request: Request,
    identifier: Optional[str] = None,
    account: Optional[User] = None,
    axes: Optional[Tuple[str, ...]] = None,
) -> None:
    """Count this request against `rule`, and refuse it if that puts it over.

    `account` is who `identifier` resolved to, when the route knows; the
    identifier axis then counts against that account (see identifier_key).
    `axes` limits the call to some of the rule's axes, so a route can check the
    address before doing the work of resolving the account, then the account.

    Until the rule is enforced (RATE_LIMIT_ENFORCE, or its name in
    RATE_LIMIT_ENFORCE_RULES), nothing is refused: requests over a limit are
    logged as `would_block`, with the resolved address and the raw
    X-Forwarded-For, so the limits and the proxy-hop count can be checked
    against real traffic first (spec §8). For the same reason a store failure
    only refuses money-spending routes while they are enforced.

    The 429 never says which axis tripped or how many attempts are left; both
    are free information to someone probing the limits (spec §6).
    """
    if not settings.rate_limit_enabled:
        return
    values = {IP: client_ip(request)}
    if identifier is not None and identifier.strip():
        values[IDENTIFIER] = identifier_key(identifier, account)
    counted = {a: v for a, v in values.items() if axes is None or a in axes}

    try:
        tripped = await asyncio.wait_for(
            _count(rule, counted, _now()), timeout=STORE_TIMEOUT_SECONDS
        )
    except Exception:
        # Logged at ERROR either way: a limiter failing open in silence is one
        # you find out is broken during the incident it was there to stop. A
        # timeout lands here too.
        logger.exception("rate_limit store_unavailable rule=%s", rule)
        if rule in SPENDS_MONEY and _enforcing(rule):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "temporarily_unavailable",
                    "message": "This is unavailable right now. Please try again in a few minutes.",
                },
            )
        return

    if not tripped:
        return
    retry_after = max(tripped.values())
    context = (
        rule,
        ",".join(tripped),
        values[IP],
        # The client writes this header, at any length; enough to see a chain
        # of proxies is kept.
        request.headers.get("x-forwarded-for", "")[:FORWARDED_FOR_LOG_LIMIT],
    )
    if not _enforcing(rule):
        logger.warning(
            "rate_limit would_block rule=%s axis=%s ip=%s forwarded_for=%r", *context
        )
        return
    logger.warning(
        "rate_limit blocked rule=%s axis=%s ip=%s forwarded_for=%r", *context
    )
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "rate_limited",
            "message": f"Too many attempts. Please try again in {_wait_phrase(retry_after)}.",
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )
