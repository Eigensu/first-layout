"""Rate limits on the auth routes (docs/RATE_LIMITING_SPEC.md §9).

No sleeping: the limiter's clock is a function, and these tests move it.
"""

import logging

import pytest
import pytest_asyncio
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.requests import Request

from app.models.rate_limit import RateLimitCounter
from app.models.user import User
from app.utils import rate_limit as rl
from app.utils.rate_limit import HOUR, IDENTIFIER, IP, Limit
from app.utils.security import get_password_hash

PASSWORD = "CurrentPass1"
NOW = 1_800_000_000.0  # the start of a 15-minute window, and of an hour


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    clock = {"now": NOW}
    monkeypatch.setattr(rl, "_now", lambda: clock["now"])
    return clock


@pytest.fixture
def enforcing(monkeypatch):
    monkeypatch.setattr(rl.settings, "rate_limit_enforce", True)


@pytest_asyncio.fixture
async def rahul(db):
    user = User(
        username="rahul",
        email="rahul@example.com",
        mobile="9876543210",
        hashed_password=get_password_hash(PASSWORD),
    )
    await user.insert()
    return user


@pytest_asyncio.fixture
async def priya(db):
    user = User(
        username="priya",
        email="priya@example.com",
        mobile="9123456780",
        hashed_password=get_password_hash(PASSWORD),
    )
    await user.insert()
    return user


async def _login(client, username, password="wrong-password", forwarded="203.0.113.7"):
    return await client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers={"X-Forwarded-For": forwarded},
    )


def _request(forwarded=None, peer="10.0.0.1"):
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "headers": headers, "client": (peer, 4321)})


# --- the identifier axis -----------------------------------------------------


async def test_identifier_limit_trips(anon_client, rahul, enforcing):
    for _ in range(5):
        assert (await _login(anon_client, "rahul")).status_code == 401

    # The sixth is refused before the password is looked at, right or wrong.
    response = await _login(anon_client, "rahul", password=PASSWORD)
    assert response.status_code == 429


async def test_identifier_limit_is_per_account(anon_client, rahul, priya, enforcing):
    for _ in range(6):
        await _login(anon_client, "rahul")

    assert (await _login(anon_client, "priya", password=PASSWORD)).status_code == 200


async def test_reformatting_a_number_shares_its_bucket(anon_client, rahul, enforcing):
    for typed in ("9876543210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210"):
        assert (await _login(anon_client, typed)).status_code == 401

    assert (await _login(anon_client, "+919876543210")).status_code == 429


async def test_identifier_case_and_spaces_share_a_bucket(anon_client, rahul, enforcing):
    for typed in ("rahul", "RAHUL", " Rahul ", "rahul", "rAhUl"):
        await _login(anon_client, typed)

    assert (await _login(anon_client, "rahul")).status_code == 429


async def test_window_resets(anon_client, rahul, enforcing, frozen_clock):
    for _ in range(6):
        await _login(anon_client, "rahul")
    assert (await _login(anon_client, "rahul", password=PASSWORD)).status_code == 429

    frozen_clock["now"] = NOW + 15 * 60

    assert (await _login(anon_client, "rahul", password=PASSWORD)).status_code == 200


# --- the address axis ----------------------------------------------------------


async def test_ip_limit_is_separate_axis(anon_client, db, enforcing, monkeypatch):
    monkeypatch.setitem(
        rl.RULES, "login", {IDENTIFIER: Limit(5, HOUR), IP: Limit(3, HOUR)}
    )
    for n in range(3):
        assert (await _login(anon_client, f"nobody{n}")).status_code == 401

    # A fourth account, never tried before, is still refused: same address.
    assert (await _login(anon_client, "nobody3")).status_code == 429
    # And another address is unaffected.
    other = await _login(anon_client, "nobody4", forwarded="198.51.100.9")
    assert other.status_code == 401


def test_client_ip_takes_rightmost():
    assert rl.client_ip(_request("1.2.3.4, 5.6.7.8")) == "5.6.7.8"


