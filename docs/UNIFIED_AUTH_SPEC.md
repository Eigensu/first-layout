# Unified Auth — Technical Specification & Migration Plan

**Status:** Ready for review (decisions locked, not yet implemented)
**Owner:** Aagam
**Scope:** One user account per person across every Walle tournament, past and
future, with each profile listing the tournaments that person took part in.

---

## 0. Decisions locked

These sixteen answers drive everything below. Changing one changes the design.

| # | Decision | Choice |
|---|---|---|
| 1 | Where users live | **One `users` collection**, global, in the one database. *(Originally specced as a separate `walle_auth` database; superseded by row 14 — see §2.1.)* |
| 2 | What makes two rows the same person | **Mobile OR email match**, resolved as connected components, with a **manual review queue** for chained merges. |
| 3 | Username collisions | **Login by mobile/email.** `username` loses its global unique index and becomes a display name. |
| 4 | Cross-subdomain SSO | **No.** Same credentials everywhere; the user signs in per subdomain (tokens stay per-origin in `localStorage`). |
| 5 | Passwords after a merge | **Accept any of the old passwords.** Legacy hashes are retained and promoted on first successful use. |
| 6 | What counts as "participated" | **Every signup is recorded**; the profile highlights tournaments actually played and lists the rest under "also registered". |
| 7 | Admin rights | **Per-tournament roles** on the membership record, plus a small explicit **platform-admin** allowlist. A legacy admin does not become a platform admin. |
| 8 | Cutover | **Backfill → verify → flip, one service at a time**, lowest-traffic first. |
| 9 | Email OTP | **Password reset only**, via Resend, as a second channel alongside 2Factor SMS. Login stays password-based; signup gains no verification step. See §5. |
| 10 | The open reset gate | **Endpoint deletion shipped as a standalone fix (C2b)** — it depended on nothing, per §5.1. Giving `fifth` a working reset channel (C2a) is a separate, still-open item. |
| 11 | Email as a merge key | **Unchanged.** Any email match still auto-merges; mobile SMS reset stays available as the recovery path. Residual risk recorded in §10. |
| 12 | Changing your email | Users can **change their email from their profile**, verified by a code sent to the new address (§5.7). |
| 13 | Scope | Only **lpcl and fifth** are running tournaments, both on `main`. m11, third and mtc are retired — services archived, but their **user and participation data still migrates** so profiles show full history. |
| 14 | End state | **One backend, one database.** A tournament is a registry row — not a deployment, not a database, and not a provisioning step. Game data is tagged with `tournament_id` (§3.5). |
| 15 | Admin | **On each tournament's own subdomain** (decided 2026-10-19, in place of the apex console first planned). Being admin is a role in one tournament; platform admins run the registry and every tournament (§4.7). |
| 16 | Participation stats | **Materialised by a job**, not computed per request and not maintained by write hooks. The membership row is upserted inline on join; all numbers come from the refresh job, which runs for **live tournaments only** and **freezes** a tournament's stats once it is `completed` (§6.2). |

---

## 1. Where we are today

Verified against the repo and the Railway `Walle` project (values redacted to
the read-only integration, names confirmed).

### 1.1 Deployment shape

Five backend services exist in the Railway project **Walle**, but **only two serve a
running tournament**: `second-layout` (lpcl) and `fifth-layout` (fifth). Both run
`main` from `Eigensu/first-layout`. The other three are retired and will be archived;
their *databases* are still in scope, because retired tournaments must still appear in
player profiles (§0, row 13).

| | Service | Repo · branch | Host | Tenant |
|---|---|---|---|---|
| **live** | `second-layout` | `first-layout` · `main` | `api-lpcl.wallearena.com` | lpcl |
| **live** | `fifth-layout` | `first-layout` · `main` | `fifth-api.wallearena.com` | fifth |
| retired | `first-layout` | `first-layout` · `logic/team-wise-players` | `api-m11.wallearena.com` | m11 |
| retired | `third-layout` | `first-layout` · `logic/mvp-api` | `walle-third.eigensu.in` | third |
| retired | `fourth-layout-mtc` | `fourth-layout-mtc` (separate repo) | `api-mtc.wallearena.com` | mtc |

**This removes the branch-drift blocker entirely.** Both live services run the same
`main` from this repository, so the auth changes are written once, not ported four
times. The `SYNC_SECRET` and `GOOGLE_CREDENTIALS_JSON` variables that suggested drift
are on `first-layout` (m11), which is being retired — they never needed porting.

Full data read from Railway, retained because the retired services' configuration
still matters while their databases are being read:

| Service | Repo | Branch | Public host | Tenant | Replicas | Builder |
|---|---|---|---|---|---|---|
| `first-layout` | `Eigensu/first-layout` | **`logic/team-wise-players`** | `api-m11.wallearena.com` | m11 | **2** | Railpack |
| `second-layout` | `Eigensu/first-layout` | `main` | `api-lpcl.wallearena.com` | lpcl | 1 *(sleeps)* | Nixpacks |
| `third-layout` | `Eigensu/first-layout` | **`logic/mvp-api`** | `walle-third.eigensu.in` | third | **2** | Railpack |
| `fourth-layout-mtc` | **`Eigensu/fourth-layout-mtc`** | `main` | `api-mtc.wallearena.com` | mtc | 1 | Railpack |
| `fifth-layout` | `Eigensu/first-layout` | `main` | `fifth-api.wallearena.com` | fifth | 1 | Railpack |

**The drift is worse than "at least one service".** Four distinct codebases are in
production: three different branches of `Eigensu/first-layout`
(`main`, `logic/team-wise-players`, `logic/mvp-api`) plus `fourth-layout-mtc`,
which is a **separate repository** — a hard fork, not a branch. Two services run
feature branches in production.

Other facts that bear on this plan:

- **`first-layout` and `third-layout` run 2 replicas each.** Any in-process state —
  a rate-limit counter, an OTP cache — is per-replica and therefore wrong. This is
  not hypothetical (§5.6).
- **`second-layout` has `sleepApplication: true`.** It cold-starts, which matters for
  the delta re-sync and smoke test during its flip.
- **Every service deploys to `europe-west4`** (Netherlands) for an India-facing
  product. Out of scope here, but worth a separate look.
- **`third-layout` is on `walle-third.eigensu.in`**, a different apex entirely — it is
  not covered by the `*.wallearena.com` wildcard certificate or CORS wildcard.

### 1.1a Environment-variable drift, measured

Railway returns variable *names* to a read-only integration even though values are
redacted — which is exactly what an audit needs. Present (`Y`) / absent (`·`):

| Variable | m11 | lpcl | third | mtc | fifth |
|---|---|---|---|---|---|
| `MONGODB_URL`, `MONGODB_DB_NAME`, `SECRET_KEY`, `JWT_*`, `CORS_ORIGINS` | Y | Y | Y | Y | Y |
| **`TWOFACTOR_API_KEY`** | · | **Y** | · | · | · |
| **`TWOFACTOR_TEMPLATE_NAME`** | · | **Y** | · | · | · |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | · | Y | · | · | Y |
| `GOOGLE_CREDENTIALS_JSON` | Y | · | · | · | · |
| `SYNC_SECRET` | Y | · | · | · | · |
| `REDIS_URL` | Y | · | Y | Y | Y |
| `CLOUDINARY_*` | Y | Y | Y | · | Y |
| `CRICKET_API_KEY` | Y | · | Y | Y | Y |

> **The row that matters most, now re-scoped to the two live tournaments:**
> `TWOFACTOR_API_KEY` is set on **`lpcl` only**. **`fifth` does not have it.** There,
> `send_otp_autogen` returns "Missing 2Factor configuration"; `/forgot-password/request`
> catches that and returns its generic "if the phone exists, an OTP has been sent"
> anyway — so it fails **silently**, and a `fifth` player with a password has no way
> back into their account. `fifth` does carry `GOOGLE_CLIENT_ID`, so Google accounts
> there are unaffected.
>
> This is one live tournament rather than four, but it is still a real outage and it is
> still the reason the endpoint in §5.1 cannot simply be deleted. See §5.1.

`GOOGLE_CREDENTIALS_JSON` and `SYNC_SECRET` exist on `m11` only and appear nowhere in
`config/settings.py`; `Settings.Config.extra = "ignore"` means they are silently
dropped by this repo's code, so they are read by whatever `logic/team-wise-players`
does. `NEXT_PUBLIC_*` variables are set on two backend services and do nothing.

`MONGODB_URL` is one cluster. So today the cluster looks like:

```
mongodb://cluster/
├── <db for first-layout>    users, refresh_tokens, teams, contests, players, …
├── <db for second-layout>   users, refresh_tokens, teams, contests, players, …
├── <db for third-layout>    …
├── <db for fourth-layout>   …
└── <db for fifth-layout>    …
```

One person who played three tournaments has **three unrelated accounts**, three
password hashes, and no way to see their own history in one place.

### 1.2 What the code assumes today

Facts that the migration has to respect or deliberately break:

- `User.username` is the login key *and* the JWT subject
  (`create_access_token(data={"sub": user.username})`, `apps/backend/app/routes/auth.py:134`),
  and `get_current_user` resolves a request by `User.find_one(User.username == sub)`
  (`apps/backend/app/utils/dependencies.py:26`). **Both break the moment usernames stop being unique** — this is
  the single largest code change in the plan.
- `username`, `email` are unique indexes; `mobile` has the partial unique index
  `uniq_mobile` (`apps/backend/app/models/user.py:33-57`).
- Login by mobile is a **full collection scan** (`async for u in User.find(User.mobile != None)`,
  `apps/backend/app/routes/auth.py:165` and `:328`), as is `reset_password_by_mobile`. Merging five
  user collections into one makes that materially worse; the new indexed lookup fixes it.
- Avatars live in **GridFS in the same database as the user** (bucket `avatars`,
  `apps/backend/app/utils/gridfs.py`). Moving users without moving avatars gives every
  migrated user a broken profile picture.
- User references inside a tenant database:
  `teams.user_id`, `team_contest_enrollments.user_id`, `import_logs.user_id`,
  `admin_action_logs.admin_id`. These must be rewritten to the new global ids.
- Auth-side collections that move wholesale: `users`, `refresh_tokens`,
  `user_profiles`, `password_reset_sessions`, `password_reset_tokens`.
- The frontend **never sends the tournament slug to the backend**. `middleware.ts`
  sets `x-tournament-slug` on the *Next.js* request only; `apiClient` sends no such
  header, and `API_BASE_URL` is a single origin per frontend deployment. Tenant
  identity on the backend therefore has to come from configuration (see §2.3).
- `is_admin` is one global boolean, checked by `get_admin_user` for every
  `/api/admin/*` route.
- There is an unused legacy `AuthGuardMiddleware` in
  `apps/backend/app/common/guards/auth_guard.py` that also resolves users by username. It is not
  wired into `main.py`; it still has to be updated or deleted so it does not become a
  trap later.

---

## 2. Target architecture

### 2.1 One database, two kinds of collection

There is no separate auth database and no per-tournament database. Everything lives in
one database; the only distinction that matters is whether a collection is **global**
or **tenant-scoped**.

```
walle_arena/

  ── global: no tournament_id, shared by every tournament ──
  users                      one document per real person
  tournaments                one per tournament — the registry (exists today)
  tournament_memberships     one per (person, tournament)   ← the new join table
  refresh_tokens
  user_profiles
  password_reset_sessions / password_reset_tokens
  identity_merge_audit       what the migration merged, and why
  user_id_map                {source_db, legacy_user_id} → global id
  merge_review               one per flagged group: its rows, and who kept which key
  import_ledger              which source each copied tenant document came from
  avatar_migration           phase 2's plan for phase 4
  avatars.*  contest_logos.*  sponsor_logos.*  carousel_images.*
                             GridFS; files keep their source _id (§7 Phases 3-4)

  ── tenant-scoped: every document carries tournament_id ──
  contests            teams              team_contest_enrollments
  players             slots              player_contest_points
  sponsors            carousel_images    import_logs
  admin_action_logs

  ── one row per tournament, plus the platform default ──
  global_settings     _id "tournament:<id>" per tournament; "global" is the default
```

The name is `walle_arena` because `walle_fantasy` is already taken: it is the oldest
tournament's database and one of the migration's sources (§7, Phase 0 results).

**Three global tables carry the whole idea:**

| Table | One row per | Answers |
|---|---|---|
| `users` | real person | "who is this, and what can they log in with" |
| `tournaments` | tournament | "what tournaments exist" — already exists today |
| `tournament_memberships` | (person, tournament) | **"which tournaments has this person played, and how did they do"** |

`tournament_memberships` is a join table rather than an array on the user document on
purpose. An array works at five tournaments and then stops: it grows without bound, it
cannot carry per-tournament data (the display name they used there, their role, their
rank), and it only answers one direction. The join table answers both — *"all
tournaments for this user"* for the profile, and *"all users in this tournament"* for
the admin panel — each off its own index.

> **Supersedes the earlier two-database design.** An earlier draft put auth in a
> separate `walle_auth` database with game data left in per-tournament databases. §2.5
> replaces that: the reasons for splitting were reasons to avoid a fan-out that one
> database does not have. `AUTH_DB_NAME` / `AUTH_MONGODB_URL` are therefore **not**
> needed; `MONGODB_DB_NAME` alone is the database.

### 2.2 One Beanie initialisation

With a single database this is the existing `connect_to_mongo` plus the new models —
no second client, no second `init_beanie`, no parallel model lists to keep in sync:

```python
# apps/backend/config/database.py
await init_beanie(
    database=client.get_database(settings.mongodb_db_name),
    document_models=[
        # global
        User, RefreshToken, UserProfile, TournamentMembership,
        PasswordResetSession, PasswordResetToken, IdentityMergeAudit, Tournament,
        # tenant-scoped
        Sponsor, CarouselImage, Team, AdminPlayer, PublicPlayer,
        PlayerContestPoints, Slot, ImportLog, AdminActionLog, Contest,
        TeamContestEnrollment, GlobalSettings,
    ],
)
```

`tests/conftest.py` keeps its own parallel list — a new model must be added to both, as
`CLAUDE.md` already warns.

### 2.3 How a service knows which tournament it is

> **Built 2026-10-19 (stage A2).** One setting, `TENANCY`, instead of a per-service
> `TOURNAMENT_SLUG`:
>
> - **`shared`** — the one backend on `walle_arena`. Every request names its
>   tournament in **`X-Tournament-Slug`**, which the frontend sets from the host on
>   every API call (`tenantHeaders()` in `common/consts/tournament.ts`, the same
>   `getTournamentSlugFromHost` the middleware uses). `get_tenant` resolves the slug
>   through the registry, so a header cannot invent a tenant. A missing, unknown or
>   archived slug is a 400.
> - **`single`** (the default) — a legacy per-tournament service. The tenant is
>   `None`, and `{"tournament_id": null}` matches exactly the documents that lack the
>   field, which in a legacy database is all of them. The live services needed no
>   variable change, and the same `scoped()` filter serves both modes.
>
> A service started in the wrong mode shows nothing rather than another tournament's
> data, and `config/startup_checks.py` refuses to start it at all: `single` against
> tagged data, or `shared` against untagged data. Checked against the dry run's copies:
> `rspl` and `Dcpl` start `single` and refuse `shared`; `walle_arena` starts `shared`
> and refuses `single`. `TOURNAMENT_SLUG` was never needed: there is one backend at the
> end (row 14), and until then each legacy service is the only tournament in its
> database.

```python
# apps/backend/app/utils/tenant.py

async def get_tenant(request: Request) -> TenantId:
    if not settings.shared_tenancy:
        return None

    slug = (request.headers.get(TENANT_HEADER) or "").strip().lower()
    if not slug:
        raise HTTPException(400, detail=f"Missing tournament: send the {TENANT_HEADER} header")
    tournament = await Tournament.find_one(Tournament.slug == slug)
    if not tournament or tournament.status == TournamentStatus.ARCHIVED:
        raise HTTPException(400, detail="Unknown tournament")
    return tournament.id
```

`<img>` requests cannot send the header, so the three image routes look up by id
unscoped (the id names one public image), and the default contest logo carries the
tournament in its URL: `/api/settings/logo?tournament_id=<id>`.

### 2.4 New settings

```python
# No AUTH_DB_NAME / AUTH_MONGODB_URL — there is one database (§2.1); and no
# TOURNAMENT_SLUG — there is one backend, so the tenant comes from the subdomain
# (public) or the path (admin), never from config (§2.3).
legacy_username_sub_until: Optional[datetime] = Field(default=None, alias="LEGACY_USERNAME_SUB_UNTIL")

# Email OTP channel (§5.4)
resend_api_key: Optional[str] = Field(default=None, alias="RESEND_API_KEY")
resend_from_email: Optional[str] = Field(default=None, alias="RESEND_FROM_EMAIL")
resend_reply_to: Optional[str] = Field(default=None, alias="RESEND_REPLY_TO")
```

Add all of these to `.env.example`, `docs/ENVIRONMENT_SETUP.md`, and
`packages/env-config`'s backend schema — and **delete the unused
`EMAIL_SERVICE_KEY`** while you are there, so there is one email variable rather
than two, one of which does nothing.

---


### 2.5 Tenant data: one database, scoped by `tournament_id`

> **Decided.** One database for everything. Segregating data per tournament is not
> *bad* — it is what you have today — but it is the wrong trade for this product, and
> the strongest evidence is that this entire project exists to undo it.

The unified-auth migration is expensive precisely because auth was **physically
segregated** per database. Applying the same pattern to game data means running this
same migration again the first time you want a cross-tournament leaderboard, a
"player of the year", or retention analytics.

**What segregation would cost, specifically here:**

