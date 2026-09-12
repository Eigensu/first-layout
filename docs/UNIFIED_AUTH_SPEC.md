# Unified Auth — Technical Specification & Migration Plan

**Status:** Ready for review (decisions locked, not yet implemented)
**Owner:** Aagam
**Scope:** One user account per person across every Walle tournament, past and
future, with each profile listing the tournaments that person took part in.

---

## 0. Decisions locked

These twelve answers drive everything below. Changing one changes the design.

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
| 10 | The open reset gate | **Fix deferred, tracked in §5.1**, not shipped as a standalone hotfix — it has to land on all five services. |
| 11 | Email as a merge key | **Unchanged.** Any email match still auto-merges; mobile SMS reset stays available as the recovery path. Residual risk recorded in §10. |
| 12 | Changing your email | Users can **change their email from their profile**, verified by a code sent to the new address (§5.7). |
| 13 | Scope | Only **lpcl and fifth** are running tournaments, both on `main`. m11, third and mtc are retired — services archived, but their **user and participation data still migrates** so profiles show full history. |
| 14 | End state | **One backend, one database.** A tournament is a registry row — not a deployment, not a database, and not a provisioning step. Game data is tagged with `tournament_id` (§3.5). |
| 15 | Admin | All admin on the **apex** `wallearena.com`, a page per tournament, slug carried in the **API path** (§4.7). |
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
walle_fantasy/

  ── global: no tournament_id, shared by every tournament ──
  users                      one document per real person
  tournaments                one per tournament — the registry (exists today)
  tournament_memberships     one per (person, tournament)   ← the new join table
  refresh_tokens
  user_profiles
  password_reset_sessions / password_reset_tokens
  identity_merge_audit       what the migration merged, and why
  user_id_map                {source_db, legacy_user_id} → global id
  fs.avatars.*               GridFS

  ── tenant-scoped: every document carries tournament_id ──
  contests            teams              team_contest_enrollments
  players             slots              player_contest_points
  sponsors            carousel_images    import_logs
  admin_action_logs

  ── singleton ──
  global_settings
```

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

Two mechanisms, in priority order:

1. **`TOURNAMENT_SLUG` env var** — each legacy service serves exactly one tournament,
   so its identity is configuration. Required on all five services.
2. **`X-Tournament-Slug` request header** — for the shared backend once it serves more
   than one tournament. The frontend `apiClient` gains a request interceptor that reads
   the slug from the host (it already computes it in `middleware.ts`) and sets the header.
   The backend validates it against the `tournaments` registry and rejects unknown slugs.

```python
# apps/backend/app/utils/tenant.py  (new)

async def get_tenant_slug(request: Request) -> str:
    """Resolve which tournament this request belongs to.

    A per-tournament deployment is pinned by TOURNAMENT_SLUG. The shared backend
    takes the slug from the header the frontend forwards and validates it against
    the registry, so an arbitrary header cannot invent a tenant.
    """
    if settings.tournament_slug:
        return settings.tournament_slug

    slug = (request.headers.get("x-tournament-slug") or "").strip().lower()
    if not slug or not await Tournament.find_one(Tournament.slug == slug):
        raise HTTPException(400, detail="Unknown or missing tournament")
    return slug
```

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

```python
async def get_platform_admin(user: User = Depends(get_current_active_user)) -> User:
    if not user.is_platform_admin:
        raise HTTPException(403, detail="Platform admin access required")
    return user

async def get_tournament_admin(
    request: Request, user: User = Depends(get_current_active_user)
) -> User:
    if user.is_platform_admin:
        return user
    slug = await get_tenant_slug(request)
    membership = await TournamentMembership.find_one(
        TournamentMembership.user_id == user.id,
        TournamentMembership.tournament_slug == slug,
    )
    if not membership or membership.role != "admin":
        raise HTTPException(403, detail="Admin access required for this tournament")
    return user
