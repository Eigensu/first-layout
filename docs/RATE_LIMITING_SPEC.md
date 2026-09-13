# Rate Limiting — Technical Specification

**Status:** Ready for review, not implemented
**Scope:** Platform-wide, but only auth and OTP routes are limited in v1
**Related:** `docs/UNIFIED_AUTH_SPEC.md` §5.6 (this replaces that section's sketch)

---

## 1. Where we are

There is **no rate limiting anywhere in the backend**. Not on login, not on
registration, not on the OTP endpoints that spend real money on every call.

Three consequences, in order of how much they cost:

1. **Credential stuffing is unthrottled.** `POST /api/auth/login` can be hit as fast
   as the service will answer.
2. **`/forgot-password/request` is an open spend endpoint.** Each call sends an SMS
   through 2Factor — and, once `docs/UNIFIED_AUTH_SPEC.md` §5.4 lands, an email through
   Resend. Someone can drain both budgets from a laptop.
3. **User enumeration is cheap.** The login and reset paths behave differently for a
   known and an unknown number, and nothing slows down a sweep of the number space.

This document specifies the fix. It is deliberately its own spec because rate limiting
is platform-wide plumbing, independently shippable, and outlives the auth migration.

---

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Library | **`slowapi`** — the conventional FastAPI choice, backed by `limits`. |
| 2 | Backing store | **MongoDB**, via `limits`' `async+mongodb://` backend. No new infrastructure: the cluster is already there and already a hard dependency. |
| 3 | Key function | **Written by hand, not slowapi's built-ins** — see §4.1. This is not optional. |
| 4 | Primary axis | **The identifier** (mobile / email / username), not the IP. IP is a loose backstop only — see §4.2. |
| 5 | Failure mode | **Fail-open** on login and register; **fail-closed** on anything that spends money. |
| 6 | Rollout | **Observe-only first.** Log what would have been blocked, tune from real traffic, then enforce (§8). |

### Why MongoDB and not Redis

`REDIS_URL` is set on `first-layout`, `third-layout`, `fourth-layout-mtc` and
`fifth-layout` — but **not on `second-layout` (lpcl)**, one of the two live
tournaments. So Redis is a config gap today, and I cannot verify from here whether
those variables point at a real instance or are vestigial.

`limits` supports MongoDB natively, with an async driver, and Mongo is already a
hard dependency of every service. That makes a Mongo-backed limiter deployable to both
live tournaments **today, with no new variables and no new infrastructure**.

Counter-argument, stated fairly: Redis is the faster and more conventional store for
this, and at high volume a Mongo counter costs one indexed `findAndModify` per limited
request. That is acceptable here because only auth and OTP routes are limited — a few
requests per user session, not the hot path (§3.2). If that stops being true, the
storage URI is one setting:

```
RATE_LIMIT_STORAGE_URI=async+mongodb://…    # default: reuse MONGODB_URL
# swap later, no code change:
RATE_LIMIT_STORAGE_URI=async+redis://…
```

---

## 3. What gets limited

### 3.1 The limited routes

Starting points, **to be tuned from observe-mode data (§8)** rather than shipped as
gospel. Each route is limited on two keys at once; whichever trips first wins.

| Route | Per identifier | Per IP | Notes |
|---|---|---|---|
| `POST /api/auth/login` | 5 / 15 min | 60 / 15 min | Identifier = the submitted mobile/email/username, normalised |
| `POST /api/auth/register` | — | 10 / hour | Nothing to key on before the account exists |
| `POST /api/auth/google` | — | 30 / hour | Google already rate-limits its side |
| `POST /api/auth/forgot-password/request` | **3 / hour** | 20 / hour | **Spends money.** The tightest limit in the table |
| `POST /api/auth/forgot-password/verify` | 10 / hour | 40 / hour | `session.attempts` already caps guesses per session; this caps session churn |
| `POST /api/auth/refresh` | — | 120 / hour | A legitimate client refreshes rarely |
| `POST /api/users/me/email/request` | 3 / hour per **user** | — | Authenticated, so key on user id |

### 3.2 What is deliberately *not* limited

**The contest hot path.** Fantasy traffic is not steady — it spikes hard in the minutes
before a match locks. Team saves, contest joins, player lists and leaderboards all peak
exactly when users care most, and a limiter tuned on average load will fire precisely
then. Those routes are excluded in v1.

Also excluded: health checks, GridFS image streaming, and every authenticated read.

---

## 4. The two traps

### 4.1 The client IP is not `request.client.host`

Behind Railway's proxy, `request.client.host` is **the proxy's address**. Key on it and
every user in the world shares one bucket: the limiter blocks all of them together the
moment anyone trips it. This is the most likely way to ship a rate limiter that causes
an outage instead of preventing one.

**Do not use slowapi's built-in key functions.** `get_ipaddr` looks up
`X_FORWARDED_FOR` with underscores where the real header is `X-Forwarded-For`
([slowapi#255](https://github.com/laurentS/slowapi/issues/255)), so the lookup misses
and it silently falls back to the proxy address. Neither built-in validates the proxy
chain.

**Take the rightmost entry, not the leftmost.** `X-Forwarded-For` is built left to
right, each proxy appending the address it received the connection from. The leftmost
entry is whatever the *client* sent and is trivially spoofable — a request carrying
`X-Forwarded-For: 1.2.3.4` produces `1.2.3.4, <real client ip>`. Only the entries your
own infrastructure appended can be trusted, and those are on the right.

```python
# app/utils/rate_limit.py

TRUSTED_PROXY_HOPS = 1  # confirm empirically — see below


def client_ip(request: Request) -> str:
    """The client address, as seen past our own proxies.

    Counted from the RIGHT. Each proxy appends the peer it received the
    connection from, so the rightmost entries are the ones our infrastructure
    wrote and the leftmost is whatever the caller claimed. Reading left to
    right -- which is the obvious implementation and the wrong one -- lets any
    caller pick their own rate-limit bucket by sending a header.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if len(parts) >= TRUSTED_PROXY_HOPS:
        return parts[-TRUSTED_PROXY_HOPS]
    return request.client.host if request.client else "unknown"
```

> **Confirm `TRUSTED_PROXY_HOPS` before enforcing.** It depends on how many hops
> Railway adds, which is an empirical question, not a guess. Log the raw header on one
> endpoint during observe mode (§8) and read the answer off real traffic. Getting this
> wrong in the generous direction lets people choose their own bucket; in the strict
> direction it merges everyone into one.

### 4.2 Shared IPs are the norm, not the exception

Indian mobile carriers run CGNAT: thousands of subscribers share one public address.
Campus, office and café networks do the same. An IP-keyed login limit of any strictness
will eventually lock out an entire carrier segment — during a contest deadline, when
the support cost is highest.

So the axes carry different jobs:

- **The identifier limit does the security work.** Five login attempts per *account*
  per fifteen minutes stops credential stuffing, and it cannot collateral-damage anyone
  else, because the key is the account being attacked.
- **The IP limit is a blunt backstop against a single host spraying many accounts.**
  It should be generous enough that no plausible group of real users behind one address
  ever reaches it.

When in doubt, tighten the identifier and loosen the IP. That ordering is the whole
design.

---

## 5. Failure modes

The store can be unavailable. What happens then is a decision, not an accident:

| Route class | On store failure | Why |
|---|---|---|
| `login`, `register`, `refresh`, `google` | **Fail open** — allow, log at ERROR | A Mongo hiccup must not lock every user out of the product. The limiter is a safety net, not a gate. |
| `forgot-password/request`, `email/request` | **Fail closed** — 503, log at ERROR | These spend money on every call. A store outage must not become an open tap on your SMS and email budget. |

Both paths emit a metric. A limiter failing open silently is a limiter you will discover
is broken during the incident it was meant to prevent.

---

## 6. Response

`429 Too Many Requests`, with a `Retry-After` header in seconds and a structured body:

```json
{
  "detail": {
    "code": "rate_limited",
    "message": "Too many attempts. Please try again in 12 minutes.",
    "retry_after_seconds": 720
  }
}
```

`extractErrorMessage` already renders `{message}` objects, and since
`getErrorMessage` in `lib/api/client.ts` now defers to it (PR #35), this reaches the
user as the sentence rather than as raw JSON. **No frontend change is required** —
but the login and forgot-password screens should be checked once against a real 429.

Never say which axis tripped, or how many attempts remain. Both are free information
for someone probing the limits.

---

## 7. Implementation

```
app/utils/rate_limit.py      limiter, client_ip, identifier keys, the decorators
config/settings.py           RATE_LIMIT_* settings
main.py                      register the limiter + the 429 handler
app/routes/auth.py           decorate the limited routes
app/routes/users.py          decorate /me/email/request
tests/test_rate_limits.py
```

```python
# config/settings.py
rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
rate_limit_enforce: bool = Field(default=False, alias="RATE_LIMIT_ENFORCE")   # §8
rate_limit_storage_uri: Optional[str] = Field(default=None, alias="RATE_LIMIT_STORAGE_URI")
```

`rate_limit_storage_uri` defaults to `async+mongodb://` derived from `MONGODB_URL`, so
the feature works with no new configuration on either live service.

The limits themselves belong in one module-level table, not scattered across
decorators — they will be tuned repeatedly during §8, and hunting them through route
files makes that miserable.

---

## 8. Rollout: observe, then enforce

**Do not ship this enforcing.** Thresholds chosen from intuition will be wrong, and the
way you find out is a locked-out user during a contest.

1. **Observe** (`RATE_LIMIT_ENFORCE=false`). The limiter runs, counts, and logs every
   request that *would* have been blocked — with route, key axis, resolved IP, and the
   raw `X-Forwarded-For`. Nothing is rejected.
2. **Read the logs.** Two questions: would any real user have been blocked, and is
   `client_ip` resolving to plausible distinct addresses rather than one Railway IP
   (§4.1)? A single address dominating the logs means `TRUSTED_PROXY_HOPS` is wrong.
3. **Tune** the table in §3.1 against what actually happened, including at least one
   contest deadline — that is the peak this must survive.
4. **Enforce the money endpoints first** (`forgot-password/request`,
   `email/request`). They have the clearest abuse case and the least legitimate
   traffic.
5. **Enforce login and register** once the IP resolution has been proven over a full
   week including a deadline spike.

Keep `RATE_LIMIT_ENFORCE` as a runtime switch afterwards. If the limiter misbehaves at
2am, flipping one variable is a better remedy than a rollback.

---

## 9. Tests

The one rule: **no `sleep`.** A rate-limit suite built on real time is slow and flaky.
Inject the clock and the store instead.

| Test | Asserts |
|---|---|
| `test_identifier_limit_trips` | Six logins for one account in the window → 429 on the sixth |
| `test_identifier_limit_is_per_account` | Account A being limited does not affect account B |
| `test_ip_limit_is_separate_axis` | Trips independently of the identifier axis |
| `test_client_ip_takes_rightmost` | `X-Forwarded-For: 1.2.3.4, 5.6.7.8` with one hop → `5.6.7.8`, **not** `1.2.3.4` |
| `test_spoofed_forwarded_for_cannot_pick_a_bucket` | A caller varying the leftmost entry still shares one bucket |
| `test_observe_mode_never_blocks` | With `RATE_LIMIT_ENFORCE=false`, an over-limit request returns 200 and logs |
| `test_store_failure_fails_open_on_login` | Store raises → login still succeeds |
| `test_store_failure_fails_closed_on_otp` | Store raises → `forgot-password/request` returns 503 |
| `test_429_body_shape` | `code`, `message`, `retry_after_seconds`, and a `Retry-After` header |
| `test_hot_path_is_not_limited` | Team save and contest join are never rate limited |

`test_client_ip_takes_rightmost` and its spoofing sibling are the two that matter most:
they are the difference between a working limiter and an outage, and neither is
observable from the outside once deployed.

---

## 10. Open questions

1. **How many proxy hops does Railway add?** Determines `TRUSTED_PROXY_HOPS` (§4.1).
   Answered by observe mode; needed before enforcing.
2. **Do the existing `REDIS_URL` variables point at a real Redis?** Values are redacted
   to the read-only integration. If there is a real instance, switching the storage URI
   later is one variable — but nothing in this spec depends on the answer.
3. **Is a CAPTCHA in scope after repeated 429s?** It is the usual next step for login
   abuse, and deliberately out of scope here. Worth deciding before tuning the login
   limits, since a CAPTCHA fallback allows much tighter limits without lockout risk.
4. **Should admin routes be limited?** They are low-volume and authenticated, so the
   abuse case is weak — but an admin token leaking makes the bulk endpoints (player
   import) expensive. Suggested: a generous per-user limit, not per IP.