| | |
|---|---|
| **Your headline feature is a cross-tournament read.** | "Every tournament this player took part in" is one indexed query under `tournament_id`. Under segregation it is N queries that fan out, and N grows every season. §6.2's denormalised stats exist *as a workaround for segregation* — remove it and they become an optimisation rather than a requirement. |
| **Beanie binds a model to one collection at `init_beanie`.** | Per-request collection or database switching means bypassing the ODM with raw Motor, or re-initialising models per tenant — and that is process-global state, so it is unsafe under concurrency. This cost is paid on every route, forever. |
| **It breaks your own invariant.** | `docs/TOURNAMENT_SUBDOMAINS.md` promises that creating a tournament touches no infrastructure. Under `tournament_id` that is literally true — a tournament is one registry row. Under segregation, creating one provisions ~12 collections, and every new model added later must be back-provisioned for every existing tournament. |
| **Sprawl.** | ~12 tenant collections × N tournaments: 60 at five, 240 after twenty seasons, each with its own indexes. Workable, but Compass and the shell stop being usable. |
| **Auth already crosses the boundary.** | Once `users` and `tournament_memberships` are global, "everything is segregated" is gone regardless. The only question left is game data — whose main cross-tenant consumer is the feature you asked for. |

**What segregation genuinely buys — and how to get it more cheaply:**

- *Blast radius: a bad query cannot cross tournaments.* Real, and the one legitimate
  worry. Buy it with a **single choke point** instead: tenant-scoped queries go through
  one repository helper that injects the filter, rather than each route remembering it.
  That is one place to review and one place to test, versus a cost on every route.
- *Drop a season in one command.* Real. Under `tournament_id` this is one
  `delete_many({"tournament_id": ...})`, or an export-to-cold-collection at season end
  — on demand, rather than as a permanent structural commitment.
- *Noisy-neighbour isolation.* Not a concern at your size; and if one tournament ever
  does get huge, you can split **that one** out physically later. Logical → physical is
  an easy move. Physical → logical is the migration you are doing right now.

**So: one database, shared collections, `tournament_id` on every tenant-scoped
document**, with:

```python
# Every tenant collection leads its compound indexes with tournament_id.
indexes = [
    [("tournament_id", 1), ("status", 1), ("start_at", -1)],
    [("tournament_id", 1), ("code", 1)],          # uniqueness becomes per-tournament
]
```

Note the second line: uniqueness constraints that are global today
(`Contest.code`, `Slot` names) become **unique per tournament**, which is almost
certainly what you actually want — two tournaments should each be able to have a
contest called `FINAL`.

This also simplifies §2.2 and §2.3: with one backend there is no second database to
initialise and no `TOURNAMENT_SLUG` env var. `users`, `tournament_memberships` and the
rest of auth are simply the collections that carry **no** `tournament_id`.

---

## 3. Data model

### 3.1 `users` — identity arrays

The merge rule (mobile **OR** email) means a merged person can legitimately own two
mobile numbers and two email addresses. A scalar field would silently drop the second
one and lock that person out of the credential they actually remember. So identity
becomes **arrays with unique multikey indexes**: merging is a set union, and MongoDB
still guarantees no two people share a credential.

```python
class LegacyHash(BaseModel):
    hashed_password: str
    source_db: str
    legacy_user_id: PydanticObjectId
    last_login: Optional[datetime] = None


class LegacyAccountRef(BaseModel):
    source_db: str
    legacy_user_id: PydanticObjectId
    username: str
    email: Optional[str] = None
    mobile: Optional[str] = None
    created_at: Optional[datetime] = None


class User(Document):
    # ---- identity (login keys) --------------------------------------------
    emails: List[str] = []          # lowercased; emails[0] is primary
    mobiles: List[str] = []         # digits-only; mobiles[0] is primary
    google_ids: List[str] = []

    # Kept as denormalized primaries so existing response schemas and
    # read paths keep working unchanged. Always == emails[0] / mobiles[0].
    email: EmailStr
    mobile: Optional[str] = None
    google_id: Optional[str] = None

    # ---- credentials -------------------------------------------------------
    hashed_password: Optional[str] = None
    legacy_hashes: List[LegacyHash] = []      # accepted at login, then promoted
    auth_provider: str = "password"           # "password" | "google"

    # ---- display -----------------------------------------------------------
    username: str                  # NO LONGER UNIQUE — a display name
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    avatar_file_id: Optional[str] = None      # GridFS id

    # ---- status ------------------------------------------------------------
    is_active: bool = True
    is_verified: bool = False
    is_platform_admin: bool = False           # replaces is_admin
    deleted_at: Optional[datetime] = None
    deletion_reason: Optional[str] = None

    # ---- provenance --------------------------------------------------------
    legacy_accounts: List[LegacyAccountRef] = []
    merge_state: str = "clean"                # "clean" | "needs_review" | "reviewed"
    merge_group_id: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)   # earliest of merged rows
    updated_at: datetime = Field(default_factory=utc_now)
    last_login: Optional[datetime] = None

    class Settings:
        name = "users"
        use_state_management = True
        indexes = [
            IndexModel([("emails", 1)], unique=True, name="uniq_emails"),
            IndexModel(
                [("mobiles", 1)],
                unique=True,
                partialFilterExpression={"mobiles.0": {"$exists": True}},
                name="uniq_mobiles",
            ),
            IndexModel(
                [("google_ids", 1)],
                unique=True,
                partialFilterExpression={"google_ids.0": {"$exists": True}},
                name="uniq_google_ids",
            ),
            "username",                        # lookup only, NOT unique
            [("created_at", -1)],
            [("merge_state", 1)],
        ]
```

Notes that matter:

- **Unique multikey indexes dedupe keys per document**, so the same value appearing
  twice inside one document's array is fine; only cross-document duplicates are
  rejected. That is exactly the semantics we want.
- The **partial filter on `mobiles.0`** is what keeps the hundreds of accounts with no
  mobile out of the index. Without it, every mobile-less account collides on the same
  missing/empty key. (Same trap the current `uniq_mobile` partial filter avoids.)
- Keeping the field name `username` rather than renaming it to `display_name` is
  deliberate: it avoids touching `UserResponse`, every admin screen, and the frontend
  types, for no behavioural gain. Its docstring and the API docs must say clearly that
  it is a display name now. If you want `display_name` in the API, add it as an alias
  on `UserResponse` rather than renaming the stored field.
- `is_admin` is **renamed** to `is_platform_admin`, not kept as a mirror — a leftover
  `is_admin` that some route still reads is exactly how a legacy tournament admin ends
  up with platform access.

### 3.2 `tournament_memberships`

One document per (person, tournament). This is the collection that answers "which
tournaments has this user participated in", and it is authoritative — it does not
require reading five databases at request time.

```python
class MembershipStats(BaseModel):
    teams_count: int = 0
    contests_count: int = 0
    best_rank: Optional[int] = None
    total_points: float = 0.0
    refreshed_at: Optional[datetime] = None


class TournamentMembership(Document):
    user_id: PydanticObjectId               # → users._id
    tournament_slug: str                    # "mtc", "lpcl", …
    tournament_id: Optional[PydanticObjectId] = None   # → tournaments registry
    source_db: str                          # tenant database this tenant's data lives in
    legacy_user_id: Optional[PydanticObjectId] = None  # id before migration

    display_name: str                       # the username this person used here
    role: str = "player"                    # "player" | "admin"
    status: str = "registered"              # "registered" | "played"

    joined_at: datetime = Field(default_factory=utc_now)
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    first_played_at: Optional[datetime] = None

    stats: MembershipStats = Field(default_factory=MembershipStats)

    class Settings:
        name = "tournament_memberships"
        indexes = [
            IndexModel(
                [("user_id", 1), ("tournament_slug", 1)],
                unique=True,
                name="uniq_user_per_tournament",
            ),
            # Makes the migration idempotent: re-running it cannot create a
            # second membership for the same legacy row.
            IndexModel(
                [("source_db", 1), ("legacy_user_id", 1)],
                unique=True,
                partialFilterExpression={"legacy_user_id": {"$exists": True}},
                name="uniq_legacy_row",
            ),
            [("tournament_slug", 1), ("role", 1)],
            [("user_id", 1), ("status", 1)],
        ]
```

`status` transitions `registered → played` the first time the user creates a team or
enrols in a contest in that tournament. It never goes back.

### 3.3 `identity_merge_audit` and `user_id_map`

```python
class IdentityMergeAudit(Document):
    """Why the migration decided two legacy rows were the same person."""
    merge_group_id: str
    user_id: Optional[PydanticObjectId] = None    # resulting global user
    members: List[LegacyAccountRef]
    edges: List[dict]        # [{"a": ..., "b": ..., "via": "mobile"|"email", "value": "…"}]
    component_size: int
    flagged: bool = False
    flag_reasons: List[str] = []   # "chained", "name_mismatch", "shared_mobile", …
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    decision: Optional[str] = None # "accept" | "split"
    created_at: datetime = Field(default_factory=utc_now)
```

`user_id_map` is a plain collection written by the migration and read by the
reference-rewrite step:
`{ "_id": {"source_db": "walle_m11", "legacy_user_id": ObjectId}, "user_id": ObjectId }`.
Keeping it forever is cheap and makes support questions ("which account did this old
team belong to?") answerable.

### 3.4 `tournaments` registry — no new fields

An earlier draft added `data_db_name` so the profile could find each tournament's
database. Under one database (§2.1) there is nothing to point at, so the registry is
unchanged from what is in the codebase today.

What it does need is **a row per tournament, including the retired ones** — m11, third,
mtc — with their real slugs and `status: "completed"`. Memberships reference
`tournament_id`, so a retired tournament with no registry row would show in a profile
as an id with no name. Set `api_base_url` empty on all of them: there is one backend.

---


### 3.5 `tournament_id`: which models, which indexes, and the one place the filter lives

Every collection is either **global** (no `tournament_id`) or **tenant-scoped** (always
has one, never optional). There is no third category, and the field is never nullable —
a document that cannot say which tournament it belongs to is a bug, not a default.

| Model | Collection | Change |
|---|---|---|
| `Contest` | `contests` | `+ tournament_id`; **`code` uniqueness becomes per-tournament** |
| `Team` | `teams` | `+ tournament_id` |
| `TeamContestEnrollment` | `team_contest_enrollments` | `+ tournament_id` (denormalised; `contest_id` already implies it) |
| `AdminPlayer` / `PublicPlayer` | `players` | `+ tournament_id` — **both models**, they share the collection |
| `Slot` | `slots` | `+ tournament_id` |
| `PlayerContestPoints` | `player_contest_points` | `+ tournament_id` |
| `Sponsor` | `sponsors` | `+ tournament_id` |
| `CarouselImage` | `carousel_images` | `+ tournament_id` |
| `ImportLog` | `import_logs` | `+ tournament_id` |
| `AdminActionLog` | `admin_action_logs` | `+ tournament_id` |
| `GlobalSettings` | `global_settings` | **stops being a singleton** — see below |

Global, unchanged: `users`, `tournaments`, `tournament_memberships`, `refresh_tokens`,
`user_profiles`, `password_reset_*`, `identity_merge_audit`, `user_id_map`.

#### Uniqueness that has to become per-tournament

This is the part that silently breaks if it is missed:

```python
# Contest.code is Indexed(str, unique=True) today — globally unique.
# Two tournaments must both be able to have a contest called "FINAL".
IndexModel([("tournament_id", 1), ("code", 1)], unique=True, name="uniq_contest_code_per_tournament")
```

`Tournament.slug` stays **globally** unique — it is a subdomain.
`TeamContestEnrollment.uniq_active_user_per_contest` needs no change: `contest_id` is
already unique to one tournament, so the constraint remains correct as written.

`Sponsor`'s unique `(featured, priority)` index was missed here and found by the dry
run, when the second tournament's sponsors collided with the first's. It is now
`uniq_sponsor_priority_per_tournament`, led by `tournament_id` (R38).

Every other tenant index gains `tournament_id` as its **leading** field, so that a
tenant-scoped query is a prefix match rather than a filter applied after the fact:

```python
[("tournament_id", 1), ("status", 1), ("start_at", -1)]    # contests
[("tournament_id", 1), ("user_id", 1)]                     # teams
[("tournament_id", 1), ("total_points", -1)]               # leaderboard
```

#### `GlobalSettings` becomes per-tournament

Today it is a singleton pinned to `id="global"` holding `min_players_per_team`,
`max_players_per_team` and the default contest logo. Under one database that singleton
would silently apply to every tournament at once — which is wrong, since squad rules
differ per tournament.

It becomes one document per tournament, and the resolution order gains a middle step:

```
Contest.max_players_per_team  →  tournament settings  →  platform default
```

`GlobalSettings.get_instance()` becomes `get_for_tournament(tournament_id)`, creating
the tournament's row from the platform default on first read. The two call sites are
`app/services/team_composition.py` and `resolve_max_players_per_team` in
`app/services/auction.py`.

> **Built differently (stage A2):** reads never create a row. `get_for_tournament`
> falls back to the platform default, so a tournament nobody has customised keeps
> tracking it. The admin settings routes write through `get_own_for_tournament`, which
> copies the default into the tournament's own `tournament:<id>` row (the `_id` Phase 3
> gives one) on the first edit. Saving the fallback would have changed the default
> for every tournament still tracking it. The call sites are the team routes, both
> contest responses, the admin contest checks and `/api/settings`; none calls
> `get_instance()` any more, and a test keeps it that way.

> Flagging this as a call I made rather than one you gave: per-tournament is the
> behaviour that matches what the field means, and `Contest.max_players_per_team`
> already exists as a per-contest override, so the hierarchy is natural. Say the word
> if you would rather it stayed one platform-wide setting.

#### One choke point for the filter

The failure mode of logical isolation is a route that forgets the filter. Rather than
trust twelve route files to remember, tenant-scoped reads go through one helper, and
that helper is what gets reviewed and tested:

```python
# app/utils/tenant.py

def scoped(model: type[Document], tournament_id: PydanticObjectId):
    """Every tenant-scoped query starts here.

    Routes never call model.find() directly on a tenant collection — the linting
    rule and the review checklist both key off that. One place to get right,
    one place to test, instead of a filter every route has to remember.
    """
    return model.find(model.tournament_id == tournament_id)
```

Enforce it with a test that walks the tenant models and asserts each one's routes go
through `scoped`, or a lint rule banning bare `.find(` on those models. A test is
better: it fails for the right reason and cannot be silenced with a comment.

> **Built (stage A2).** Every route and service now reads through `scoped()`,
> `scoped_one()` or `get_scoped()`, the last for lookups by id, since ids travel in
> URLs. Every document a route creates carries the request's `tournament_id`.
> `tests/test_tenant_scoping.py` parses every module under `app/routes`,
> `app/services` and `app/utils`, and fails on any `.find`, `.get`, `.aggregate` and
> the like called on a tenant model, under any alias. On `origin/main` it found 165;
> five remain, each named with its reason: the three image routes, and the two
> hot-player aggregations, whose pipelines open with `tenant_filter`. A stale exemption
> fails too. `tests/test_tenant_isolation.py` runs two tournaments side by side: every
> list endpoint, public and admin, returns only its own tournament's documents;
> 37 requests for the other tournament's ids return 404; bulk endpoints skip those ids;
> and after all of it the other tournament's documents compare equal field by field.
> It also drives each route's other paths under a tenant, among them squad edits,
> slot migration, delete-all and the leaderboard export. With the filter disabled in
> `scoped()`, 84 of its 119 tests fail.

---

## 4. Auth behaviour changes

### 4.1 JWT subject: username → user id

This is the change that everything else depends on, and the one most likely to bite
in production if rushed.

```python
# issue
create_access_token(data={"sub": str(user.id), "ver": 2, "tsl": tenant_slug})

# resolve  (apps/backend/app/utils/dependencies.py)
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    payload = decode_token(token)
    ...
    sub = payload.get("sub")

    if payload.get("ver") == 2 or ObjectId.is_valid(sub):
        user = await User.get(PydanticObjectId(sub))
    else:
        # Transitional: tokens minted before the cutover carry a username.
        # Usernames are no longer unique, so more than one match means we
        # cannot safely pick — force a re-login rather than guess.
        matches = await User.find(User.username == sub).limit(2).to_list()
        if len(matches) > 1:
            raise HTTPException(401, detail="Session is out of date, please sign in again")
        user = matches[0] if matches else None
    ...
```

The legacy branch is deleted once `LEGACY_USERNAME_SUB_UNTIL` passes. Set it to
**cutover + 8 days** (access TTL 1440 min + refresh TTL 7 days), so no live session is
cut off mid-use.

The same fix is needed in `app/common/guards/auth_guard.py`, or that file should be
deleted — it is not mounted in `main.py` today.

### 4.2 Login identifier resolution

`POST /api/auth/login` keeps its shape; the resolution order changes:

```python
async def resolve_login_identity(identifier: str) -> User | None:
    value = identifier.strip().lower()

    digits = "".join(ch for ch in value if ch in ASCII_DIGITS)
    if digits:
        user = await User.find_one(User.mobiles == digits)     # indexed, no scan
        if user:
            return user

    if "@" in value:
        user = await User.find_one(User.emails == value)       # indexed
        if user:
            return user

    # Transitional: someone typing their old username.
    matches = await User.find(User.username == value).limit(2).to_list()
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ambiguous_identifier",
                "message": "That username is used by more than one account. "
                           "Please sign in with your mobile number or email.",
            },
        )
    return None
```

This also removes the two full-collection scans in `auth.py` (login-by-mobile and
`reset_password_by_mobile`), which would otherwise get five times worse after the merge.

#### Will the frontend render that 409 gracefully?

Not as written — but the fix is one line in one shared place, and it touches no login
code. Traced end to end:

```
LoginForm.onSubmit            catch → err.message              (no parsing of its own)
  └── AuthContext.login       catch → getErrorMessage(error)   → throw new Error(msg)
        └── lib/api/client.ts getErrorMessage: object detail → JSON.stringify(detail)
                              409 hits no special case → returns that JSON string
```

So today a structured 409 renders in the login form's red box as literal
`{"code":"ambiguous_identifier","message":"That username is used by…"}`.

The cause is pre-existing and wider than this one status: **there are two error
helpers in the codebase and they have drifted.**
`utils/errors.ts → extractErrorMessage` is the structured-aware one (slot violations,
auction `over_by`, broken teams) and already ends with a generic
`if (typeof detail.message === "string") return detail.message`, which handles the
new shape with no changes at all. `lib/api/client.ts → getErrorMessage` is the naive
one, and it is the one every auth path goes through.