```

**Admin lives on the apex.** All admin is served from `wallearena.com`, which carries
no tournament subdomain — so `get_tenant_slug` has nothing to read from the host, and
the tenant has to be explicit in the request.

It mirrors the admin UI one-to-one: the admin app has a page **per tournament**
(`wallearena.com/admin/lpcl/players`), so the slug already exists in the browser URL,
and putting it in the API path keeps the two in agreement:

```
POST   /api/admin/lpcl/players
GET    /api/admin/fifth/contests
PATCH  /api/admin/lpcl/contests/{code}
```

A header-carried slug would let the browser URL say `lpcl` while stale client state
sends `fifth` — the exact way an admin edits the wrong tournament without noticing.
The path also makes `admin_action_logs` unambiguous for free, and reads correctly in
access logs.

Route mapping:

| Routes | Guard |
|---|---|
| `/api/admin/tournaments/*` (the registry), `/api/admin/settings/*` | `get_platform_admin` |
| `/api/admin/{slug}/*` (players, slots, contests, teams/users, imports) | `get_tournament_admin`, slug from the path |

`get_tournament_admin` resolves the slug from the path parameter rather than the host,
validates it against the registry, and then checks the caller's membership role for
that tournament. A platform admin passes for any slug.

Migration sets `role="admin"` on the membership for every legacy row with
`is_admin: true`; `is_platform_admin` is set **only** from an explicit allowlist you
confirm before the run.

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

1. Load every user row from every source database.
2. Normalize: mobile → ASCII digits only; email → trimmed lowercase.
   Discard obviously junk keys before they join anything: empty strings, mobiles of
   fewer than 10 digits, placeholder emails (`test@test.com`, `a@a.com`, …) —
   **a junk key shared by 50 accounts would collapse 50 people into one.**
3. Union-find over two edge types: shared mobile, shared email.
4. Emit `merge_plan.json` and `merge_review.csv`.

Flag a component for review when any of these hold:

| Flag | Meaning |
|---|---|
| `chained` | component size ≥ 3, or it is only connected through an intermediate row |
| `name_mismatch` | `full_name` values differ beyond a fuzzy threshold |
| `shared_mobile_diff_names` | same number, clearly different people (family sharing a phone is common in this market) |
| `multi_google` | two distinct `google_id`s in one component |
| `high_degree_key` | a mobile or email that appears in > 2 source rows |
| `possible_recycled_mobile` | an **uncorroborated** mobile edge whose two rows have disjoint activity windows separated by a wide gap — see below |

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
| Mobile edge **and** an email edge between the same pair | Auto-merge — two independent identifiers agreeing is strong evidence, whatever the gap. |
| Mobile edge alone, activity windows overlap or nearly touch | Auto-merge. |
| Mobile edge alone, `full_name` compatible | Auto-merge. |
| **Mobile edge alone, windows disjoint by more than `RECYCLE_GAP_DAYS`, no name corroboration** | **`possible_recycled_mobile` → review.** |

Do **not** hardcode `RECYCLE_GAP_DAYS` before seeing the data. Phase 1 emits a
**histogram of inter-row gaps across every shared-mobile pair** alongside the merge
plan; pick the cut from the real distribution. As a starting point, India's
disconnection-plus-quarantine period makes reallocation physically possible from
roughly 180 days, but a threshold nearer 12 months will likely separate the
seasonal-return population from the recycled one far better. The histogram will say.

The same failure mode exists for email but is much rarer — a corporate address
reassigned to a new employee is the realistic case. It is covered by the existing
`name_mismatch` and `high_degree_key` flags rather than a rule of its own.

Flagged components are held back — the migration merges the clean ones and writes the
flagged ones as **separate accounts** with `merge_state="needs_review"`, so nobody is
wrongly merged by default. A later `link_accounts.py` applies your review decisions.

### Phase 2 — write the unified collections (`03_apply_merges.py`)

For each component, create one `User`:

- `emails` / `mobiles` / `google_ids` = union of the component's values, primary =
  the value from the most recently active row.
- `hashed_password` = hash from the most recently used row; every other row's hash
  appended to `legacy_hashes`.
- `username` = the display name from the most recently used row.
- `full_name`, `avatar_*` = from the most recently used row that has them.
- `created_at` = earliest; `last_login` = latest.
- `is_active` = true unless **every** member row was inactive/deleted.
- `is_verified` = true if any member row was.
- `is_platform_admin` = only if the row is on your confirmed allowlist.
- `legacy_accounts` = full provenance for all members.

Then one `TournamentMembership` per source row (`display_name` from that row,
`role="admin"` where that row had `is_admin`), and one `user_id_map` entry per source
row.

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
        await dest[name].insert_one(doc)                    # _id preserved — see below
```

| Collection | User field to rewrite |
|---|---|
| `teams` | `user_id` |
| `team_contest_enrollments` | `user_id` |
| `import_logs` | `user_id` *(string)* |
| `admin_action_logs` | `admin_id` *(string)* |
| `contests`, `players`, `slots`, `player_contest_points`, `sponsors`, `carousel_images` | — tag only |
| `global_settings` | — becomes that tournament's settings row (§3.5) |

**Preserve `_id` on every copy.** Documents reference each other by ObjectId —
`teams.contest_id`, `enrollments.team_id` / `contest_id`,
`player_contest_points.player_id`. Keeping the original `_id` means every one of those
references stays valid with no rewriting at all. Regenerating ids would mean remapping
each reference by hand, for no benefit.

**Check for `_id` collisions across the five sources first.** ObjectIds are practically
unique, so a clash is very unlikely — but "very unlikely" across five databases and
hundreds of thousands of documents deserves a pre-flight check rather than optimism.
The unique `_id` index makes a missed collision fail loudly on insert rather than
corrupt anything silently, so the failure mode is safe either way; the pre-flight just
means you find out before a long run rather than during one.

**`team_contest_enrollments` still needs the merge check.** Its
`uniq_active_user_per_contest` partial unique index means that if two merged accounts
both had an active team in the *same* contest, rewriting both to one `user_id` violates
it. Detect these up-front, report them, and apply a policy: keep the most recently
enrolled team active, set the others to `REMOVED` with `removed_at` and a note. This
list belongs in the migration report — it is the one place where merging actually takes
something away from a user.

**Contest code collisions are now possible too.** `code` was globally unique per
database; two tournaments may each have a `FINAL`. Under the new per-tournament unique
index (§3.5) that is fine and needs no intervention — but the old *global* unique index
must be dropped before the import, or the first cross-tournament duplicate aborts it.

### Phase 4 — move avatars (`05_copy_avatars.py`)

Copy each referenced GridFS file from the tenant `avatars` bucket into
the unified database's, then rewrite `avatar_file_id` on the new user. Only the winning
avatar per merged account is copied; the rest are listed in the report and left in
place.

### Phase 5 — verify (`06_verify.py`)

Hard assertions, all must pass before any flip:

- Every legacy user row maps to exactly one `user_id_map` entry.
- `users` count == number of components (clean) + flagged rows.
- No `teams.user_id` or `team_contest_enrollments.user_id` in any tenant DB fails to
  resolve to a unified `users` document.
- `uniq_emails`, `uniq_mobiles`, `uniq_google_ids` all build without conflict.
- No `tournament_memberships` duplicate for a (user, tournament).
- Every account has at least one usable credential (`hashed_password`, a
  `legacy_hashes` entry, or a `google_ids` entry) — **an account with none is locked
  out**, and that list must be empty or explicitly accepted.
- Sample-login check: pick N users per source DB, verify their old password still
  authenticates against the new record.

### Phase 6 — cut over

Under one database this is no longer "flip five services one at a time" — there is one
backend, and the two live tournaments move to it together.

1. **Stand up the unified backend** on `api.wallearena.com`, pointed at the unified
   database, running the new code. Nothing is pointed at it yet.
2. **Full backfill** with the two live tournaments still serving from their own
   services: Phases 1–5 for all five source databases. Nothing in the source databases
   is modified.
3. **Verify** (Phase 5) and review the merge report.
4. **Read-only window on lpcl and fifth.** This is the only moment users are affected.
5. **Delta re-sync** (`07_resync_delta.py --since <backfill ts>`) to pick up everything
   written during the backfill.
6. **Repoint the two frontends** — `NEXT_PUBLIC_API_URL` to the unified backend — and
   redeploy.
7. **Smoke test** on both: login by mobile, by email, Google, `/api/users/me`,
   `/api/users/me/tournaments`, create a team, enrol in a contest, admin on the apex.
8. **Watch** for an hour. Then archive `first-layout`, `second-layout`, `third-layout`,
   `fourth-layout-mtc`, `fifth-layout`.

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
app/utils/rate_limit.py                 slowapi limiter, Redis-backed
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
app/routes/auth.py          DELETE /reset-password-mobile + its schema (§5.1)
app/schemas/auth.py         drop ResetPasswordByMobile; channel on forgot-password
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
src/components/auth/ForgotPasswordModal.tsx  REBUILD as request → verify → set
                                    password, with an SMS/email channel choice (§5.1)
src/lib/api/auth.ts                 drop resetPasswordByMobile; add the three
                                    forgot-password calls that were never wired up
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
| Chained merges collapse two real people | **High** | Flagged components are *not* merged; they migrate as separate accounts pending review. `link_accounts.py` applies decisions afterwards. |
| Shared family mobile numbers | **High** | Same as above — `shared_mobile_diff_names` is a flag, not an auto-merge. |
| Username login stops working | Medium | Transitional single-match fallback + 409 with a clear message + login form copy change + release comms. |
| JWT `sub` change invalidates live sessions | Medium | Legacy-username branch kept for cutover + 8 days, covering both token TTLs. |
| Enrolment unique-index collision on rewrite | Medium | Detected in Phase 3, reported, deterministic keep-latest policy. |
| Avatars break | Low | Phase 4 copies GridFS files; verification counts referenced vs copied. |
| Legacy services run drifted code | **High / unknown** | Must be confirmed per service before flipping (§11, Q2). A service that is not on this codebase cannot simply take the new env vars. |
| Extra valid passwords per account during the window | Low | Promote-on-use + 180-day sweep; stated in release notes. |
| Profile page fans out across databases | Low | Stats are denormalized on the membership; cross-DB reads only in the nightly job. |
| App and test model lists drift | Low | `tests/conftest.py` keeps its own list. Same class of bug `CLAUDE.md` already warns about. |
| `/reset-password-mobile` stays open until the fix ships | **High** | Accepted by decision (§0, row 10). It is a live unauthenticated account takeover, and unification widens its blast radius from one tournament to all of them — so it should land early in stage C rather than late. Tracked in §5.1. |
| Unverified email as a merge key | Medium *(accepted)* | Decision #11 keeps auto-merge on any email match. Residual path: someone who typed a stranger's address at signup gets merged into that account and can sign in with their own password (§4.3 keeps both hashes). If this shows up in the Phase 1 report, the one-line mitigation is to add an `email_only_edge` flag so those components go to review instead of merging. |
| Resend domain not warmed / mail lands in spam | Medium | Send from a verified subdomain, code in the subject line, DMARC at `p=none` first. Mobile SMS stays available as the fallback channel, so email deliverability is never the only route to recovery. |
| Rate limiter state is per-replica | Medium | In-memory `slowapi` counters do not span Railway replicas. Back it with the existing `REDIS_URL`, or a Mongo TTL counter. |
| Resend quota burned by an attacker | Low | The §5.6 per-destination and per-IP limits are the control; without them the request endpoint is an open mail relay to arbitrary addresses. |
| **`fifth` has no working password reset** | **High** | `TWOFACTOR_*` is set on `lpcl` only (§1.1a); on `fifth` it fails silently behind the generic success message. Must be fixed *before* `/reset-password-mobile` is deleted, or those users lose reset entirely — stage C2a. |
| Recycled mobile numbers merge two strangers | **High** | `possible_recycled_mobile`: an uncorroborated mobile edge across disjoint activity windows goes to review. Threshold chosen from the Phase 1 gap histogram, not guessed (§7, Phase 1). |
| ~~Feature branches drift further~~ | *Closed* | Both live services run `main` (§1.1). The feature branches and the forked repo belong to retired tournaments and are archived, not migrated. |
| A route forgets its `tournament_id` filter and leaks across tournaments | **High** | One choke point (`scoped()`, §3.5) plus a test that walks every tenant model's routes. This is the cost of logical isolation and the reason it is bought in one place rather than trusted to twelve route files. |
| Game data import is a bigger migration than a field rewrite | Medium | Phase 3 now copies collections between databases. `_id` is preserved so inter-document references need no remapping, and a pre-flight checks for `_id` collisions. Run it between seasons. |
| A service is flipped with incomplete config | Medium | `00_env_audit.py` before each flip, plus a boot-time assertion so a misconfigured service refuses to start rather than 400-ing every request (§7, Phase 0b). |
| In-process state is wrong on multi-replica services | Medium | `first-layout` and `third-layout` run 2 replicas. Rate limits and any OTP cache must be Redis- or Mongo-backed, never in-process (§5.6). |

---

## 11. Open questions for you

These block specific phases; everything else can be built without them.

1. ~~Which service maps to which tournament?~~ **Answered** (§1.1). Still needed:
   the five `MONGODB_DB_NAME` **values** — two for the live tournaments, three for the
   retired databases being read for history. Names are redacted to the integration; a
   30-second check in the Railway dashboard settles it. *Blocks Phase 1.*
2. ~~Do all services run this repo's code?~~ **Closed.** Both live services run `main`
   from `Eigensu/first-layout`. The feature branches and the forked repo belong to
   retired tournaments and are archived rather than migrated.
2b. ~~Confirm the data model~~ **Decided:** one database, `tournament_id` on every
   tenant-scoped document (§2.5, §3.5).
3. **Who should be platform admins?** An explicit list of emails/mobiles. Everyone
   else with legacy `is_admin` becomes an admin of their own tournament only.
   *Blocks Phase 2.*
4. **Are `walle-register` and `walle-landing-backend` (separate Railway projects) also
   holding user accounts** that should fold in, or are they unrelated?
   *Blocks scope of Phase 1.*
5. **Roughly how many users per database?** Sizes the review queue and tells us
   whether a 2-minute flip window is realistic. (Phase 0 answers this precisely; a
   rough number now helps plan.)
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
10. **Do the five services share one Resend key and sending domain**, or should each
   tournament send from its own address? One key with per-tenant branding in the
   template (§5.4) is the lower-maintenance default.

---

## 12. Sequencing

| Stage | Work | Depends on |
|---|---|---|
| A0 | `00_env_audit.py` + boot-time config assertion (§7, Phase 0b) | — |
| A | Settings, register new models, `scoped()` helper, test fixtures | — |
| A2 | `tournament_id` on the ten tenant models, index rebuild, per-tournament `Contest.code` and `GlobalSettings` (§3.5) | A |
| B | `User` v2 model, membership model, identity/password services | A |
| C | Auth route changes (`sub`, login resolution, register, Google) + tests | B |
| C2a | **Give `fifth` a working reset channel** — 2Factor credentials or the Resend channel — and verify end to end (§1.1a) | — |
| C2b | ~~Close the reset gate~~ **shipped** — endpoint, schema, orphaned modal and dead API wrapper deleted; `client.ts` structured-error fix (§4.2) | — |
| C2c | Rate limits on the auth routes — `docs/RATE_LIMITING_SPEC.md` | — *(MongoDB-backed; no longer blocked on Redis)* |
| C3 | Email OTP channel: Resend service, dual-channel session, change-email endpoints (§5.2–5.7) | Q8 |
| D | Admin guard split + route mapping + tests | B |
| E | `GET /api/users/me/tournaments`, membership write paths, reconcile job | B |
| F | Frontend: profile section, login copy, `client.ts` error fix (§4.2), slug header, change-email UI | E, C3 |
| G | Migration scripts 00–07 + their tests, including the game-data import (§7, Phase 3) | B, A2 |
| H | Dry run against a **restored copy** of the cluster, review the merge report | G, Q1–Q5 |
| I | Cut over — stand up the one backend, backfill, repoint both frontends, archive the five services (§7, Phase 6) | C, C2b, C3, D, E, F, H |
| J | Remove the legacy-username branch; sweep `legacy_hashes`; archive old collections | I + 8 days / 180 days |

Stages A–G are ordinary development and can proceed now. **H must run against a
restored snapshot, never the live cluster** — the merge report is the artefact you
review before anything irreversible happens.

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