def test_client_ip_counts_configured_hops(monkeypatch):
    monkeypatch.setattr(rl.settings, "rate_limit_proxy_hops", 2)
    assert rl.client_ip(_request("1.2.3.4, 5.6.7.8, 9.9.9.9")) == "5.6.7.8"


def test_client_ip_without_the_header_is_the_peer():
    assert rl.client_ip(_request(None, peer="192.0.2.44")) == "192.0.2.44"


async def test_spoofed_forwarded_for_cannot_pick_a_bucket(
    anon_client, db, enforcing, monkeypatch
):
    monkeypatch.setitem(rl.RULES, "login", {IP: Limit(3, HOUR)})
    for n in range(3):
        spoofed = f"10.9.9.{n}, 203.0.113.7"
        assert (await _login(anon_client, f"nobody{n}", forwarded=spoofed)).status_code == 401

    response = await _login(anon_client, "nobody9", forwarded="10.9.9.99, 203.0.113.7")
    assert response.status_code == 429


# --- modes and failures -----------------------------------------------------


async def test_observe_mode_never_blocks(anon_client, rahul, caplog):
    for _ in range(6):
        await _login(anon_client, "rahul", forwarded="1.2.3.4, 203.0.113.7")

    with caplog.at_level(logging.WARNING, logger="app.rate_limit"):
        response = await _login(
            anon_client, "rahul", password=PASSWORD, forwarded="1.2.3.4, 203.0.113.7"
        )

    assert response.status_code == 200
    logged = caplog.text
    assert "would_block" in logged
    assert "rule=login" in logged
    # What tuning the proxy-hop count needs: the address used and the raw header.
    assert "ip=203.0.113.7" in logged
    assert "1.2.3.4, 203.0.113.7" in logged


async def test_disabled_counts_nothing(anon_client, rahul, monkeypatch):
    monkeypatch.setattr(rl.settings, "rate_limit_enabled", False)
    await _login(anon_client, "rahul")

    assert await RateLimitCounter.find_all().count() == 0


async def test_counters_hold_no_identifier_or_address(anon_client, rahul):
    await _login(anon_client, "9876543210", forwarded="203.0.113.7")

    keys = [row.key for row in await RateLimitCounter.find_all().to_list()]
    assert len(keys) == 2
    assert not any("9876543210" in k or "203.0.113.7" in k for k in keys)


async def test_a_blank_identifier_counts_only_the_address(anon_client, db):
    await _login(anon_client, "   ")

    keys = [row.key for row in await RateLimitCounter.find_all().to_list()]
    assert [k.split(":")[:2] for k in keys] == [["login", "ip"]]


async def test_racing_first_hits_both_count(db, monkeypatch):
    """Two first requests in a window both upsert; the loser retries as an increment."""
    collection = RateLimitCounter.get_motor_collection()
    real = collection.find_one_and_update
    raced = []

    class RacingCollection:
        async def find_one_and_update(self, *args, **kwargs):
            if not raced:
                raced.append(True)
                await real(*args, **kwargs)  # the other request's insert
                raise DuplicateKeyError("E11000 duplicate key")
            return await real(*args, **kwargs)

    monkeypatch.setattr(RateLimitCounter, "get_motor_collection", lambda: RacingCollection())

    wait = await rl._hit("login", IP, "203.0.113.7", Limit(1, HOUR), NOW)

    assert wait == HOUR  # the retry saw both hits, so one over a limit of one
    row = await collection.find_one({})
    assert row["count"] == 2


async def _store_down(*args, **kwargs):
    raise PyMongoError("store unavailable")


async def test_store_failure_fails_open_on_login(anon_client, rahul, enforcing, monkeypatch):
    monkeypatch.setattr(rl, "_hit", _store_down)

    assert (await _login(anon_client, "rahul", password=PASSWORD)).status_code == 200


async def test_store_failure_fails_closed_on_otp(anon_client, rahul, enforcing, monkeypatch):
    sent = []

    async def _send(phone):
        sent.append(phone)

    monkeypatch.setattr("app.routes.auth.pr_start_session", _send)
    monkeypatch.setattr(rl, "_hit", _store_down)

    response = await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "9876543210"}
    )

    assert response.status_code == 503
    assert sent == []