```ts
// lib/api/client.ts — replace the stringify fallback
} else if (detailRaw && typeof detailRaw === 'object') {
-  detail = JSON.stringify(detailRaw);
+  detail = extractErrorMessage(detailRaw);
}
```

`utils/errors.ts` imports nothing, so there is no cycle. That single change fixes the
409, and every future structured error on an auth route, without touching
`LoginForm`, `AuthContext`, or any other call site. The login modal needs **no**
rework.

Two smaller frontend notes while in there:

- The login zod schema accepts *"mobile 10–20 digits **or** any string ≥ 3 chars"*, so
  an email already validates. Only the placeholder copy needs changing.
- `ForgotPasswordModal.tsx` swallows its errors entirely (`catch (e) {}`) — it is dead
  code and should be deleted (§5.1), not fixed.

### 4.3 Password verification chain

```python
def verify_user_password(user: User, plaintext: str) -> tuple[bool, bool]:
    """Returns (ok, used_legacy). Legacy hashes are accepted once, then promoted."""
    if user.hashed_password and verify_password(plaintext, user.hashed_password):
        return True, False
    for legacy in user.legacy_hashes:
        if verify_password(plaintext, legacy.hashed_password):
            return True, True
    return False, False
```

On a successful legacy hit, the login route sets `hashed_password` to a fresh hash of
the supplied password, clears `legacy_hashes`, and saves. So the extra secrets exist
only until each user next signs in.

A scheduled job clears `legacy_hashes` on any account untouched for **180 days** after
cutover, so the window does not stay open indefinitely. Both numbers (`180`, and the
promote-on-use behaviour) should be stated in the release notes.

### 4.4 Registration

- `username` uniqueness check is **removed** (it is a display name).
- Mobile stays required for password signups, and is now the primary identity.
- After insert, create the `TournamentMembership` for the current tenant with
  `status="registered"`.
- The `DuplicateKeyError` handler now maps to "mobile or email already registered".

### 4.5 Google sign-in

`find_or_create_google_user` changes lookup order to `google_ids → emails`, and on
linking appends rather than overwrites:

```python
user = await User.find_one(User.google_ids == google_id) \
    or await User.find_one(User.emails == email.lower())
if user:
    if google_id not in user.google_ids:
        user.google_ids.append(google_id)
        user.google_id = user.google_ids[0]
    ...
```

`_generate_unique_username` can be simplified to "slugify the email local part" — no
uniqueness loop needed any more. The relay design in `docs/GOOGLE_OAUTH_RELAY_SPEC.md`
is unaffected: it only moves *where* the ID token is obtained.

### 4.6 Refresh tokens

`RefreshToken` gains `tournament_slug` plus `issuer_service`. Lookups filter on both token and slug. JWT secrets already differ per
service so a token cannot be replayed cross-tenant today; scoping makes that explicit
rather than accidental, and makes a future "sign out everywhere" feasible.

### 4.7 Admin

**Built (stage D, 2026-10-19), with admin kept on each tournament's subdomain.** It is
in `app/utils/dependencies.py`:

```python
def is_platform_admin(user) -> bool:
    if not settings.shared_tenancy:
        return user.is_admin            # a legacy service is its own platform
    return user.is_platform_admin       # the allowlist; legacy is_admin is ignored

async def is_tournament_admin(user, tournament_id) -> bool:
    if is_platform_admin(user):
        return True
    if not settings.shared_tenancy or tournament_id is None:
        return False
    return await TournamentMembership.find_one(
        TournamentMembership.user_id == user.id,
        TournamentMembership.tournament_id == tournament_id,
        TournamentMembership.role == ROLE_ADMIN,
    ) is not None

async def get_platform_admin(user = Depends(get_current_active_user)): ...
async def get_tournament_admin(
    user = Depends(get_current_active_user), tournament_id = Depends(get_tenant)
): ...
```

**Where admin lives: on the subdomain.** `rspl.wallearena.com/admin` administers rspl.
The tournament comes from `X-Tournament-Slug`, resolved by `get_tenant` exactly as for
every other tenant route. The lookup uses `tournament_id`, not the denormalised slug,
so a renamed slug cannot leave an admin role behind.

The earlier design here put all admin on the apex, with the slug in the API path. Its
argument against a header was that stale client state could send `fifth` while the
browser URL says `lpcl`. That does not apply to this header: `tenantHeaders()` reads
it from `window.location.host` on every request, so the page and the request name the
same tournament by construction. The apex console remains a later option for platform
admins who switch tournaments often. Nothing here would need undoing for it.

Route mapping, enforced by `tests/test_tournament_admin.py`, which fails if any
`/api/admin` route has a guard other than the one below:

| Routes | Guard |
|---|---|
| `/api/admin/tournaments/*` (the registry) | `get_platform_admin` |
| every other `/api/admin/*` route (contests, players, imports, slots, teams/users, settings) and the sponsor and carousel writes | `get_tournament_admin` |

Settings are a tournament admin's, not a platform admin's, because each tournament
now has its own (§3.5).

- **Under `shared`:** a platform admin passes for every tournament; anyone else needs
  an admin membership in the tournament the request names. Admin of one tournament is
  nothing in another. The global `is_admin` grants nothing: the migration clears it,
  and honouring a stray one would make every legacy admin an admin of every
  tournament.
- **Under `single`:** unchanged. `is_admin` passes both guards, and memberships and
  `is_platform_admin`, which a legacy database does not have, grant nothing.

`GET/PUT/PATCH /api/users/me` report `is_admin` for the tournament the request names
(`get_optional_tenant`), plus `is_platform_admin`. The frontend shows its admin pages,
and the Tournaments tab, from these. That route never fails over the tournament: with
no slug, or an unknown or archived one, it reports admin of nothing. The frontend
signs people out when `/me` fails.

**One route changed what it lists.** `GET /api/admin/users-with-teams` paged over
every account and then dropped those with no team in this tournament. Once all
tournaments share one `users` collection, most pages came back empty, `total`
counted the whole platform, and a name search could fill its page with other
tournaments' players. It now pages over this tournament's team owners only.

Migration sets `role="admin"` on the membership for every legacy row with
`is_admin: true`; `is_platform_admin` is set **only** from an explicit allowlist you
confirm before the run.

**Appointing admins after cutover** (built 2026-10-20). Without this, a tournament
created after cutover would have no admin until someone edited the database. A platform
admin lists, appoints and removes a tournament's admins from the Tournaments tab
("Admins" on each card):

| Route | Does |
|---|---|
| `GET /api/admin/tournaments/{id}/admins` | That tournament's admin memberships, with name, username and email |
| `POST /api/admin/tournaments/{id}/admins` `{identifier}` | Finds the account by mobile, email or username (the login resolver, so an ambiguous username is a 409 asking for mobile or email), then sets `role="admin"` on its membership, creating one if they have never been to the tournament |
| `DELETE /api/admin/tournaments/{id}/admins/{user_id}` | Sets the role back to `player`; the membership and its history stay |

All three are platform-admin only, so a tournament admin cannot appoint more admins.
Each change is written to `admin_action_logs`. Under `single` they answer 409, since
admins there are `is_admin` and nothing reads a membership's role.

---

## 5. Password reset — two channels, and a gate that is open

### 5.1 The gate: `POST /api/auth/reset-password-mobile`

This endpoint is live, unauthenticated, and resets any account's password given
only a mobile number:

```python
# apps/backend/app/routes/auth.py:320
@router.post("/reset-password-mobile")
async def reset_password_by_mobile(payload: ResetPasswordByMobile):
    ...                                   # find user by mobile digits
    matched_user.hashed_password = get_password_hash(payload.new_password)
    await matched_user.save()             # no OTP, no token, no auth
```

**Correction to an earlier read of this.** The frontend has already moved on:
`ForgotPasswordModal.tsx` is **orphaned** — nothing imports or renders it, and
`LoginForm.tsx:14` carries the comment *"Removed legacy ForgotPasswordModal in favor
of new OTP flow pages"*. The live UI is three pages under
`src/app/auth/forgot-password/` (`request` → `verify` → `reset`) which call the
correct backend OTP endpoints via `fetch`. So the UI is fine.

**The endpoint is the problem, and it does not need the UI.** It is an unauthenticated
`POST` on a public API; `curl` is the exploit. It is still routed in `main.py`, and
`authApi.resetPasswordByMobile` plus the orphaned modal are dead code pointing at it.

There is also **no rate limiting anywhere in the backend**, so the mobile number
space is enumerable at whatever rate Railway will serve — and two of the five
services run 2 replicas, so any in-process counter would be wrong anyway (§5.6).

**Why it gets worse under unification.** Today one compromised number yields one
tournament's account. After the merge it yields *every* tournament that person
played — and, if they hold a `role: "admin"` membership anywhere, that
tournament's admin surface too. The unification does not create this bug, but it
multiplies its blast radius.

**The fix is smaller than first scoped** — the OTP pages already exist, so there is
nothing to rebuild:

1. Delete the route and the `ResetPasswordByMobile` schema.
2. Delete `authApi.resetPasswordByMobile` and `ForgotPasswordModal.tsx` — both dead.
3. Add the rate limits in §5.6.

**Correcting an ordering constraint this document previously asserted.** An earlier
draft said the endpoint could not be deleted until every tournament had a working OTP
channel, on the reasoning that deleting it would strand users. That was wrong, and
implementing it is what showed why: **`ForgotPasswordModal` is orphaned**, so the
endpoint is not reachable from the product at all. No real user can get to it; only a
direct API call can. Deleting it therefore takes nothing away from anyone.

`fifth` having no working reset is a **separate, pre-existing outage** (§1.1a) that the
deletion neither causes nor worsens. The two are independent:

| | Step | Applies to | Depends on |
|---|---|---|---|
| C2a | Configure a working reset channel — 2Factor credentials, or the Resend email channel from §5.4 — and verify end to end | **fifth** | — |
| C2b | Delete the endpoint and the dead frontend code | lpcl, fifth | — *(shipped)* |
| C2c | Add rate limits — `docs/RATE_LIMITING_SPEC.md` | lpcl, fifth | — *(MongoDB-backed; no longer blocked on Redis)* |

C2b shipped first precisely because it turned out to depend on nothing.

This also reframes C3: the **email channel is not merely additive**, it is a
candidate way to give `fifth` a reset path at all — and, once there is one backend,
the channel every future tournament inherits without another set of SMS credentials.

### 5.2 One session model, two channels

Email OTP is an **additional channel for password reset only** — login stays
password-based, and signup gains no verification step. A user picks the channel;
mobile SMS remains available to everyone who has a number on file.

```python
class PasswordResetSession(Document):
    user_id: PydanticObjectId
    purpose: str = "password_reset"     # "password_reset" | "email_change"
    channel: str = "sms"                # "sms" | "email"
    destination: str                    # digits-only mobile, or lowercased email

    provider: str = "2factor"           # "2factor" | "resend"
    provider_session_id: Optional[str] = None   # SMS only — 2Factor holds the code
    otp_hash: Optional[str] = None              # email only — we hold the code

    status: str = "pending"             # pending | verified | completed
    attempts: int = 0
    max_attempts: int = 5
    expires_at: datetime
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "password_reset_sessions"
        indexes = [
            [("destination", 1), ("purpose", 1), ("status", 1)],
            [("expires_at", 1)],
        ]
```

The existing `phone` field becomes `destination`. **This collection is ephemeral** —
sessions expire in ten minutes — so the schema change needs no data migration;
drop any in-flight sessions at deploy and let clients restart the flow.

### 5.3 Why the two channels are not symmetrical

2Factor's `AUTOGEN` **generates and holds the code server-side**: the app never sees
it, and verification is a call to `/SMS/VERIFY/{session_id}/{otp}`. Resend is only a
transport — it has no concept of an OTP. So on the email channel *we* generate,
store and verify the code, and that half needs care the SMS half never did.

```python
def generate_otp() -> str:
    return f"{secrets.randbelow(10**6):06d}"        # secrets, never random

def hash_otp(code: str, session_id: PydanticObjectId) -> str:
    """Keyed HMAC, not a bare digest.

    A 6-digit code is 10^6 possibilities — a plain SHA-256 of it is brute-forced
    instantly offline if the collection ever leaks. HMAC with SECRET_KEY means an
    attacker needs the application secret as well. The session id is in the
    message so the same code in two sessions does not hash alike.
    """
    return hmac.new(
        settings.secret_key.encode(), f"{session_id}:{code}".encode(), hashlib.sha256
    ).hexdigest()
```

Compare with `hmac.compare_digest`, never `==`.

### 5.4 The Resend service

New `apps/backend/app/services/auth/email_otp.py`, deliberately mirroring the shape of
`twofactor.py` so both channels read the same way:

```python
RESEND_URL = "https://api.resend.com/emails"

async def send_otp_email(
    to: str, code: str, session_id: str, tournament_name: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    if not settings.resend_api_key or not settings.resend_from_email:
        return False, "Resend is not configured"

    brand = tournament_name or "Walle Fantasy"
    payload = {
        "from": settings.resend_from_email,
        "to": [to],
        "subject": f"{code} is your {brand} password reset code",
        "html": render_otp_email(code, brand, settings.otp_expiry_seconds),
    }
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        # Resend honours this for 24h — a retried send cannot mail two codes.
        "Idempotency-Key": f"pwreset:{session_id}",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(RESEND_URL, json=payload, headers=headers)
        ...
```

Decisions worth keeping:

- **`httpx`, not the `resend` SDK** — matches `twofactor.py` and adds no dependency for
  one POST.
- **The code goes in the subject line.** It shows in the notification preview, so the
  user often never opens the mail.
- **Never log the code or the API key.** `twofactor.py` already redacts both; follow it.
- **Brand per tenant.** The tournament slug is known from §2.3, so a reset started on
  `m11.wallearena.com` can say so — one of the few places the multi-tenant routing
  becomes visible to the user.

New settings:

```
RESEND_API_KEY
RESEND_FROM_EMAIL="Walle Fantasy <no-reply@send.wallearena.com>"
RESEND_REPLY_TO                       # optional
```

`OTP_EXPIRY_SECONDS` and `OTP_MAX_ATTEMPTS` are reused as-is. Delete the unused
`EMAIL_SERVICE_KEY` placeholder from `config/settings.py` and `.env.example` so there
is one email variable rather than two, one of which does nothing.

**DNS.** Verify a **sending subdomain** (`send.wallearena.com`), not the apex — this is
Resend's own recommendation and it keeps transactional reputation isolated, so a bad
week of bounces cannot damage the apex domain. Verification publishes SPF and a DKIM
record at `resend._domainkey`, plus an MX for the return path. DMARC is *not* set up
automatically; start at `p=none` and watch the reports. The nameservers have already
moved for the wildcard certificate (`docs/TOURNAMENT_SUBDOMAINS.md`), so these records
go wherever DNS is managed now.

### 5.5 Endpoints

```
POST /api/auth/forgot-password/request   { channel, destination }
POST /api/auth/forgot-password/verify    { channel, destination, otp }
                                         → { reset_token, expires_in_sec }
POST /api/auth/forgot-password/reset     { reset_token, new_password }   (unchanged)
```

Behaviour to preserve or fix while touching this code:

- **Keep the generic response** on `/request` regardless of whether the destination
  exists. The current code already does this and it is the anti-enumeration property;
  it is easy to lose while adding a second channel.
- **Resolve by index, not by scan.** `start_session` currently reads every user with a
  mobile to find one match. Both channels become indexed lookups under §4.2:
  `User.mobiles == digits` / `User.emails == value`.
- **Drop the unanchored regex fallback.** `PasswordResetSession.phone.regex(input_digits)`
  matches any session whose destination merely *contains* those digits. With
  digits-only destinations the fallback is unnecessary.
- **Accept only `verified` sessions at reset.** The current guard is
  `status not in ("verified", "pending")`, which lets a `pending` session through.
- **A reset should clear `legacy_hashes`.** It already revokes every refresh token;
  clearing the legacy hashes too means a reset invalidates *every* old credential, and
  is the fastest way to shrink the §4.3 window.

**Built (2026-10-21, stage C3).** `app/services/auth/email_otp.py` (Resend),
`password_reset.py` (both channels and the sessions they share), the routes in
`routes/auth.py`, and `tests/test_email_channel.py`. Where it differs from the above:

- **The body is `{phone}` or `{email}`, not `{channel, destination}`.** `{phone}` is
  what the live website sends, so it keeps working unchanged; `{email}` is the new
  channel. Exactly one, or 422.
- **`GET /api/auth/forgot-password/channels`** → `{"sms": bool, "email": bool}`: which
  channels this service is configured to send on. The website offers only those, and
  falls back to SMS alone against a backend that predates the route.
- **An unconfigured channel answers 503** (`code: "channel_unavailable"`), before any
  account is looked up, so the answer depends on configuration alone and says nothing
  about who exists. This ends `fifth`'s silent failure (§1.1a): its `/request` used to
  say "an OTP has been sent" with no 2Factor credentials to send one. Every other
  failure keeps the generic reply, because a send is only attempted for an account
  that exists.
- **SMS destinations are digits only**, compared by equality. A session started as
  "+91 98765 43210" is verified as "+91 98765 43210"; the website carries the string it
  sent from one page to the next, so the old pattern fallback had no job left.
- **The attempt cap is a conditional increment** (`attempts < max_attempts` in the
  update's filter). On email we check the code ourselves, so a read-then-save count
  would let parallel guesses through on one count. Moving a session to `verified`, and
  spending a reset token, are conditional updates too, so each happens once.
- **Brand:** a reset started on a tournament's site names that tournament (its
  registry `name`) in the subject and body; otherwise "Wall-E Arena".
- Sessions carry `purpose`, so an email-change code cannot open a reset, and a reset
  cannot spend an email-change session.
