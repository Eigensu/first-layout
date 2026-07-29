# Tournament Subdomains — Admin-Created Tournaments

One app, many subdomains. Every tournament lives at `<slug>.wallearena.com`
(e.g. `dpcl.wallearena.com`), and an admin creates one from **Admin →
Tournaments → New Tournament**. After the one-time setup below, creating a
tournament touches **no infrastructure at all** — no GoDaddy, no Railway
variables, no new deployments. It is a database row.

## The decision: no new portal, no per-tournament deployments

Two questions came up; here are the answers this implementation commits to:

1. **"Should we make a new portal?" — No.** The existing admin panel (on the
   root domain) gained a *Tournaments* tab. A separate portal would duplicate
   auth, UI, and deployment for no benefit.
2. **"We have to update the Railway variables for the new tournament" — Not
   anymore.** That was true because each tournament got its own backend
   service (`api-m11`, `api-lpcl`, `fifth-api`, …), each with its own
   `CORS_ORIGINS`, DB name, and domain. The target is **one** frontend and
   **one** backend shared by all tournaments. Railway variables are set once
   (with a wildcard) and never touched again.

## How it works

```
fan visits dpcl.wallearena.com
        │
        ▼
Next.js middleware (apps/frontend/src/middleware.ts)
  - extracts "dpcl" from the Host header
  - ignores apex/www, reserved names, api-* hosts, Vercel previews, localhost
  - rewrites /  →  /t/dpcl   and tags the request with x-tournament-slug
        │
        ▼
/t/[slug] page  →  GET /api/tournaments/by-slug/dpcl  (backend registry)
  - 200 → branded landing page (name, logo, colors, dates, status)
  - 404 (unknown or archived) → "tournament not found" page
```

Backend pieces:

- `Tournament` model (`apps/backend/app/models/tournament.py`) — the registry,
  one document per tournament, `slug` unique.
- Admin CRUD: `POST/GET/PUT/DELETE /api/admin/tournaments` plus
  `GET /api/admin/tournaments/check-slug/{slug}` for the live availability
  check in the create form. Admin-only (`get_admin_user`).
- Public resolution: `GET /api/tournaments/by-slug/{slug}` and
  `GET /api/tournaments` (non-archived list). No auth.

Slug rules (enforced in both backend and admin form):

- 3–32 chars, lowercase letters/numbers/hyphens, must start and end with a
  letter or number (`^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`).
- Reserved: `www app api admin mail cdn staging dev test docs status assets
  static blog help support portal smtp imap ftp`.
- `api-*` and `*-api` are rejected (those are backend hostnames).
- Kept in sync between `apps/backend/app/common/consts/index.py` and
  `apps/frontend/src/common/consts/tournament.ts`.

Statuses: `draft` (subdomain resolves, shows "Coming Soon"), `live`,
`completed`, `archived` (subdomain returns 404; the record is kept and can be
un-archived by setting status back).

## One-time infrastructure setup (do once, never per tournament)

### 1. DNS wildcard (GoDaddy)

Keep the existing apex record for `wallearena.com`, then add one record so
all subdomains hit the frontend:

| Type  | Name | Value                  | TTL |
| ----- | ---- | ---------------------- | --- |
| CNAME | `*`  | `cname.vercel-dns.com` | 600 |

(or `A * → your server IP` if not on Vercel). The `*` only catches
subdomains — the apex record keeps serving `wallearena.com` itself.

**If you take Option A or B below, the nameservers move and the wildcard
record is managed there instead — read those first before editing GoDaddy.**

### 2. TLS certificate for `*.wallearena.com` — pick ONE

DNS is the easy half; the wildcard certificate is what actually gates this.

- **Option A — frontend on Vercel (current setup):** wildcard domains on
  Vercel require the domain's nameservers to point at Vercel (DNS-01
  challenge) and a Pro plan. Domain stays registered at GoDaddy; only the
  nameservers change. Then add `wallearena.com` and `*.wallearena.com` to the
  frontend project. Re-create the `api.wallearena.com` (and any legacy
  `api-*`) DNS records inside Vercel DNS so the backend keeps resolving.
- **Option B — Cloudflare in front (least effort, free):** move nameservers
  to Cloudflare (registration stays at GoDaddy), enable the proxied wildcard
  record; Cloudflare's Universal SSL covers `*.wallearena.com` automatically.
- **Option C — self-hosted/VPS:** Caddy with a DNS plugin issues the wildcard
  automatically.

Until one of these is done, `dpcl.wallearena.com` resolves but browsers show
a certificate warning — that is expected and is not something the app can fix.

### 3. Railway (backend) — the last variable edit you'll make

One backend service (call it `api.wallearena.com`) serves every tournament.
Set once:

```
CORS_ORIGINS=https://wallearena.com,https://www.wallearena.com,https://*.wallearena.com
```

`config/settings.py` already converts `*` entries into an origin regex
(`cors_origin_regex`), so every current and future subdomain is allowed with
no further changes. **This replaces the per-tournament CORS/variable edits.**

### 4. Vercel (frontend) environment

```
NEXT_PUBLIC_API_URL=https://api.wallearena.com   # the one shared backend
NEXT_PUBLIC_ROOT_DOMAIN=wallearena.com           # optional; this is the default
```

## Per-tournament flow (after setup)

1. Admin panel → **Tournaments** → **New Tournament**.
2. Type the name; the slug auto-fills and is checked live for validity,
   reserved names, and collisions. The form shows the exact URL
   (`<slug>.wallearena.com`).
3. Save. The subdomain is live immediately (draft = "Coming Soon" page; set
   status to Live when ready). Archive from the same screen to turn it off.

That's the whole flow. Nothing else to provision.

## Migrating the existing per-tournament deployments

`api-m11`, `api-lpcl`, `fifth-api`, `walle-third.eigensu.in` keep working —
the middleware explicitly ignores `api-*`/`*-api` hosts, and nothing in this
change touches those services. To fold them in over time:

1. Register each existing tournament in the admin panel with its real slug.
   For ones still served by their own Railway backend, set the **Advanced →
   API Base URL** field (e.g. `https://api-lpcl.wallearena.com`) so the
   registry records where that tenant's data lives.
2. New tournaments: leave API Base URL empty — they use the shared backend.
3. When a legacy tournament ends (or you migrate its Mongo data into the
   shared cluster), archive its Railway service. Goal state: one Railway
   service, zero per-tournament variables.

> Note on data: tournament-scoped *data* isolation today comes from each
> legacy deployment having its own database. The shared backend currently has
> one database, so contests/teams/players there are shared across subdomains.
> Scoping those collections by tournament (adding `tournament_id`, using the
> `x-tournament-slug` header the middleware already forwards) is the natural
> next step once tournaments run on the shared backend.

## Local development

- Backend + frontend running locally → create a tournament with slug `dpcl`
  in the admin panel, then open **http://dpcl.localhost:3000** — browsers
  resolve `*.localhost` to 127.0.0.1, so the middleware and landing page work
  without any DNS setup.
- The landing page is also reachable as `/t/dpcl` on any host, which is handy
  before DNS/certs exist in production.