async def test_store_failure_in_observe_mode_still_sends(anon_client, rahul, monkeypatch):
    sent = []

    async def _send(phone):
        sent.append(phone)

    monkeypatch.setattr("app.routes.auth.pr_start_session", _send)
    monkeypatch.setattr(rl, "_hit", _store_down)

    response = await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "9876543210"}
    )

    assert response.status_code == 200
    assert sent == ["9876543210"]


async def test_otp_limit_trips_inside_the_generic_response(
    anon_client, rahul, enforcing, monkeypatch
):
    sent = []

    async def _send(phone):
        sent.append(phone)

    monkeypatch.setattr("app.routes.auth.pr_start_session", _send)
    for _ in range(3):
        response = await anon_client.post(
            "/api/auth/forgot-password/request", json={"phone": "9876543210"}
        )
        assert response.status_code == 200

    response = await anon_client.post(
        "/api/auth/forgot-password/request", json={"phone": "+91 98765 43210"}
    )

    assert response.status_code == 429
    assert len(sent) == 3


# --- the response ---------------------------------------------------------------


async def test_429_body_shape(anon_client, rahul, enforcing, frozen_clock):
    for _ in range(5):
        await _login(anon_client, "rahul")
    frozen_clock["now"] = NOW + 3 * 60 + 20

    response = await _login(anon_client, "rahul")

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["code"] == "rate_limited"
    assert detail["retry_after_seconds"] == 11 * 60 + 40
    assert detail["message"] == "Too many attempts. Please try again in 12 minutes."
    assert response.headers["Retry-After"] == str(11 * 60 + 40)
    # Never which axis tripped, nor how many tries are left.
    assert set(detail) == {"code", "message", "retry_after_seconds"}


# --- which routes ---------------------------------------------------------------


ROUTES = [
    ("login", "post", "/api/auth/login", {"json": {"username": "x", "password": "y"}}),
    (
        "register",
        "post",
        "/api/auth/register",
        {
            "data": {
                "username": "newbie",
                "email": "newbie@example.com",
                "password": "Password123",
                "mobile": "9000000001",
            }
        },
    ),
    ("google", "post", "/api/auth/google", {"json": {"id_token": "t"}}),
    ("apple", "post", "/api/auth/apple", {"json": {"identity_token": "t"}}),
    ("refresh", "post", "/api/auth/refresh", {"params": {"refresh_token": "t"}}),
    (
        "forgot_password_request",
        "post",
        "/api/auth/forgot-password/request",
        {"json": {"phone": "9876543210"}},
    ),
    (
        "forgot_password_verify",
        "post",
        "/api/auth/forgot-password/verify",
        {"json": {"phone": "9876543210", "otp": "123456"}},
    ),
]


@pytest.mark.parametrize("rule,method,path,kwargs", ROUTES, ids=[r[0] for r in ROUTES])
async def test_each_route_is_limited_by_its_rule(
    anon_client, db, enforcing, monkeypatch, rule, method, path, kwargs
):
    monkeypatch.setitem(rl.RULES, rule, {IP: Limit(0, HOUR)})

    response = await getattr(anon_client, method)(path, **kwargs)

    assert response.status_code == 429


def test_hot_path_is_not_limited():
    """Only auth routes call the limiter; team saves and contest joins never do.

    Contest traffic spikes right before a match locks, exactly when a limiter
    tuned on average load would fire (spec §3.2).
    """
    from main import app

    limited = sorted(
        route.path
        for route in app.routes
        if "rate_limit" in getattr(getattr(route, "endpoint", None), "__globals__", {})
    )

    assert limited
    assert all(path.startswith("/api/auth/") for path in limited), limited


def test_every_rule_is_used():
    import inspect

    from app.routes import auth

    source = inspect.getsource(auth)
    assert all(f'rate_limit("{rule}"' in source for rule in rl.RULES)