- **A reset checks the code's destination still belongs to the account**
  (`identity.holds_destination`). A session outlives an email change or a new number
  on the profile by up to its expiry, and whoever holds the old address or number
  must not finish the reset with it (Greptile on #57).

### 5.6 Rate limiting

There is none today, anywhere. Adding a second OTP channel without it means an attacker
can burn your Resend quota and your 2Factor credits as well as enumerate accounts.

**Specified separately in `docs/RATE_LIMITING_SPEC.md`** — it is platform-wide plumbing,
independently shippable, and outlives this migration. The short version:

- `slowapi` backed by **MongoDB** (`limits` supports `async+mongodb://`), so it needs no
  new infrastructure and works on `lpcl`, which has no `REDIS_URL`.
- **The identifier is the primary axis, not the IP.** Indian carriers run CGNAT, so an
  IP-keyed login limit eventually locks out a whole carrier segment — during a contest
  deadline. Tight per-account limits do the security work; the IP limit is a loose
  backstop.
- **Do not use slowapi's built-in key functions.** Behind Railway's proxy they resolve
  to the proxy's address, which puts every user in one bucket.
- **Ship in observe-only mode first**, tune from real traffic including one contest
  deadline, then enforce the money endpoints before the login ones.

The OTP send endpoints are the ones with a real budget attached, and they are the first
to be enforced.

### 5.7 Changing the email on a profile

Requested alongside email OTP, and it is what makes the email channel safe to rely on:
a user who mistyped their address at signup can currently never fix it, so the email
channel would be permanently broken for exactly the people most likely to need it.

```
POST /api/users/me/email/request   { email }    → sends a code to the NEW address
POST /api/users/me/email/verify    { otp }      → commits the change
```

- **Reject collisions first.** 409 if any other user's `emails[]` already holds the
  address.
- **Verify before committing.** The code goes to the *new* address; without that step a
  typo silently costs the user their reset channel, which is the problem this feature
  exists to solve. The OTP machinery from §5.2 is reused via `purpose: "email_change"`.
- **On success**: set `emails[0]` to the new address, mirror it to the `email` scalar,
  and **remove the old address** from `emails[]` — a mistyped or abandoned address
  should stop being a credential. Set `is_verified = True`; this is the first time that
  flag means anything on a password account.
- Mobile changes stay on `PATCH /api/users/me` as today. This endpoint does not touch
  `mobiles[]`.

**Built (2026-10-21, stage C3).** `app/services/auth/email_change.py`, the two routes
in `routes/users.py`, and the profile's "Change Email" card
(`components/dashboard/ChangeEmailSection.tsx`). Added in building it:

- **Re-authentication on `/request`**: `{email, password}`, or for an account without
  a password a fresh Google or Apple sign-in (`google_id_token` /
  `apple_identity_token`), as deleting the account already asks. Once email can reset
  a password, an email change is an account takeover for anyone holding a stolen
  session; asking for something the session alone lacks closes that. A refusal is a
  400, not a 401, because the clients read a 401 on a signed-in route as an expired
  session and sign the person out. The rate limit counts before the password check,
  so this is not an unlimited way to guess one.
- 400 if the address is already the account's email; 409 if another account holds it
  in `emails[]` or the `email` scalar, checked again at `/verify` and settled by
  `uniq_emails` on a race; 502 if the code could not be mailed; 503 when Resend is not
  configured.
- The commit writes only `emails`, `email`, `removed_emails`, `is_verified` and
  `updated_at`, so a sign-in or password change landing meanwhile is not overwritten.
  The reverse holds too: every other route that writes a signed-in account (login and
  Google/Apple sign-in, promoting a legacy password, reset and change of password,
  `PUT`/`PATCH /me`, account deletion) writes only the fields it changed, where it
  used to save the whole account as it read it and could put an old email back
  (Greptile on #57).
- **The old address stays removed.** It goes into a new `User.removed_emails`, which
  Google and Apple sign-in check before recording the provider's address. They record
  a changed provider address on every sign-in, so without this a Google-linked account
  would get its old address back on the next Google sign-in. Changing back to an
  address takes it off the list. Open reset sessions mailed to the old address are
  deleted at the same time (Greptile on #57).
- The website shows the card only when the email channel is on.

---

## 6. The profile: tournaments participated in

### 6.1 Endpoint

```
GET /api/users/me/tournaments
```

```json
{
  "played": [
    {
      "slug": "mtc",
      "name": "MTC 2025",
      "logo_url": "https://…",
      "status": "completed",
      "display_name": "rahul",
      "joined_at": "2025-04-02T10:11:00",
      "first_played_at": "2025-04-02T10:40:00",
      "last_active_at": "2025-05-30T18:02:00",
      "teams_count": 3,
      "contests_count": 2,
      "best_rank": 14,
      "total_points": 812.5
    }
  ],
  "registered_only": [
    { "slug": "fifth", "name": "Fifth League", "joined_at": "2024-01-18T09:00:00" }
  ]
}
```

Sorted by `last_active_at desc`, falling back to `joined_at`. Also add
`GET /api/admin/users/{user_id}/tournaments` (tournament admin scope) for support.

**Built (stage E, 2026-10-19)** in `app/routes/users.py`. It differs from the above in
three ways:
- `registered_only` entries also carry `logo_url` and `status`, so both lists can
  render the same card.
- Archived tournaments are included, because a profile is a history.
- Dates are served in IST with the offset written out (`…+05:30`), like the contest
  and tournament responses. Mongo returns them without a zone, which a browser would
  read as local time.

The admin support endpoint is **not built**. It would show one tournament's admin
which other tournaments a player has played, which is a privacy call to make first.

### 6.2 Where the numbers come from

> **First, a correction to the premise this section was written on.** The original
> justification was "the data lives in up to five databases and a profile page cannot
> fan out across all of them." Under §2.5 that is no longer true — one database,
> `tournament_id` on every tenant document. **The expensive fan-out this section exists
> to avoid mostly disappears.** Count the queries:

| | Materialised memberships | Computed live, one database |
|---|---|---|
| Participation list | `memberships.find({user_id})` — 1 | `enrollments.aggregate([$match {user_id}, $group by tournament_id])` — 1 |
| Tournament names/logos | 1 (or 0 if denormalised onto the membership) | 1 |
| `best_rank`, `total_points` | included | **expensive** — needs leaderboard data per contest |

So materialisation is **not** saving you round trips to Mongo; at one database it is
roughly the same call count either way. What it actually buys is the third row —
rank and points, which are costly to recompute — plus a simpler read path.

That reframes the job from *required* to *a cache*, which makes the simplification you
proposed the right shape. Two amendments to it.

**Amendment 1: the trigger is wrong.** A tournament being *added* is the one moment it
has no participation to record — the table would be filled with nothing. Participation
accrues *during* a tournament. So the job runs on a cadence, and the useful
tournament-lifecycle hook is at the **other** end:

- **While a tournament is `live`** — refresh on a schedule. Only live tournaments are
  ever touched, which is one or two at a time, not the whole history.
- **When a tournament flips to `completed`** — run once more, then **freeze**. Those
  stats are final by definition and never need recomputing again. Every past tournament
  costs nothing forever after.

**Amendment 2: create the membership row inline, keep stats in the job.** Without this,
a player who joins their first contest sees their profile not list that tournament at
all until the job next runs — which reads as a bug, not as staleness. It is a single
upsert in two places:

```python
# app/services/membership.py — called from register, and from team create / enrol
await TournamentMembership.find_one(
    TournamentMembership.user_id == user.id,
    TournamentMembership.tournament_id == tournament_id,
).upsert(
    Set({"status": "played", "last_active_at": utc_now()}),
    on_insert=TournamentMembership(
        user_id=user.id, tournament_id=tournament_id,
        display_name=user.username, status="played",
        first_played_at=utc_now(),
    ),
)
```

Everything numeric — `teams_count`, `contests_count`, `best_rank`, `total_points` —
comes from the job. So the split is: **the row appears instantly, the numbers catch up.**

**Built (stage E)** in `app/services/membership.py`, with one change to when a row
appears. `record_sign_in` runs on every sign-in on a tournament's site, not only on
registration: password, Google, Apple and registration itself. It creates a
`registered` row if there is none and otherwise only moves `last_login_at` on. There
are two reasons for the change:
- With one account everywhere, registering for a tournament now means turning up on
  its site signed in.
- Google and Apple sign-in find or create an account in one step, so a route cannot
  tell a new account from a returning one.

`record_play` runs on team create and contest entry. It sets `played`,
`last_active_at`, and `first_played_at` the first time only.

Both do nothing under `TENANCY=single`, or on the apex where there is no tournament.
Neither can fail the request that called it: a failed write is logged and left to the
job. A row created by a concurrent request between the update and the insert still
gets this request's write.

### 6.2a The job

`scripts/refresh_membership_stats.py`, one aggregation per live tournament:

```python
# Counts for every participating user in one tournament, in a single pass.
pipeline = [
    {"$match": {"tournament_id": tournament_id, "status": "active"}},
    {"$group": {
        "_id": "$user_id",
        "contests_count": {"$addToSet": "$contest_id"},
        "teams_count": {"$addToSet": "$team_id"},
    }},
]
```

`--tournament <slug>` for one, `--all-live` for the scheduled run, `--since <ts>` for
an incremental pass. Run it from a Railway cron, or on demand from the admin panel —
"Refresh stats" next to the tournament is a reasonable button to have.

**Built (stage E)** as `app/services/membership_stats.py`, run by the script. It
differs from the pipeline above:
- `teams_count` counts the **teams a person made** (the `teams` collection), not the
  teams they entered, so a team never entered still counts.
- `contests_count` counts contests with an **active** entry; a withdrawn entry does
  not count.
- `best_rank` and `total_points` come from `app/services/standings.py`. That is the
  leaderboard's own computation, moved out of the route unchanged, so a profile's best
  rank is always the rank its leaderboard showed. `total_points` sums each contest's
  entry; there is one active entry per person per contest.
- It **repairs** as it goes. Anyone with a team but no row gets one, dated from their
  first team, and a member who has played is marked `played`. `last_active_at` is
  rebuilt from their latest team or entry, but only ever moved forward, so a later
  play written inline is kept. The profile orders tournaments by it.
- Flags are `--all-live`, `--tournament <slug>` (repeatable) and `--all`, which takes
  every tournament, archived included, for the cutover fill below. `--since` is not
  built: a pass over one live tournament is cheap.

Scheduling it is part of cutover (§7, Phase 6).

**It is the same script as the migration backfill**, so it is not throwaway code: the
one-time historical fill for m11, third and mtc and the ongoing refresh are the same
code path, which also means the refresh is exercised long before it runs in production.

### 6.3 Frontend

- `apps/frontend/src/lib/api/` gains `tournaments.ts` (public module) with
  `getMyTournaments()` and its response types.
- The dashboard/profile page gains a **Tournaments** section: a "Played" list of cards
  (name, logo, teams, contests, best rank, points) and a muted "Also registered" list.
- Colors come from the `--bg-*`/`--accent-*`/`--text-*` custom properties in
  `globals.css` — no hex literals, per `colour-spec.md`.
- Login form copy changes from "Username" to **"Mobile number or email"**, with helper
  text for the transition period.

**Built (stage F, 2026-10-19).**
- `src/lib/api/tournaments.ts` has `getMyTournaments()`.
- The profile's **Your Tournaments** card is `src/components/dashboard/MyTournamentsSection.tsx`. It sits first in the dashboard's right-hand column.
- Each card shows its name, logo, status, teams, contests, best rank, points and last played date. It also shows "Played as …" when that name differs from the account's username.
- A tournament links to its own subdomain, except the site already open (marked "This site") and archived ones, whose subdomain is gone.
- The card is left out entirely when there is nothing to list or the backend has no such endpoint. That is what today's single-tournament services report, so they look as they did.
- **Colours follow the dashboard page, not the tokens above.** That page is styled with its own slate, cyan and amber palette and uses none of the `--bg-*` custom properties, so the new card matches its neighbours. Moving the whole page onto the tokens is a separate job.
- The login form says "Mobile number or email", with a line saying a username still works for now. Validation still accepts anything of three or more characters, which keeps old usernames working.
- The **change-email UI is not built**: it needs the email-code channel (C3).

---

## 7. Migration

All scripts live in `apps/backend/scripts/unified_auth/`, take
`--dry-run` by default, and write artefacts to a timestamped output directory. Every
one is **idempotent** — re-running must converge, not duplicate, which the unique
indexes on `user_id_map` and `uniq_legacy_row` enforce.

### Phase 0 — inventory (`01_inventory.py`)

Connects to the cluster, lists databases, and for each reports: collections present,
`users` count, how many have a mobile, how many have an email, `teams` count,
`team_contest_enrollments` count, GridFS `avatars` file count, and the
earliest/latest `created_at`. Output: `inventory.json` + a printed table.

The service↔tenant mapping is already known from the Railway hosts (§1.1); what this
still has to establish is which **database name** each service points at, since
`MONGODB_DB_NAME` values are redacted to a read-only integration.

#### Results (run 2026-10-15)

Run read-only against the production cluster, with a supplementary read-only pass for
what the script does not yet report (dates, email counts, collections present; see
below). Counts only; no identifiers were exported. **These numbers supersede the
"five databases" assumption elsewhere in this document.**

**The live services use `Dcpl` and `rspl`** (confirmed; which service serves which is
under *Source mapping* below). They are also the only two databases with any
activity since May 2026.

| Database | Accounts | With mobile | First signup → last login | Notes |
|---|---|---|---|---|
| `rspl` | 75 | 75 | 2026-09-07 → 2026-10-14 | **live** |
| `Dcpl` | 397 | 145 | 2026-07-17 → 2026-09-23 | **live**; `tournaments` registry: `dcpl`, `tests`, `rspl`; 260 Google-linked |
| `epl` | 76 | 76 | 2026-04-09 → 2026-05-17 | |
| `jpl` | 72 | 72 | 2026-04-18 → 2026-05-04 | |
| `tyrant` | 178 | 172 | 2026-03-20 → 2026-04-24 | |
| `jmcl` | 116 | 116 | 2026-03-20 → 2026-04-21 | |
| `mjpl` | 118 | 114 | 2026-03-24 → 2026-04-20 | one later signup, 2026-08-20 |
| `cccl` | 154 | 152 | 2026-03-14 → 2026-04-14 | |
| `mwpl` | 123 | 116 | 2025-11-27 → 2026-03-20 | |
| `jypl` | 222 | 220 | 2026-02-24 → 2026-03-11 | |
| `world_tower` | 203 | 191 | 2025-10-05 → 2026-03-04 | |
| `lodha-park` | 92 | 86 | 2025-11-27 → 2026-02-01 | |
| `melangeindia11` | 149 | 148 | 2025-12-28 → 2026-01-12 | |
| `mtc-intervillage` | 137 | 135 | 2026-01-02 → 2026-01-11 | |
| `walle_fantasy` | 110 | 108 | 2025-10-05 → 2026-01-02 | the only `avatars` bucket (6 files) |
| **Total** | **2,222** | **1,926** | | 15 source databases |

What follows from it:

- **The unified database is `walle_arena`, not `walle_fantasy`.** `walle_fantasy`
  already exists as the oldest tournament's database and is one of the sources.
  `walle_arena` does not exist in the cluster yet. Phases 2–6 write to whatever
  `MONGODB_DB_NAME` is set to, so they run with `MONGODB_DB_NAME=walle_arena`.
  The root `.env` sets it to `Dcpl` for the app, so every writing script refuses a
  source database as its destination; run unchanged, Phase 2 would have written the
  merged accounts into live `Dcpl`.
- **No other database holds accounts.** `walle-register`, `walle-regi-owner` and
  `jmcl-register` contain only `players`, `payments` and `app_config`.
  `tournament_aggregator` contains `tournaments` (10 rows) and `carousel_slides`; its
  registry is a candidate seed for `walle_arena`'s, which Phase 2 needs to hold a row
  for every source, retired ones included. There is no database named for
  `walle-landing-backend` in this cluster.
- **Overlap**, using Phase 1's own normaliser: 1,446 distinct mobiles and 1,850
  distinct emails; 218 mobiles and 245 emails appear in two or more databases. A few
  hundred accounts will merge.
- **`MAX_ROWS_PER_KEY = 3` holds at fifteen sources.** It discards 6 mobiles (47
  accounts), none carrying one consistent name, which looks right. It also discards
  11 emails (55 accounts), of which 2 carry one consistent or blank name and may be
  genuine regulars of four or more tournaments. One of the two is joined anyway by a
  Google sign-in its accounts share (R29); the other stays split. Accounts split by a
  junk key are singletons and never reach the review queue, so Phase 1 lists every
  discarded key and its accounts in `junk_keys.csv` for a reviewer to link (R31).
  *Superseded by R42 (§13.12): counted across every source, the cap discarded the
  keys of regulars of four or more tournaments. It now counts per database, plus a cap
  on the given names one key is carried under; 4 keys are discarded, all staff and
  test accounts.*
- **No database holds the same mobile or email twice** (after normalisation), so R9
  does not trigger on today's data. It remains a defect for rows created later.
- **`Dcpl`'s registry includes a `tests` tournament.** It does not migrate (see
  *Source mapping*).
- **The script reports less than this section promises.** `01_inventory.py` does not
  report email counts, `created_at` ranges or collections present; the dates and
  collections above came from the supplementary pass.

#### Source mapping (decided 2026-10-15)

Ten sources match a row in `tournament_aggregator.tournaments` by name, dates and
hosting backend; the other five were named from their contest names. The aggregator's
`api_url` also shows which service serves the live databases: **second-layout
(`api-lpcl`) serves `Dcpl` and fifth-layout (`fifth-api`) serves `rspl`.** The service
hostnames were reused across seasons (`api-lpcl` hosted Lodha Park, then World Towers,
then DCPL, each with its own database).

| Source database | Tournament | When | Slug |
|---|---|---|---|
| `walle_fantasy` | TPL Season 11 | Oct–Nov 2025 | `tpl-s11` |
| `mwpl` | MWPL | Dec 2025 (a "Test" contest in Mar 2026) | `mwpl` |
| `lodha-park` | Lodha Park | Jan 2026 | `lpcl` |
| `melangeindia11` | Melange Team11 | Jan 2026 | `m11` |
| `mtc-intervillage` | MTC Marudha Cup | Jan 2026 | `mtc` |
| `world_tower` | World Towers Premier League | Nov 2025 (season 7), Feb–Mar 2026 (season 8) | `wtpl` |
| `jypl` | JYPL Season 9 | Feb–Mar 2026 | `jypl-s9` |
| `cccl` | Colaba Cricket Club | Mar–Apr 2026 | `cccl` |
| `mjpl` | Mewad Jain Premier League | Mar 2026 | `mjpl` |
| `tyrant` | Tyrant | Mar–Apr 2026 | `tyrant` |
| `jmcl` | JMCL | Mar–Apr 2026 | `jmcl` |
| `epl` | EPL | Apr–May 2026 | `epl` |
| `jpl` | JPL | Apr–May 2026 | `jpl` |
| `Dcpl` | DCPL | Aug–Sep 2026 (live) | `dcpl` |
| `rspl` | Reliance Surfaces Sanskriti Premier League | Sep 2026 (live) | `rspl` |

Decisions that go with it:

- **Numbered seasons carry the season in the slug** (`tpl-s11`, `jypl-s9`), so a later
  season of either league gets its own slug in the same pattern (`tpl-s12`).
- **`walle_arena`'s registry needs all fifteen rows before Phase 2 runs.**
  `seed_registry.py` writes them (decided 2026-10-17). It copies `dcpl` and `rspl` from
  `Dcpl.tournaments` under their own `_id`s; those rows carry no logo, colours or
  dates, and their names read "DPCL" and "Reliance Surface Sankriti", so the copies are
  named as their contests spell them. The other thirteen are archived rows with the
  names above, dated from the first real contest's start to the last one's end
  (contests named "test" left out). None gets a logo: no aggregator `image_url` is one;
  they are page links, and one stock photo.
- **`world_tower` holds two WTPL seasons**, 7 and 8. It stays one tournament, `wtpl`,
  dated across both (decided 2026-10-17): Phase 3 imports one database under one slug.
- **`Dcpl`'s archived `tests` tournament does not migrate.** The contests named "test"
  in `Dcpl` (2026-09-20 to 09-22) and "Test" in `jpl` (2026-05-05 to 05-06) **do**: they
  import with the rest of their database and appear under `dcpl` and `jpl`.
- **Copied accounts get a membership only where they played** (R23).

Every slug passes `TOURNAMENT_SLUG_PATTERN` and avoids `RESERVED_SUBDOMAINS`. Phase 2's
arguments:

```
--map Dcpl=dcpl --map rspl=rspl --map walle_fantasy=tpl-s11 --map mwpl=mwpl
--map lodha-park=lpcl --map melangeindia11=m11 --map mtc-intervillage=mtc
--map world_tower=wtpl --map jypl=jypl-s9 --map cccl=cccl --map mjpl=mjpl
--map tyrant=tyrant --map jmcl=jmcl --map epl=epl --map jpl=jpl
--copy-of world_tower=walle_fantasy
```

`--copy-of` declares that `world_tower` was seeded with a copy of `walle_fantasy`'s
users (R23). Phase 2 refuses to run while two sources share user ids and neither is
declared, because which one is the original decides who gets a membership. Phases 5
and 6 take the same `--map`; Phase 6 also takes `--copy-of`, `--platform-admins` and
`--links`. Phase 1 takes the same `--copy-of`, since it joins each copied account to
its original (R41); its `--db` names the same fifteen sources. `--links` is the
reviewed `merge_review.csv` (R44, *Review* below); Phases 1, 2 and 6 all take it.

### Phase 0b — configuration audit (`00_env_audit.py`)

Run **before** anything else, and again immediately before each flip. Railway returns
variable *names* to a read-only integration, which is all an audit needs.

- Pull the variable-name set for all five services; diff each against a `REQUIRED`
  and a `REQUIRED_AFTER_UNIFICATION` list (for whichever reset channel is in use,
  `TWOFACTOR_*` or `RESEND_*`).
- Emit the §1.1a presence matrix; exit non-zero on any missing required name.
- Also record each service's **repo, branch, replica count and builder**, and fail the
  run if a service's branch is not the one the flip was tested against. Two services
  are on feature branches today, and one is on a separate repository.

Belt and braces, because an audit only catches what someone remembered to run — the
service should refuse to start misconfigured rather than 400 every request:

```python
# apps/backend/config/startup_checks.py — called from the lifespan, before serving
async def assert_tenant_config_is_coherent() -> None:
    # Fail at boot, not on the first request. Without this, a service missing
    # TOURNAMENT_SLUG starts cleanly and then rejects every authenticated
    # request, which reads as an app bug rather than a misconfiguration.
    if settings.tournament_slug:
        if not await Tournament.find_one(Tournament.slug == settings.tournament_slug):
            raise RuntimeError(
                f"TOURNAMENT_SLUG={settings.tournament_slug!r} is not in the registry"
            )
    elif not settings.allow_multi_tenant_headers:
        raise RuntimeError("TOURNAMENT_SLUG is required on a single-tenant deployment")

    if not settings.twofactor_api_key and not settings.resend_api_key:
        raise RuntimeError("No password-reset channel configured (2Factor or Resend)")
```

That last check is the one that would have caught the §1.1a gap long ago.

### Phase 1 — identity graph (`02_build_identity_graph.py`)

1. Load every user row from every source database named with `--db`. There is no
   default: discovering every database in the cluster would also read `walle_arena`
   and the register and aggregator databases (G2).
2. Normalize: mobile → ASCII digits, reduced to ten local digits only for an Indian
   number (a leading `91` on twelve digits or `0` on eleven); any other number is kept
   whole so it can only match itself (R4). Email → trimmed lowercase, with dots and
   `+tag` folded **for Gmail only** (R2). Discard obviously junk keys before they join
   anything: empty strings, mobiles of fewer than 10 digits, placeholder emails
   (`test@test.com`, `a@a.com`, …), any mobile or email held by more than
   `MAX_ROWS_PER_KEY = 3` rows **in one database**, and any carried under more than
   `MAX_PEOPLE_PER_KEY = 2` given names across them — **a junk key shared by 50
   accounts would collapse 50 people into one.** Per database, because one row in each
   of four tournaments is one regular, not four strangers (R42).
3. Union-find over five edge types: shared mobile, shared email, a shared Google or
   Apple sign-in (R29), and a copy (R41). A sign-in id is proof of one login, so it has
   no `MAX_ROWS_PER_KEY` cap: someone who signed in with Google in five tournaments is
   one person, not a junk key. A copy is a row of a `--copy-of` database and the row
   with the same `_id` in its original: one account, copied. Like any edge it still
   flags a pair whose names differ.
4. Emit `merge_plan.json`, `merge_review.csv` and `junk_keys.csv`.

Flag a component for review when any of these hold:

| Flag | Meaning |
|---|---|
| `chained` | some pair in the component shares nothing directly — it is only connected through an intermediate row. **Size alone is not chaining** (decided 2026-10-17, R24): three accounts on one phone are one person. |
| `name_mismatch` | the given names differ; or the same given name with another family name, joined by one channel only (R43) |
| `shared_mobile_diff_names` | same number, different given names (family sharing a phone is common in this market) |
| `mobile_only_name_unconfirmed` | a mobile edge with no other channel, whose names are not an exact match after normalisation — similar, or missing on one side (R3) |
| `multi_google` | two distinct `google_id`s in one component |
| `possible_recycled_mobile` | a mobile edge with no other channel whose two rows have disjoint activity windows separated by more than `RECYCLE_GAP_DAYS`, **whatever the names** — see below |

A junk key is not a flag: it is discarded, links nobody, and no account keeps it (R25).

**Names** are compared by given name (R43). One name that is the other with words left
out, initialled or reordered — a father's name added, "P S" for Priya Sharma — is the
same name; titles and all-digit words do not count. The same given name with another
family name ("Amit Kothari", "Amit Jain": a community surname used for a family one is
common here) merges only when two channels agree. Different given names are different
people, however alike the strings: a similarity ratio called siblings one person and
one person with a middle name two.

#### Recycled mobile numbers

Indian mobile numbers are recycled: a prepaid number goes dormant, is disconnected,
sits in quarantine, and is reallocated to someone else. Two rows sharing a number are
therefore not necessarily the same person — and because `full_name` is optional, such
a pair can slip past `name_mismatch` with nothing to compare.

Define an activity window per legacy row:

```python
start = row.created_at
end   = max(v for v in (row.last_login, row.updated_at, row.created_at) if v)
```

**Elapsed time alone cannot decide this, and that is the trap.** Fantasy cricket is
seasonal: the same real person's two tournaments are routinely 10–14 months apart,
which looks identical to a recycled number. So the rule is **corroboration**, with the
gap as a tie-breaker rather than the test:

| Edge | Decision |
|---|---|
| Mobile edge **and** another channel (email or sign-in) between the same pair | Auto-merge — two independent identifiers agreeing is strong evidence, whatever the gap. |
| Mobile edge alone, names identical after normalisation, windows within `RECYCLE_GAP_DAYS` | Auto-merge. |
| Mobile edge alone, names similar but not identical, or missing on either side | **`mobile_only_name_unconfirmed` → review.** A fuzzy match is too easy for two people with a common name to pass (decided 2026-10-17, R3). |
| **Mobile edge alone, windows disjoint by more than `RECYCLE_GAP_DAYS`** | **`possible_recycled_mobile` → review, even with identical names.** |
| Mobile edge alone, clearly different names | `shared_mobile_diff_names` → review. |

On the live data (2026-10-17) 51 pairs share only a mobile: 38 with identical names, 4
with similar ones, 9 with different ones; none is more than a year apart.

Do **not** hardcode `RECYCLE_GAP_DAYS` before seeing the data. Phase 1 emits a
**histogram of inter-row gaps across every shared-mobile pair** alongside the merge
plan; pick the cut from the real distribution. As a starting point, India's
disconnection-plus-quarantine period makes reallocation physically possible from
roughly 180 days, but a threshold nearer 12 months will likely separate the
seasonal-return population from the recycled one far better. The histogram will say.

The same failure mode exists for email but is much rarer — a corporate address
reassigned to a new employee is the realistic case. It is covered by `name_mismatch`
and the junk-key rules rather than a rule of its own.

Flagged components are held back — the migration merges the clean ones and writes the
flagged ones as **separate accounts** with `merge_state="needs_review"`, so nobody is
wrongly merged by default.

#### Review (`--links`)

`merge_review.csv` has a `link` column. The reviewer gives the rows of one group that
are one person the same link; a row left blank stays on its own. The reviewed file is
passed as `--links` to Phases 1, 2 and 6, and each linked set becomes one account with
`merge_state="reviewed"` (R44). Links are compared within a group only. A key shared
across the resulting accounts goes to the one holding the most recently active row,
as for any split (R8). Phases 1 and 2 stop on a link to a row no source holds.

**Links across groups.** A link starting with `=` reaches across groups: every row
given it, in any group, is one person (`join_across_groups`). This is for a
login whose rows share no key that is not junk. The shared `walleadmin` staff login
has a different phone in each tournament, and an address withheld as too widely
shared, so Phase 1 leaves it as five accounts in five groups. The groups a
cross-group link spans are planned as one, flagged `joined`. Inside them, an
ordinary link still means one person only within the group it was written in, and
a clean group, already one person by its keys, goes whole to the cross-group link
any of its rows carries. A clean group whose rows carry two different cross-group
links is refused.

Pass it from the **first** Phase 2 run: a run never merges accounts an earlier run
wrote (it reports a conflict), so links added later do nothing. The file names
people; keep it with the migration's outputs, not in this repository.

### Phase 2 — write the unified collections (`03_apply_merges.py`)

Rows are ranked **live first, then most recently active** — a deleted row never wins,
because a soft delete stamps `updated_at` and would otherwise win by recency (R1). For
each clean component, create one `User`:

- `emails` = the component's addresses **as typed, lowercased** — the form login looks
  up. The normalised form decides who is who but is not stored: it folds Gmail's dots,
  and someone typing `rahul.patel@gmail.com` must find their account (R26).
- `mobiles` = the normalised numbers. `google_ids` / `apple_ids` = from **live** rows
  only. Primary of each = the first.
- `hashed_password` = the first live row's hash; every other live row's hash appended
  to `legacy_hashes`. **A deleted row contributes no credential** — no password, no
  Google or Apple sign-in — and an account deleted everywhere carries none (R1).
- `username` = the display name from the first row.
- `full_name`, `avatar_*` = from the first row that has them.
- `created_at` = earliest; `last_login` = latest.
- `is_active` = true unless **every** member row was inactive/deleted.
- `is_verified` = true if any member row was.
- `is_platform_admin` = only if a row's normalised email or mobile is on the
  `--platform-admins` list, which is normalised the same way (R27).
- `legacy_accounts` = full provenance for all members.
- Junk keys go to nobody (R25).

A **flagged** component becomes one account per row, sharing a `merge_group_id`. Any key
two of its rows share goes to the **most recently active live row**; the others lose it
(decided 2026-10-17, R8). An account left with no email gets
`<legacy_user_id>@unclaimed.wallearena.com`, since `email` is required. `merge_review`
records every flagged group, its rows, and who kept which key.

Then one `TournamentMembership` **per tournament** — not per row, since two rows from
one database can merge (R9) — with `display_name` from that tournament's latest row and
`role="admin"` if any of its rows had `is_admin`. A row copied from another database
(`--copy-of`) earns one only if that person built a team there or signed in there after
the original (R23). One `user_id_map` entry per source row either way, with
`earns_membership` for Phase 5.

**Re-runnable**, because Phase 6 runs it again (R5–R7). Each account resolves to the
user id any of its rows was already mapped to, so a signup joining an imported person is
attached to them. The id map is written first, then the user, avatar plan and
memberships — every write an upsert keyed on what it describes — and each run rewrites
the account from its sources, so a reset or a deletion during the backfill arrives.
Rows that now group differently from what an earlier run wrote are **reported as
conflicts and left alone**; merging or splitting written accounts is a review decision.

### Phase 3 — copy, tag and rewrite the game data (`04_import_tenant_data.py --db <name> --slug <slug>`)

This is the phase that grew when the data model collapsed to one database. It is no
longer an in-place field rewrite: each source database's game collections are **copied**
into the unified database, **tagged** with their `tournament_id`, and their `user_id`
values **rewritten** through `user_id_map` — in one pass per collection.

```python
async def import_collection(src_db, name, tournament_id, user_field=None):
    async for doc in src_db[name].find():
        doc["tournament_id"] = tournament_id
        if user_field and doc.get(user_field) is not None:
            doc["legacy_user_id"] = doc[user_field]        # kept for rollback
            doc[user_field] = user_id_map[(src_db.name, doc[user_field])]
        await dest[name].replace_one({"_id": doc["_id"]}, doc, upsert=True)
        await ledger.record(name, doc["_id"], src_db.name)  # see below
    await remove_copies_whose_source_is_gone(name, src_db.name)
```

| Collection | User field to rewrite |
|---|---|
| `teams` | `user_id` |
| `team_contest_enrollments` | `user_id` |
| `import_logs` | `user_id` *(string)* |
| `admin_action_logs` | `admin_id` *(string)* |
| `contests`, `players`, `slots`, `player_contest_points`, `sponsors`, `carousel_images` | — tag only |
| `global_settings` | — becomes that tournament's settings row, `_id` `tournament:<id>` (R12) |

**Preserve `_id` on every copy.** Documents reference each other by ObjectId —
`teams.contest_id`, `enrollments.team_id` / `contest_id`,
`player_contest_points.player_id`. Keeping the original `_id` means every one of those
references stays valid with no rewriting at all. Regenerating ids would mean remapping
each reference by hand, for no benefit.

**`import_ledger` records which source put each document there** (R10, R11). Because
`_id` is preserved, after one run every copied document exists in both places; the
ledger is what tells "copied from here last time" apart from a real clash, so a re-run
updates its own copies and refuses only another source's. It also finds copies whose
source document has since been deleted, and removes them — including from collections
since emptied or dropped. A ledger rather than a field on the document, because the app
drops fields its models do not declare the first time it saves one.

Checked on the live data (2026-10-17): across all fifteen sources, the only `_id` any
two share is `global_settings`' `"global"`, which R12 renames.

**Files come across too** (R13): the `contest_logos`, `sponsor_logos` and
`carousel_images` GridFS buckets, copied as the documents GridFS stores under their own
`_id` and metadata — so nothing that refers to them changes, and a re-run finds them
present.

**`team_contest_enrollments` still needs the merge check.** Its
`uniq_active_user_per_contest` partial unique index means that if two merged accounts
both had an active team in the *same* contest, rewriting both to one `user_id` violates
it. Detect these up-front, report them, and apply a policy: keep the most recently
enrolled team active, set the others to `REMOVED` with `removed_at` and a note. This
list belongs in the migration report — it is the one place where merging actually takes
something away from a user.

**Contest code collisions are now possible too.** Two tournaments may each have a
`FINAL`. Under the per-tournament unique index (§3.5) that is fine and needs no
intervention. There is no global unique index to drop: the one `Contest.code` declared
was never built (R14, R22).

### Phase 4 — move avatars (`05_copy_avatars.py`)

Copy each avatar Phase 2 planned (one per account, the winning one) from its source's
`avatars` bucket into the unified database's, **under its own `_id` and with its own
metadata**. The id Phase 2 wrote on the user is therefore already right, the real
content type survives (R15), and a re-run skips files already copied (R16). An avatar
missing from its source is cleared from the user rather than left pointing nowhere.

### Phase 5 — verify (`06_verify.py`)

`06_verify.py --map …`, with Phase 2's `--map`. Hard assertions, all must pass before
any flip. Some look for something wrong among what was written; the rest reconcile
against the sources, because a phase that stopped early leaves nothing wrong behind,
only something missing (R20).

What should exist, does:

- Every source's user rows map to `user_id_map` exactly — counted per source.
- Every mapped row with `earns_membership` has a membership in its tournament.
- Every tenant collection reconciles with each source: as many documents in the
  source, recorded in `import_ledger`, and present.
- Every tournament whose source had settings has its settings row.
- Every file a document points at (`avatar_file_id`, contest and sponsor
  `logo_file_id`, `image_file_id`, `default_contest_logo_file_id`) exists in its bucket.

Nothing written is wrong:

- No `emails`, `mobiles`, `google_ids` or `apple_ids` value on two accounts.
- No `tournament_memberships` duplicate for a (user, tournament).
- No `teams.user_id` or `team_contest_enrollments.user_id` fails to resolve.
- Every tenant document carries a `tournament_id`.
- Every **live** account has a usable credential (`hashed_password`, a `legacy_hashes`
  entry, or a `google_ids` or `apple_ids` entry). An account deleted everywhere carries
  none by design (R1) and is not counted.

By hand, after the script passes: pick N users per source and confirm their old
password still signs in.

### Phase 6 — cut over

Under one database this is no longer "flip five services one at a time" — there is one
backend, and the two live tournaments move to it together.

1. **Stand up the unified backend** on `api.wallearena.com`, pointed at the unified
   database, running the new code. Nothing is pointed at it yet. Its variables:
   `TENANCY=shared`, `MONGODB_DB_NAME=walle_arena`, the shared `SECRET_KEY` /
   `JWT_*`, `TWOFACTOR_*` (from `lpcl`), `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
   (with `send.wallearena.com` verified in Resend, §5.4), `GOOGLE_CLIENT_ID`,
   `APPLE_BUNDLE_ID`, and `CORS_ORIGINS` covering `https://*.wallearena.com`. The rate
   limiter needs nothing: it starts in observe mode. Check
   `GET /api/auth/forgot-password/channels` answers `{"sms": true, "email": true}`.
   Wildcard DNS (`*.wallearena.com`) points at the website.
2. **Full backfill** with the two live tournaments still serving from their own
   services: Phases 1–5 for all five source databases. Nothing in the source databases
   is modified.
3. **Verify** (Phase 5) and review the merge report.
4. **Read-only window on lpcl and fifth.** This is the only moment users are affected.
5. **Delta re-sync** (`07_resync_delta.py` with the backfill's `--map`, `--copy-of`,
   `--platform-admins` and `--links`) to pick up everything written during the backfill. It re-runs
   Phases 2, 3 and 4 in full rather than detecting changes (R17, R18) — every one is
   re-runnable — then **run Phase 5 again**. Then fill the membership numbers, which
   the migration writes as zeros: `scripts/refresh_membership_stats.py --all`, once,
   so past tournaments' profiles show their history.
6. **Repoint the two frontends** — `NEXT_PUBLIC_API_URL` to the unified backend — and
   redeploy. On the current Vercel plan that is a CLI deploy (`vercel deploy --prod`);
   GitHub deploys fail for the private org repo.
6b. **Ship the mobile app's update** — walle-app#6, which reads the tournament list
   from `/api/tournaments` and sends `X-Tournament-Slug` — as an over-the-air update on
   the `production` channel. Not before this step: today's backends have no tournament
   list, so the app would show none. Two limits, both accepted (§11, Q11–Q12, decided
   2026-10-22): a 1.0.3 install applies the update on the launch *after* it downloads,
   so its first launch after cutover still talks to the old host (read-only until
   step 8 archives it, unreachable after), and the launch after that runs the update;
   and 1.0.2 installs cannot take the update, so those players install 1.0.3 from the
   store. Before choosing the cutover date, check that the App Store (and Google Play,
   if the app is listed there) serves 1.0.3; otherwise a 1.0.2 player has nothing to
   update to.
7. **Smoke test** on both: login by mobile, by email, Google, `/api/users/me`,
   `/api/users/me/tournaments`, create a team, enrol in a contest, admin on a
   tournament's subdomain, and the Tournaments tab as a platform admin. Reset a
   password by SMS and by email, and change an email from the profile. In the app:
   the tournament list, sign-in, and switching tournaments without signing out.
8. **Watch** for an hour. Then archive `first-layout`, `second-layout`, `third-layout`,
   `fourth-layout-mtc`, `fifth-layout`. Retire `walle-landing` (the app's old source
   of per-tournament API URLs) once EAS shows most app users on the update.
9. **Schedule** `scripts/refresh_membership_stats.py --all-live` on the unified
   service (a Railway cron), so live tournaments' profile numbers keep up.
10. **Enforce the rate limits** after one contest deadline of observe-mode logs on the
    unified service (`docs/RATE_LIMITING_SPEC.md` §8): first
    `RATE_LIMIT_ENFORCE_RULES=forgot_password_request,email_change_request`, then
    `RATE_LIMIT_ENFORCE=true`.

> **Do this between seasons.** The read-only window is short, but a live contest is the
> worst time to be moving teams and enrolments between databases — a user mid-squad-edit
> during the cutover is the scenario with the least pleasant failure mode. Off-season,
> with no live contest, most of the risk in this phase simply is not present.

### Rollback

At every stage, rollback is "put the old env var back and redeploy":

- The unified collections are **additive** — nothing in a legacy database is deleted.
- Tenant documents keep `legacy_user_id`, so Phase 3 is reversible by
  `04_rewrite_tenant_refs.py --revert`.
- Legacy `users` collections stay in place (renamed to `users_pre_unification` only
  after a full retention period you choose — see §11).

---

## 8. Files touched

**Backend — new**

```
app/models/tournament_membership.py
app/models/identity_merge_audit.py
app/utils/tenant.py                     get_tenant_slug
app/services/auth/identity.py           resolve_login_identity, verify_user_password
app/services/membership.py              record_signup, mark_played, refresh_stats
app/routes/me_tournaments.py            GET /api/users/me/tournaments
app/services/auth/email_otp.py          Resend transport, OTP generate/hash/verify
app/services/auth/otp_session.py        channel-agnostic session start + verify
app/routes/me_email.py                  POST /api/users/me/email/{request,verify}
app/utils/rate_limit.py                 slowapi limiter, MongoDB-backed
app/templates/otp_email.py              the reset-code email body
scripts/unified_auth/00…07_*.py         env audit + migration scripts
scripts/refresh_membership_stats.py     nightly reconcile
```

**Backend — modified**

```
config/settings.py          LEGACY_USERNAME_SUB_UNTIL, RESEND_* ;
                            delete unused EMAIL_SERVICE_KEY
config/database.py          register the new models; no second client needed
app/models/user.py          identity arrays, legacy_hashes, is_platform_admin, index changes
app/models/{contest,team,player,slot,sponsor,carousel}.py  + tournament_id (§3.5)
app/models/settings.py      GlobalSettings per tournament, not a singleton (§3.5)
app/utils/tenant.py         scoped() — the one place the tenant filter lives
app/models/password_reset.py  purpose/channel/destination/otp_hash (§5.2)
app/routes/auth.py          login resolution, password chain, sub=user.id, membership on register
app/routes/users.py         is_platform_admin in response
app/utils/dependencies.py   id-based sub, get_platform_admin, get_tournament_admin
app/services/auth/google.py google_ids/emails arrays
app/services/auth/password_reset.py   two channels, indexed lookups, verified-only
                                      reset, clears legacy_hashes (§5.5)
app/schemas/auth.py         channel on forgot-password (ResetPasswordByMobile
                             already dropped — shipped, §5.1)
main.py                     mount the limiter (§5.6)
app/routes/admin/*.py       guard swap (platform vs tournament)
app/common/guards/auth_guard.py       update or delete
tests/conftest.py           new models in DOCUMENT_MODELS, index exclusions
```

**Frontend — modified/new**

```
src/lib/api/tournaments.ts          new: getMyTournaments()
src/lib/api/client.ts               send X-Tournament-Slug
src/app/dashboard/page.tsx          Tournaments section (played / also registered)
src/components/auth/LoginForm.tsx   "Mobile number or email"
src/components/auth/ForgotPasswordModal.tsx  CREATE new: request → verify → set
                                    password, with an SMS/email channel choice
                                    (§5.1 — the old file was deleted as dead code)
src/lib/api/auth.ts                 add the three forgot-password calls that were
                                    never wired up (resetPasswordByMobile already
                                    dropped — shipped, §5.1)
src/app/dashboard/page.tsx          change-email flow (§5.7)
src/utils/errors.ts                 ambiguous_identifier branch
src/common/consts/index.ts          header name constant
```

**Docs / config**

```
.env.example, docs/ENVIRONMENT_SETUP.md, packages/env-config (backend schema)
docs/TOURNAMENT_SUBDOMAINS.md — the "data isolation not implemented" note gets
  amended: auth IS now shared; game data is still per-database.
CLAUDE.md — new intentional duplication (two Beanie model lists) and the auth DB
```

---

## 9. Tests

`tests/conftest.py` spins one mongomock database and keeps its own `DOCUMENT_MODELS`
list; the new models go there alongside the app's list.

Known mongomock gaps to work around (the file already documents this pattern for
`uniq_mobile`): mongomock ignores `partialFilterExpression`, so `uniq_mobiles`,
`uniq_google_ids` and `uniq_legacy_row` must be added to `_UNEMULATED_INDEXES` and
their real behaviour covered by targeted tests that assert the route's
`DuplicateKeyError` handling directly.

New test files:

| File | Covers |
|---|---|
| `test_identity_resolution.py` | login by mobile / email / username, ambiguity 409 |
| `test_password_legacy_hashes.py` | legacy hash accepted, then promoted and cleared |
| `test_jwt_subject_transition.py` | id sub works; username sub works while in window; ambiguous username sub → 401 |
| `test_membership_lifecycle.py` | register → `registered`; team created → `played`; counters |
| `test_me_tournaments.py` | played/registered split, ordering, empty state |
| `test_admin_scoping.py` | tournament admin cannot touch another tournament; platform admin can |
| `test_migration_identity_graph.py` | union-find on fixtures: clean merge, chained flag, junk-key rejection |
| `test_migration_enrollment_collision.py` | two merged accounts in one contest → one active, one removed |
| `test_tenant_scoping.py` | every tenant model's routes go through `scoped()`; a query without `tournament_id` cannot reach another tournament's rows |
| `test_contest_code_per_tournament.py` | two tournaments may both have contest `FINAL`; the same code twice in one tournament is rejected |
| `test_migration_id_preservation.py` | `_id` preserved on import, so `teams.contest_id` and enrolment references still resolve |
| `test_password_reset_channels.py` | SMS and email paths both issue a reset token; wrong channel for a destination fails |
| `test_email_otp.py` | code is HMAC-hashed not stored raw; `compare_digest`; expiry; attempts exhausted; Resend failure surfaces as the generic message |
| `test_password_reset_hardening.py` | `pending` session rejected at reset; reset revokes refresh tokens **and** clears `legacy_hashes` |
| `test_email_change.py` | collision → 409; code goes to the NEW address; old address dropped from `emails[]`; `is_verified` set |
| `test_rate_limits.py` | request/verify/login limits fire and are keyed per destination and per IP |

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Chained merges collapse two real people | **High** | Flagged components are *not* merged; they migrate as separate accounts unless a reviewer links them (`--links`, R44). |
| Shared family mobile numbers | **High** | Same as above — `shared_mobile_diff_names` is a flag, not an auto-merge. |
| Username login stops working | Medium | Transitional single-match fallback + 409 with a clear message + login form copy change + release comms. |
| JWT `sub` change invalidates live sessions | Medium | Legacy-username branch kept for cutover + 8 days, covering both token TTLs. |
| Enrolment unique-index collision on rewrite | Medium | Detected in Phase 3, reported, deterministic keep-latest policy. |
| Avatars break | Low | Phase 4 copies GridFS files; verification counts referenced vs copied. |
| Legacy services run drifted code | **High / unknown** | Must be confirmed per service before flipping (§11, Q2). A service that is not on this codebase cannot simply take the new env vars. |
| Extra valid passwords per account during the window | Low | Promote-on-use + 180-day sweep; stated in release notes. |
| Profile page fans out across databases | Low | Stats are denormalized on the membership; cross-DB reads only in the nightly job. |
| App and test model lists drift | Low | `tests/conftest.py` keeps its own list. Same class of bug `CLAUDE.md` already warns about. |
| ~~`/reset-password-mobile` stays open until the fix ships~~ | *Closed* | Endpoint, schema, orphaned modal and dead API wrapper deleted (§5.1, C2b) — it depended on nothing, so it shipped ahead of the rest of this migration. |
| Unverified email as a merge key | Medium *(accepted)* | Decision #11 keeps auto-merge on any email match. Residual path: someone who typed a stranger's address at signup gets merged into that account and can sign in with their own password (§4.3 keeps both hashes). If this shows up in the Phase 1 report, the one-line mitigation is to add an `email_only_edge` flag so those components go to review instead of merging. |
| Resend domain not warmed / mail lands in spam | Medium | Send from a verified subdomain, code in the subject line, DMARC at `p=none` first. Mobile SMS stays available as the fallback channel, so email deliverability is never the only route to recovery. |
| Rate limiter state is per-replica | Medium | In-memory `slowapi` counters do not span Railway replicas. Back it with the existing `REDIS_URL`, or a Mongo TTL counter. |
| Resend quota burned by an attacker | Low | The §5.6 per-destination and per-IP limits are the control; without them the request endpoint is an open mail relay to arbitrary addresses. |
| **`fifth` has no working password reset** | **High** | `TWOFACTOR_*` is set on `lpcl` only (§1.1a); on `fifth` it fails silently behind the generic success message. A separate, pre-existing outage that `/reset-password-mobile`'s deletion (C2b, shipped) neither caused nor worsened — closing it is stage C2a. |
| Recycled mobile numbers merge two strangers | **High** | `possible_recycled_mobile`: an uncorroborated mobile edge across disjoint activity windows goes to review. Threshold chosen from the Phase 1 gap histogram, not guessed (§7, Phase 1). |
| ~~Feature branches drift further~~ | *Closed* | Both live services run `main` (§1.1). The feature branches and the forked repo belong to retired tournaments and are archived, not migrated. |
| A route forgets its `tournament_id` filter and leaks across tournaments | **High** | One choke point (`scoped()`, §3.5) plus a test that walks every tenant model's routes. This is the cost of logical isolation and the reason it is bought in one place rather than trusted to twelve route files. |
| Game data import is a bigger migration than a field rewrite | Medium | Phase 3 now copies collections between databases. `_id` is preserved so inter-document references need no remapping, and a pre-flight checks for `_id` collisions. Run it between seasons. |
| A service is flipped with incomplete config | Medium | `00_env_audit.py` before each flip, plus a boot-time assertion so a misconfigured service refuses to start rather than 400-ing every request (§7, Phase 0b). |
| In-process state is wrong on multi-replica services | Medium | `first-layout` and `third-layout` run 2 replicas. Rate limits and any OTP cache must be Redis- or Mongo-backed, never in-process (§5.6). |

---

## 11. Open questions for you

These block specific phases; everything else can be built without them.

1. ~~Which databases are the sources?~~ **Answered** by Phase 0 (§7): fifteen source
   databases; the live services use `Dcpl` and `rspl`; the unified database is
   `walle_arena`.
1b. ~~Which slug does each source database get?~~ **Decided** (§7, *Source mapping*):
   all fifteen slugs, the registry rows `walle_arena` needs, and what happens to test
   data.
2. ~~Do all services run this repo's code?~~ **Closed.** Both live services run `main`
   from `Eigensu/first-layout`. The feature branches and the forked repo belong to
   retired tournaments and are archived rather than migrated.
2b. ~~Confirm the data model~~ **Decided:** one database, `tournament_id` on every
   tenant-scoped document (§2.5, §3.5).
3. ~~Who should be platform admins?~~ **Settled 2026-10-19**, reconfirmed 2026-10-21:
   two accounts, kept outside the repo with the reviewed links (§13.10). Everyone else
   with legacy `is_admin` becomes an admin of their own tournament only.
4. ~~Do `walle-register` and `walle-landing-backend` hold user accounts?~~ **Answered**
   by Phase 0: no. The register databases hold `players`, `payments` and `app_config`
   only, and no database in the cluster is named for `walle-landing-backend`.
5. ~~Roughly how many users per database?~~ **Answered** by Phase 0: 2,222 accounts
   across fifteen databases, the largest 397 (`Dcpl`); see the table in §7.
6. **How long do the legacy `users` collections stay?** Suggested: keep them untouched
   for 90 days post-cutover, then rename to `users_pre_unification`, then drop after a
   full backup.
7. **Should `username` stay visible in the UI at all**, or should the profile show
   `full_name` with the per-tournament display name only inside each tournament card?
8. **Which sending domain for Resend, and who holds the DNS?** `send.wallearena.com`
   is the recommendation. The records are SPF, DKIM (`resend._domainkey`) and an MX
   for the return path — they go wherever the nameservers point after the wildcard
   certificate setup. *Blocks the email channel going live, nothing else.*
9. **Is there an existing Resend account/API key**, or is this a new signup? The free
   tier's daily cap is worth checking against your peak reset volume before launch.
   *Answered 2026-10-20: a new account, still to be set up.* The code is built (C3)
   and stays off until `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set.
10. ~~Do the five services share one Resend key and sending domain?~~ **Built as the
   default:** one key and one sending address, with the tournament's name in each
   message (§5.5).
11. ~~The app's first launch after cutover.~~ **Decided 2026-10-22: accept one failed
   session per player.** A 1.0.3 install downloads the update on one launch and applies
   it on the next, so that first launch still talks to `api-lpcl` / `fifth-api`. Both
   old app versions take those hosts from walle-landing and send no tournament, so a
   host→tournament fallback on the unified backend would have kept them working; it was
   considered and not chosen. The old hosts are not kept up past Phase 6, step 8.
12. ~~App version 1.0.2.~~ **Decided 2026-10-22: require 1.0.3 from the store.** 1.0.2
   cannot take the update, because 1.0.3 added Google and Apple sign-in, which the
   update's code calls. No separate 1.0.2 update is built. This depends on the stores
   serving 1.0.3 before cutover (Phase 6, step 6b).

---

## 12. Sequencing

| Stage | Work | Depends on |
|---|---|---|
| A0 | `00_env_audit.py` + boot-time config assertion (§7, Phase 0b) | — |
| A | Settings, register new models, `scoped()` helper, test fixtures | — |
| A2 | `tournament_id` on the ten tenant models, index rebuild, per-tournament `Contest.code` and `GlobalSettings` (§3.5) — **done 2026-10-19**, with every route scoped and `TENANCY` (§2.3) | A |
| B | `User` v2 model, membership model, identity/password services | A |
| C | Auth route changes (`sub`, login resolution, register, Google) + tests | B |
| C2a | **Give `fifth` a working reset channel** — 2Factor credentials or the Resend channel — and verify end to end (§1.1a). **Code done 2026-10-21 with C3**: `fifth` no longer claims to send a code it cannot, and email reset works there once `RESEND_*` is set on it | — |
| C2b | ~~Close the reset gate~~ **shipped** — endpoint, schema, orphaned modal and dead API wrapper deleted; `client.ts` structured-error fix (§4.2) | — |
| C2c | Rate limits on the auth routes — `docs/RATE_LIMITING_SPEC.md` — **built 2026-10-20, in observe mode**: counts and logs, refuses nothing until `RATE_LIMIT_ENFORCE=true` (that spec's §8). The mobile app shows a 429 as a generic error and needs the message mapped before enforcing | — *(MongoDB-backed; no longer blocked on Redis)* |
| C3 | Email OTP channel: Resend service, dual-channel session, change-email endpoints (§5.2–5.7) — **built 2026-10-21**, off until `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set (§5.5, §5.7 *Built*) | Q8 *(to go live, not to build)* |
| D | Admin guard split + route mapping + tests — **done 2026-10-19**, with admin on each tournament's subdomain (§4.7) | B |
| E | `GET /api/users/me/tournaments`, membership write paths, reconcile job — **done 2026-10-19** (§6.1–6.2a; the admin support endpoint is deferred) | B, R21 (§13.8, fixed in #45) |
| F | Frontend: profile section, login copy, `client.ts` error fix (§4.2), slug header, change-email UI — **done**: all but the change-email UI on 2026-10-19 (§6.3); the change-email card and the email option on the reset pages on 2026-10-21 with C3 (§5.7 *Built*) | E, C3 |
| G | Migration scripts 00–07 + their tests, including the game-data import (§7, Phase 3) | B, A2 |
| H | Dry run against a **restored copy** of the cluster, review the merge report | G, Q1–Q5, **§13.10** |
| I | Cut over — stand up the one backend, backfill, repoint both frontends, archive the five services (§7, Phase 6) | C, C2b, C3, D, E, F, H |
| J | Remove the legacy-username branch; sweep `legacy_hashes`; archive old collections | I + 8 days / 180 days |

Stages A–G are ordinary development and can proceed now. **H must run against a
restored snapshot, never the live cluster** — the merge report is the artefact you
review before anything irreversible happens.

**H ran on 2026-10-17** against a local copy, after #45 and #46 merged. It found four
more items, all fixed (§13.11). Reviewing its output on 2026-10-18 found three more
(R42–R44, §13.12), also fixed; a third pass with the review applied passes Phase 5 and
leaves 2 of 1,962 password accounts unreachable, both staff logins. The platform-admin
list and the reviewed links, the two things it left open, were settled on 2026-10-19
(§13.10); the owner confirmed the list again on 2026-10-21. The two app decisions
(Q11–Q12) were made on 2026-10-22. What is left before I: setting up Resend (Q8–Q9),
checking the stores serve app 1.0.3 (Phase 6, step 6b), the unified Railway service
and wildcard DNS (Phase 6, step 1), and re-running Phase 1 with the links on the
cutover snapshot.

**Schedule I between seasons.** The read-only window is short, but a live contest is
the worst time to move teams and enrolments between databases. Off-season, most of the
risk in that stage simply is not present.

**C2b has shipped.** It turned out to depend on nothing: the endpoint was unreachable
from the product, so removing it stranded nobody.

**C2a is now the one to pull forward.** `fifth` cannot reset a password today and fails
silently while doing it (§1.1a) — a live user-facing outage nobody has reported because
the UI says it worked. It needs either 2Factor credentials on that service or the
Resend channel from §5.4.

Note the dependency change: **C3 no longer depends on C2.** If Resend lands before
2Factor credentials are sorted, the email channel *is* C2a for `fifth` — and it is
what every future tournament inherits for free under the one-backend end state.

---

## 13. Before the dry run: review findings

Stage H does not start until every box below is ticked or deliberately waived. Each
item was raised in code review on #40/#41, or turned up while checking those reviews,
and **each was checked against the code** rather than taken from the reviewer. The
review threads on #41 were later marked resolved on GitHub without any code change, so
this section is the only record of them.

**Status (2026-10-17): every item below is fixed** — in #45 (app) or #46 (scripts) — or, for G1, satisfied. Each says where, and
records the decisions taken on the way. Line numbers in the item text are as originally
written: paths under `apps/backend/scripts/unified_auth/` at `8ee1a8d`, the tip of #41.
Fixing them turned up more, R24–R37 (§13.9), all fixed too. **What is left before
the dry run** is §13.10.

### 13.1 Ordering rules

- [x] **G1 — No backend older than #42 may serve a database that Phase 2 has written to.**
  Phase 2 keeps every source username, and usernames stop being unique with #39. Until
  #42, tokens carry `sub = username` (`app/routes/auth.py`) and `get_current_user`
  resolves it with `User.find_one(User.username == ...)` (`app/utils/dependencies.py:39`).
  Two migrated people who share a username can then each present their own valid token
  and be authenticated as whichever document Mongo returns first.
  The dry run itself is safe before #42 lands: `walle_arena` does not exist yet, and the
  live services read `Dcpl` and `rspl`. **Booting today's `main` against the dry-run
  database to click around is not safe.** Smoke-test only with a build that includes #42.
  *Satisfied: #42 merged on 2026-10-17, so `main` resolves tokens by user id.*
- [x] **G2 — Phase 1 always gets explicit sources.** `02_build_identity_graph.py:133`
  falls back to `list_candidate_databases()` (`loader.py:10`), which returns every
  non-system database in the cluster, including `walle_arena` itself once it exists and
  the register and aggregator databases, and their users would enter the identity graph. Until `--db` is made required, pass it
  for every source. Discovery is fine for the read-only `01_inventory.py`.
  *Fixed in #46: `--db` is required.*

### 13.2 Identity: the wrong people merged, or dead credentials revived

- [x] **R1 — A deleted account's password works again.** *Security.*
  `build_unified_account` takes the primary hash from the recency winner
  (`merge_apply.py:110`, `:158`) and sets `is_active=any(...)` (`:167`). A soft delete
  stamps `updated_at` (`app/routes/users.py:209-213`), so a just-deleted row *wins*
  recency, and its password becomes the primary on an account that another row keeps
  active. `legacy_hashes` (`:119`) also carries every other row's hash regardless of
  `is_active`. Beyond security, this reverses a deletion someone asked for.
  *Fix:* an inactive row contributes no credential, neither the primary nor a legacy
  hash, and never wins recency for credential purposes. An account whose rows are all
  inactive stays inactive. Whether a deleted row should merge at all is a separate
  decision; this is the minimum.
  *Fixed in #46: rows rank live-first; deleted rows contribute no password and no Google or Apple id; an account deleted everywhere carries no credential. Decided 2026-10-17: deleted rows still bring their history (memberships).*
- [x] **R2 — Plus-addressing is collapsed on every domain** (`normalise.py:137-138`). The
  comment justifies stripping `+tag` for Gmail, then the `else` branch strips it for
  every domain. `user+one@company.com` and `user+two@company.com` become one key and
  auto-merge as one person.
  *Fix:* strip `+tag` only for `gmail.com` / `googlemail.com`.
  *Fixed in #46.*
- [x] **R3 — A matching name overrides the recycled-number check.** *Decision needed.*
  `corroborated = len(vias) > 1 or agree is True` (`identity_graph.py:217`), and
  `_names_agree` is a fuzzy match at ratio >= 0.80 (`:147-154`, threshold at `:30`).
  Two people with a common name who held the same recycled number years apart
  auto-merge with no flag. The code implements §7's table ("Mobile edge alone,
  `full_name` compatible → auto-merge"); the review argues a fuzzy name is too weak to
  count as corroboration on a mobile-only edge, and for common Indian names it is right.
  *Recommended:* on a mobile-only edge, only an exact normalised name corroborates, and
  above `RECYCLE_GAP_DAYS` even that goes to review. If accepted, update §7's table too.
  *Fixed in #46, as recommended (decided 2026-10-17): new flag `mobile_only_name_unconfirmed`; §7's table updated. On the live data this moves 4 pairs to review.*
- [x] **R4 — Foreign numbers are truncated into Indian ones** (`normalise.py:96-97`). Any
  11-15 digit number is cut to its last ten digits without checking for a `91` prefix.
  *Narrower than the review says:* the `digits[0] in "012345"` guard discards most
  results, but UK `447911123456` → `7911123456` survives and can join a real Indian
  number's component. `mobile_candidates` in `app/services/auth/identity.py` (#39) has
  the same shape for login (any input over ten digits also tries its last ten).
  *Fix (both places):* strip only a leading `91` from 12 digits or `0` from 11; keep
  anything else whole so it cannot match an Indian number.
  *Fixed in both places: scripts in #46, login in #45.*

### 13.3 Phase 2: failures, and state it cannot repair

- [x] **R5 — Rows that join an existing person are duplicated or dropped**
  (`03_apply_merges.py:100-108`). Only `source_rows[0]` is looked up in `user_id_map`.
  If a signup made during the backfill joins an imported person and wins recency, it
  has no mapping, so a second user is created with the same email or mobile and the
  insert hits `uniq_emails` / `uniq_mobiles`. If it does not win recency, the winner's
  mapping exists, the whole account is skipped, and the new row is never mapped.
  *Fix:* look up every row, and attach unmapped rows (and their memberships) to the
  existing user instead of creating one.
  *Fixed in #46 (`apply_accounts.py`).*
- [x] **R6 — Revoked credentials survive the delta.** *Security.* The same `continue`
  (`03_apply_merges.py:108`) means an imported account is never refreshed. A password
  reset or deletion during the backfill window is detected by Phase 6 and then skipped:
  the new password is refused, the old one still works, and a deleted account stays
  usable.
  *Fix:* recompute every component touched since `--since` and update the existing
  user's credentials and `is_active` (subject to R1).
  *Fixed in #46: every run rewrites each account from its sources.*
- [x] **R7 — A crash in the middle of an account cannot be resumed**
  (`03_apply_merges.py:118-162`). The user is inserted, then one `user_id_map` row per
  source row, then the avatar plan, then memberships, with no transaction, and a rerun
  decides to skip on the first row's mapping alone. Interrupted after that mapping, the
  rest is never written; interrupted before it, the rerun inserts the identity again.
  *Fix:* one transaction per account (requires a replica set; confirm the cluster is
  one), or make every write an upsert keyed on its source row.
  *Fixed in #46 with upserts, map first; no transaction needed.*
- [x] **R8 — Splitting a flagged component gives every half the contested key**
  (`merge_apply.py:194-217`). Flagged components become one account per row, each built
  from its own row, so both halves of a `shared_mobile_diff_names` pair carry the same
  normalised mobile in `mobile` and `mobiles`. The second insert violates `uniq_mobile`
  and `uniq_mobiles`, both real unique indexes.
  *Fix:* give the contested value to neither account and record it on the review item,
  or to one account by an explicit rule.
  *Fixed in #46. Decided 2026-10-17: the most recently active live row keeps a shared key; an account left without an email gets `<id>@unclaimed.wallearena.com`; `merge_review` records who kept what.*
- [x] **R9 — Two rows from one tournament become duplicate memberships**
  (`merge_apply.py:220-240`). Phase 2 writes one membership per source row. When two
  rows from the same database merge (the normaliser's own docstring says `9876543210`
  and `919876543210` both exist in live data, and see R22 on emails), both get a
  membership for the same `(user_id, tournament_id)`, and the second violates
  `uniq_user_per_tournament`.
  *Fix:* one membership per tournament; keep every row's provenance in `user_id_map`.
  *Fixed in #46.*
- [x] **R23 — Accounts copied between databases get memberships they never earned.**
  *Not raised in review; found in Phase 0.* `world_tower` was seeded with a copy of
  `walle_fantasy`'s users: 102 user documents carry the same `_id` in both. Of those,
  only 4 built a team in `world_tower` and 5 logged in there after TPL ended; 98 never
  used it. Phase 2 writes one membership per source row (`merge_apply.py:220-240`), so
  those 98 would see World Towers on their profile. Identity is unaffected: rows are
  keyed by `(source_db, legacy_user_id)` (`identity_graph.py:65-66`), so copies stay
  separate rows and merge only through a shared mobile or email, as intended.
  *Decided:* when the same `_id` exists in more than one source, the earliest is the
  original, and each later copy gets a membership only if it built a team in that
  database or its `last_login` there is later than the original's. Every row is still
  mapped in `user_id_map`.
  *Fixed in #46, with the original declared by `--copy-of world_tower=walle_fantasy` rather than inferred (the two databases' first signups are six hours apart). 95 copies earn no membership on the live data.*

### 13.4 Phase 3: tenant data

- [x] **R10 — Phase 3 cannot run twice** (`04_import_tenant_data.py:71-75`,
  `tenant_import.py:62-87`). The preflight treats any `_id` present in both the source
  and the destination as a collision. Phase 3 preserves `_id`, so after the first apply
  every copied document is in both, and every rerun aborts, including the one Phase 6
  makes.
  *Fix:* a destination document copied from this same source is expected, not a clash.
  That needs provenance on copied documents (a `source_db` field or an import ledger),
  which R11 needs too.
  *Fixed in #46 with `import_ledger`.*
- [x] **R11 — Deletions in a source never reach the destination**
  (`04_import_tenant_data.py:101-104`). The import only upserts. A contest copied
  during the backfill and deleted before cutover survives it.
  *Fix:* after each import, delete destination documents from this source whose `_id`
  is no longer in the source.
  *Fixed in #46, including collections since emptied or dropped.*
- [x] **R12 — Per-tournament settings are not migrated** (`tenant_import.py:20-31`).
  `global_settings` is not in the import list, so each tournament's squad limits and
  `default_contest_logo_file_id` fall back to platform defaults. #37 made settings
  per-tournament (`GlobalSettings.get_for_tournament`), so there is now a place for them.
  *Fix:* turn each source's `"global"` document into that tournament's settings row with
  a new `_id`. §2.1 still lists `global_settings` as a singleton; update it too.
  *Fixed in #46: `_id` `tournament:<id>`. §2.1 updated.*
- [x] **R13 — Contest, sponsor and carousel images are left behind.** Phase 4 copies
  only the `avatars` bucket. `contest_logos`, `sponsor_logos` and `carousel_images` are
  referenced by `Contest.logo_file_id`, `Sponsor.logo_file_id`,
  `CarouselImage.image_file_id` and `GlobalSettings.default_contest_logo_file_id`, and
  would return 404 after cutover.
  *Fix:* copy the three buckets preserving file `_id`, so no reference needs rewriting.
  §2.1 lists only `fs.avatars.*`; update it too.
  *Fixed in #46. §2.1 updated.*
- [x] **R14 — Remove the `dropIndex("code_1")` instruction**
  (`04_import_tenant_data.py:10-13`). The review item *"Sponsor names still collide
  globally"* is **not a defect**, for the same reason this instruction is unnecessary:
  `sponsors.name` and `contests.code` are not unique indexes at all (R22). Per-tournament
  contest-code uniqueness comes from `uniq_contest_code_per_tournament`. Dropping
  `code_1` is harmless (Beanie rebuilds it), but the docstring teaches something false.
  *Fixed in #46.*

### 13.5 Phase 4: avatars

- [x] **R15 — Every avatar is relabelled as JPEG** (`05_copy_avatars.py:57-61`). Uploads
  store the real type (`app/utils/gridfs.py:46`) and PNG, WebP and SVG are accepted; the
  copy writes `image/jpeg`, and the serving route trusts that metadata.
  *Fix:* copy the source file's `metadata.content_type`.
  *Fixed in #46: files are copied as GridFS's own documents, metadata intact.*
- [x] **R16 — Every rerun copies every avatar again** (`05_copy_avatars.py:40-70`). No
  plan is ever marked done, so a retry uploads a new file per plan and orphans the
  previous one.
  *Fix:* upload with the source file's `_id` (`upload_from_stream_with_id`) and skip
  ids already present, or record the destination id on the plan and skip completed ones.
  *Fixed in #46: files keep their `_id`; present ones are skipped.*

### 13.6 Phase 6: the delta cannot currently complete

- [x] **R17 — Change detection only looks at users and teams**
  (`07_resync_delta.py:79-80`). Changes confined to contests, enrolments, players or
  `player_contest_points` (a scoring update during the window, say) print "Nothing to
  re-sync" and are lost.
  *Fix:* check every imported collection, or skip detection and always run.
  *Fixed in #46: the delta re-runs everything; there is no detection to miss things.*
- [x] **R18 — The delta never copies avatars** (`07_resync_delta.py:87-98`). It reruns
  Phases 2 and 3 only, so a signup with an avatar during the window keeps a source-bucket
  id that the unified database cannot serve.
  *Fix:* include Phase 4.
  *Fixed in #46.*
- [x] **R19 — Even with R17 and R18 fixed, Phase 6 fails.** *Not raised in review.* It
  reruns Phase 3 with `check=True` (`07_resync_delta.py:98`), which aborts on R10, and
  it reruns Phase 2, which skips every existing account (R5, R6). Step 5 of §7 Phase 6,
  the delta inside the read-only window, cannot succeed until R5, R6 and R10 are fixed,
  and that is the step where users are waiting.
  *Fixed with R5, R6 and R10. The delta also passes `--copy-of` and `--platform-admins` through; without the list, re-running Phase 2 would have removed every platform admin.*

### 13.7 Phase 5: verification

- [x] **R20 — Verification passes an incomplete migration** (`verify.py:44-154`). Every
  check looks for something *wrong* among records that exist: duplicates, orphans,
  missing `tournament_id`. None checks that what should exist does. Run it after Phase 2
  but before Phase 3 and it passes with empty game collections; interrupt Phase 2 after
  the maps but before the memberships and it passes.
  *Fix:* reconcile document counts per collection against each source, and require a
  membership for every mapped row.
  *Fixed in #46.* A correction to the item: one existence check
  did exist — the legacy-row count against `user_id_map` — but nothing beyond it. And
  R23 made "a membership for every mapped row" wrong; the check uses `earns_membership`
  instead.

### 13.8 Found while checking, outside the scripts

- [x] **R21 — `uniq_legacy_row` does not exclude app-created memberships.** *Not raised
  in review; blocks stage E.* (#39, `app/models/tournament_membership.py:94-99` at
  `f7dcd43`.) The partial filter is `{"legacy_user_id": {"$exists": true}}`, meant to
  leave out memberships with no legacy row. But `$exists: true` also matches `null`, and
  Beanie writes `None` fields as `null` (`keep_nulls` defaults to true). Every membership
  the app creates has `source_db: null, legacy_user_id: null`, so the **second** one
  fails with a duplicate key. Phase 2 is unaffected because it always sets both. The
  existing test checks only the index definition, and mongomock ignores partial filters,
  so the suite cannot catch this.
  *Fix:* `{"legacy_user_id": {"$type": "objectId"}}`, and require `source_db` whenever
  `legacy_user_id` is set (the open review comment on #39).
  *Fixed in #45. The flawed index is already built on `Dcpl` and `rspl` (both collections empty), and MongoDB will not redefine it in place, so the backend drops that one index at startup — only while it still has the `$exists` filter — and Beanie builds the corrected one.*
- [x] **R22 — Several `unique=True` declarations do nothing.** When a field is declared
  `Indexed(..., unique=True)` *and* listed in `Settings.indexes`, Beanie's
  `merge_indexes` keys both by field and keeps the plain `Settings` entry, dropping the
  unique flag. Checked by replaying Beanie's merge against the models:

  | Field | Declared | Index actually built |
  |---|---|---|
  | `users.username` | unique (wrapper removed in #39) | non-unique, as intended |
  | `users.email` | unique | **non-unique** |
  | `sponsors.name` | unique | **non-unique** |
  | `contests.code` | unique | **non-unique**; `uniq_contest_code_per_tournament` is real |

  `users.email` is the one that matters here. In the live databases, duplicate emails
  are prevented only by the register route's read-then-write check, which races, so
  Phase 1 should expect duplicate emails inside a single source (they merge, which is
  one way R9 happens). After cutover, every account has `emails` populated and
  `uniq_emails` covers it. `contest.py`'s comment about a "legacy global unique index
  on `code`" describes an index that is not built.
  *Decide:* add a real index where uniqueness is intended, or remove the misleading
  wrapper where it is not.
  *Fixed in #45 (decided 2026-10-17: remove the markers, no database change). Replaying Beanie's merge over every model found **nine** such fields, not three: also `refresh_tokens.token`, `user_profiles.user_id`, `slots.code`, `slots.name`, `password_reset_tokens.token_hash` and `tournaments.slug`. A test now fails if one is declared that way again. See R30.*

### 13.9 Found while fixing the above

Each was found by running the scripts' own planning against the fifteen live sources
(read-only, in memory), except R30.

- [x] **R24 — Every group of three or more accounts was flagged `chained`.** The flag
  exists for transitive links, but fired on size alone. On the live data that held back
  80 people whose 3–4 accounts all share one phone or email directly: 240 accounts, the
  most active players. *Decided 2026-10-17: only a component where some pair shares
  nothing directly is chained (6 groups). §7's table updated.*
- [x] **R25 — Junk keys reached accounts.** Keys held by too many rows were dropped from
  the graph but still written onto every account holding them: 6 mobiles on 47 accounts,
  11 emails on 55, all colliding on the unique indexes. *They now go to nobody.*
- [x] **R26 — `emails` held the matching form.** It folds Gmail's dots, while login looks
  up what is typed, so anyone typing `rahul.patel@gmail.com` could not sign in by email
  after cutover. *`emails` now holds the address as typed, lowercased — as registration
  and Google sign-in already store it.*
- [x] **R27 — The platform-admin list was not normalised.** It was compared as typed with
  normalised keys, so a capital letter or a Gmail dot silently withheld the access. *It
  is normalised the same way, and a line that is neither email nor mobile stops the run.*
- [x] **R28 — Apple sign-in ids were not migrated.** Two `Dcpl` accounts are Apple-only;
  the loader never read `apple_id`, so they would have had no way to sign in. *Carried
  like Google ids, from live rows only, and counted by Phase 5.*
- [x] **R29 — One Google login on two accounts.** A `Dcpl` and an `rspl` account signed in
  with the same Google account but shared nothing usable, their address being on five
  accounts (so junk). Both would have carried the id into `uniq_google_ids`. *Decided
  2026-10-17: a shared Google or Apple sign-in links accounts like a phone or email,
  with no `MAX_ROWS_PER_KEY` cap.*
- [x] **R30 — Duplicated refresh tokens outlived logout.** `refresh_tokens.token` was one
  of R22's nine; `Dcpl` holds 35 duplicated tokens and `rspl` 1. Two sign-ins in the
  same second minted identical tokens, and logout and refresh revoked only the first
  copy. *Fixed in #45: tokens carry a random `jti`, and revocation updates every copy.*
- [x] **R31 — Accounts split by a junk key never reached review.** They are singletons,
  so `merge_review.csv` never shows them. *Phase 1 writes `junk_keys.csv`.*

Review of #46 found six more in the fixes themselves, all fixed there with a test that
fails without the fix:

- [x] **R32 — A split rewrote the saved account before it was detected.** Phase 2 now
  resolves every account's user id before writing any, and leaves every account in a
  conflict untouched.
- [x] **R33 — A shared phone could not change hands between runs.** The new keeper was
  written while the old one still held it, and the unique index stopped Phase 6. Keys
  an account is giving up are now released, across all accounts, before any is written.
- [x] **R34 — An import stopped between its two writes refused to resume.** The ledger
  claim is now written before the document.
- [x] **R35 — Verification compared counts.** A deletion and an addition since the last
  run kept them equal. It now compares ids, for user rows and every collection.
- [x] **R36 — A mapping to a user that does not exist passed.** Phase 2 writes the map
  first, so a stopped run leaves one. Verification now requires every mapping's user.
- [x] **R37 — A phone taken from an account in a split group still made it a platform
  admin.** Only keys the account keeps count.

With all of the above, planning against the live sources gives 1,946 accounts and 2,127
memberships, with no identity value on two accounts and no live account without a
credential. 197 groups merge automatically and 52 go to review.

### 13.10 Before the dry run

- [x] **Merge #45** before anything boots against `walle_arena`, so it gets the corrected
  `uniq_legacy_row` from the start. *Merged 2026-10-17 (`f76c24b`); both live services
  dropped the flawed index at startup and rebuilt it with the `$type` filter.*
- [ ] **The platform-admin list** (§11, Q3): the emails or mobiles of the people who should
  administer the whole platform. Without it no one is a platform admin after cutover.
  *Decided 2026-10-17: the first dry run goes without it; it is needed before cutover.*
- [x] **Seed `walle_arena`'s registry** with all fifteen tournaments (§7, *Source
  mapping*). *`seed_registry.py`, run before Phase 2. Seeded into the dry run's copy
  (2026-10-17; a second run changes nothing). The real `walle_arena` is seeded the same
  way at cutover, before its Phase 2.*
- [x] Then the dry run itself, stage H: Phases 1–5 into `walle_arena` from a restored
  snapshot, with the arguments in §7. *Decided 2026-10-17: the snapshot is a local
  `mongod` restored from a `mongodump` of the fifteen sources, so nothing is written to
  the Atlas cluster. Build `walle_arena`'s indexes first by running the app's
  `connect_to_mongo` against it, as the unified backend would on first boot.*
  *Run 2026-10-17; results and what it found in §13.11.*

### 13.11 Found by the dry run

Run 2026-10-17 against a local copy of the fifteen sources (counts matched Atlas
collection by collection), with the app's own indexes built first. The first pass
stopped in Phase 3 on R38; with R38 worked around it completed, and turned up R39–R41.
All four are fixed, and the second pass ran end to end with no manual step.

- [x] **R38 — Sponsor priority was unique across all tournaments.** `Sponsor` declares
  a unique `(featured, priority)` index without `tournament_id`, so Phase 3 stopped at
  the second tournament: Dcpl and walle_fantasy both have a priority-3 sponsor. §3.5
  missed it. *Fixed: `uniq_sponsor_priority_per_tournament`, led by `tournament_id`;
  startup drops the old `featured_1_priority_1` (`FLAWED_INDEXES`). On Dcpl and rspl
  every sponsor has no `tournament_id`, so the new index holds wherever the old one
  did. The sponsor routes still pick the next priority across all tournaments; that is
  part of moving routes onto `scoped()`, not this fix.*
- [x] **R39 — Avatars a copy inherited were cleared.** `world_tower` got its users'
  `avatar_file_id` from walle_fantasy but not the files. Where the copied row won, the
  avatar was planned from world_tower's bucket, found missing, and cleared: 4 avatars
  that exist. *Fixed: Phase 2 plans an avatar a copy inherited from the original's
  bucket.*
- [x] **R40 — 22 mwpl `import_logs` name a user who exists nowhere.** All from one
  player import on 2025-12-04, by an account no source still holds (most likely a
  deleted admin). Phase 3 reports them as unmapped and prints "Stop here". *Decided
  2026-10-17: copy them as they are, still pointing at that id — the same dangling
  reference the source has. Expected; not a failure. Phase 5 checks `teams` and
  `team_contest_enrollments`, where an unmapped user would be one.*
- [x] **R41 — A copied account and its original became two accounts.** Rows are keyed
  by `(source_db, _id)` and joined only through a phone, address or sign-in (R23), so
  three people whose keys were all junk were split from their own copies. *Decided
  2026-10-17: Phase 1 and 2 join a declared copy to its original by `_id`, as a fifth
  edge type.* 86 of the 102 copies now share their original's account; the other 16 are
  in groups held for review, as before.

**Results, second pass:** 2,222 legacy rows become 1,943 accounts and 2,127
memberships. 200 groups merge automatically and 52 (136 accounts) wait for review;
17 junk keys are withheld; 95 copies earn no membership (R23). Every shared-mobile gap
is under a year, so the 365-day `RECYCLE_GAP` flags no recycled numbers. Phase 3
copies 2,402 teams, 2,750 enrolments, 46 contests and 13 settings rows. It found 10
enrolment collisions — one merged person with two active teams in one contest — and
kept the most recent active, the rest REMOVED (cccl 1, jypl-s9 1, lpcl 3, m11 1,
tpl-s11 2, tyrant 1, wtpl 1); tell those users. Phase 4
copies 4 avatars with none missing. Phase 5 passes all fifteen checks, and again after
a full Phase 6 delta (no account created, none in conflict).

Still to do by hand before cutover: sign in as a few migrated users per source with
their old password (§7, Phase 5), review the 52 groups and `junk_keys.csv`, and supply
the platform-admin list. *Done 2026-10-18 except the list; see §13.12.*

### 13.12 Found reviewing the dry run

Reviewed 2026-10-18: every flagged group, every junk key, and whether each migrated
account can still be signed into. Nobody's password is known, so the check is in two
parts that together amount to one: every live row's password hash is on the account
it maps to — bcrypt verifies the same password against the same hash — and the app's
own `resolve_login_identity` reaches that account from an email, mobile or username
the person used before. All 1,962 hashes were carried; **79 accounts could not be
reached** by anything their owner knew.

- [x] **R42 — Junk keys were counted across all fifteen sources.** `MAX_ROWS_PER_KEY`
  counted every database together, so a regular of four tournaments had their phone or
  address discarded from all four accounts. One player became four accounts with no
  email or mobile between them, and so no way to sign in or reset a password; staff
  accounts were scattered the same way. 33 of the 79. *Fixed: a key is junk when more
  than three rows in one database hold it, or when it is carried under more than two
  given names across them (`MAX_PEOPLE_PER_KEY`) — an office number, or a staff
  address used to register other people. Junk keys fall from 17 to 4, all staff and
  test accounts.*
- [x] **R43 — Names were compared as whole strings.** A 0.80 similarity ratio called one
  person with a father's name added two people (0.76–0.79) and two siblings one
  (0.95). 47 of the 52 review groups were one person under two spellings: a middle
  name, an initial, a title, a missing space, or a community surname used for a family
  one. *Fixed: given names decide (§7, Phase 1, *Names*). A mobile edge alone still
  needs an exact name (R3), titles and digits aside.* With R42 the queue falls from 52
  groups to 20; the 38 automatic merges this adds were each checked by eye and are all
  one person.
- [x] **R44 — Nothing applied a review.** §7 promised a `link_accounts.py`; it was never
  written, so every flagged group would have stayed split. Within a group the shared
  key went to one row and the username was no longer unique, so the other rows could
  not be signed into at all: 46 of the 79. *Fixed differently: the review is applied
  when the merge is planned, not after — `merge_review.csv`'s `link` column, passed as
  `--links` to Phases 1, 2 and 6 (§7, Phase 1, *Review*).*

**Review decisions.** Of the 20 remaining groups, 14 are one person, and 6 hold one
family member — a spouse or child on the shared phone or address — who stays separate.
The largest staff group became one account for one staff member's own rows and one
for the shared `walleadmin` login. The reviewed links are kept outside the repository,
not here.

**Results, third pass** (2026-10-18, with the links): 2,222 legacy rows become 1,830
accounts and 2,122 memberships. 232 groups merge automatically and all 20 flagged
groups are reviewed; 4 junk keys are withheld. **1,960 of the 1,962 password accounts
are reachable** from an identifier their owner used before; the other two are a staff
events login and a nameless copy whose owner signs in through the account it joined.
Enrolment collisions are unchanged at 10. Phase 5 passes every check, and again after
a full Phase 6 delta (no account created, none in conflict).

Still open before cutover:

- [x] **The platform-admin list** (§13.10). The candidates are the four people behind
  the legacy admin rows; the shared `walleadmin` login should not be one.
  *Decided 2026-10-19: the owner's account (`aagamratadia`) and `walleadmin`, against
  the advice above. Five accounts carried the username `walleadmin`, since their
  emails and mobiles never joined them: the shared login (epl, jpl, tpl-s11, wtpl),
  rows named Mohit Singh (cccl, dcpl, rspl), two more (jmcl and tyrant; mjpl), and
  `Walleevents` (lpcl). The owner confirmed they are one login, so all eleven rows
  carry the cross-group link `=walleadmin` (#51) and become one account. Planned on
  the live sources, that turns 1,830 accounts into 1,826 and changes nothing else.
  The list file names that account and the owner's by their keys, and with it Phase
  2 makes exactly those two platform admins. It is kept outside the repository with
  the links, since it holds contact details. Chinmay Rane's account keeps three rows
  named `walleadmin` (jypl, m11, mtc) on his own phone, as the review decided.*
- [x] **Keep the reviewed links** for cutover and re-run Phase 1 with them on the
  cutover snapshot. A group that gained a row since the review shows as reviewed, but
  the new row stays on its own until it is linked. *Kept 2026-10-19 outside the
  repository: `source_db`, `legacy_user_id` and `link` only, the columns `--links`
  reads. The dry run's local copies are deleted; the re-run on the cutover snapshot is
  still to do.*

### 13.13 Found scoping the routes (stage A2)

Moving every route onto `scoped()` (2026-10-19) meant reading all of them, and running
the unified backend for the first time: `TENANCY=shared` against the dry run's
`walle_arena`. For `dcpl` and `rspl`, every public list matched the database exactly
(contests 2/2 and 1/1, players 226/226 and 90/90, slots 1/1, sponsors 7/7), and one
tournament's contest was a 404 under the other's slug.

- [x] **R45 — Any signed-in player could edit sponsors and the carousel.** Every write
  under `/api/v1/sponsors` and `/api/v1/carousel` said "Admin only" and depended on
  `get_current_active_user`. Live on both services. *Fixed in #49: `get_admin_user`.*
- [x] **R46 — Admin enroll-teams could never enroll a team.** It, and unenroll by team,
  joined Beanie expressions with `&`, which Beanie 1.26 rejects with `TypeError`: a 500
  for every real team. No test reached it. *Fixed here: separate `find_one` arguments.*
- [ ] **R47 — `GET /api/players/hot` is unreachable.** `players_router` is included
  before `players_hot_router` in `main.py`, so `/api/players/{id}` takes the request
  with `id="hot"` and returns 400 "Invalid player ID". The frontend's hot-player list has
  never loaded. `/hot/ids` and `/{id}/hot` are unaffected. *Open: the fix is to include
  the hot router first, which turns a feature on in production, so it is yours to
  decide. Its aggregation is scoped and tested directly.*
- [ ] **R48 — Seven retired copies cannot build `uniq_active_user_per_contest`.**
  `cccl`, `jypl`, `lodha-park`, `melangeindia11`, `tyrant`, `walle_fantasy` and
  `world_tower` hold users with two active teams in one contest, so `init_beanie`
  fails against them. Their services are archived, and `walle_arena` builds the index:
  Phase 3 resolves them on the way in (§13.11's enrolment collisions). Noted so nobody
  points a service at one of these databases expecting it to start.
- [x] **R49 — Per-contest hot counts were a 500.** `count_in_contest`, behind
  `GET /api/players/{id}/hot?contest_id=`, projected onto
  `TeamContestEnrollment.team_id`. Beanie projects onto a model class, not a field,
  and raised `TypeError`. *Fixed here: it reads whole enrolment documents.*
- [x] **Under `TENANCY=shared`, admin is closed until stage D.** The admin routes still
  check the global `is_admin`, and Phase 2 sets it false on every unified account,
  moving admin to the membership role (§4.7): the dry run's `walle_arena` has no
  `is_admin` user. So `get_admin_user` refuses everyone. That fails closed, since no
  tournament's admin can reach another's through the header, but it makes D (apex
  admin, slug in the path, checked against the membership role or the platform-admin
  list) a gate for stage I rather than a refinement. *Fixed by stage D (§4.7): admin
  stays on the subdomain, and `get_tournament_admin` checks the membership role for
  the tournament in the header, or the platform-admin list.*
