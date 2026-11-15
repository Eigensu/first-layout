# PostHog: errors, logs and sessions, end to end

Every error, from the browser, the website's server, the API and its scheduled
jobs, goes to one PostHog project, along with the API's logs, pageviews and
session replays. All of it carries the same user id and browser session, so an
API error opens onto the replay of the click that caused it and the log lines
the request wrote.

Nothing is sent until the keys below are set. Without them the code paths are
no-ops and the API logs to the console only.

## What goes where

| Source | Error Tracking | Also |
| --- | --- | --- |
| Browser (posthog-js) | Uncaught errors and promise rejections; React render errors (`app/global-error.tsx`); API calls that fail with a 5xx, time out or get no answer, as `ApiError: API 502: POST /api/contests/:id/enroll` | Pageviews and clicks; a 4xx from the API as an `api_request_failed` event; session replay |
| Website server (Next.js, posthog-node) | Errors while rendering a page or running a route handler (`instrumentation.ts`) | |
| API (FastAPI, posthog-python) | Every exception a request lets escape; every exception logged with `logger.exception(...)` | Every log line at `LOG_LEVEL` and above, to PostHog Logs |
| Scheduled jobs: `scripts/refresh_membership_stats.py` (walle-stats-cron) and `scripts/sync_cricheroes.py` | An exception that ends the run; for the CricHeroes sync, also failed resources and contests (logged at ERROR) | Their log lines |

An `HTTPException` the API raises on purpose (a 401, a 422) is a response, not
an error, and is not captured.

### How the pieces are tied together

- **User.** The website identifies a signed-in user by their id
  (`posthog.identify(user.id)`). The API identifies each request by the id in
  its access token, which is the same id. Nothing else about the person is
  sent, apart from the `is_admin` and `is_platform_admin` flags.
- **Session.** posthog-js adds `X-POSTHOG-SESSION-ID` and
  `X-POSTHOG-DISTINCT-ID` to every call to `NEXT_PUBLIC_API_URL`. The API puts
  them on its exception events (`$session_id`) and its log lines (`sessionId`,
  `posthogDistinctId`), and the website's server reads them from the PostHog
  cookie. PostHog links all of these to the session's replay.
- **Tournament.** Browser events carry the subdomain's tournament slug as
  `tournament`. API events and logs carry the `X-Tournament-Slug` header.
- **Service.** Backend events have `service` set to `backend` (the API),
  `membership-stats` or `cricheroes-sync`, and their logs carry the same
  value as `service.name`, prefixed `walle-`. Website server events have
  `service: frontend-server`.

To follow an error end to end, open the issue in Error Tracking, open the
session on one of its events and watch the replay, then filter Logs by that
`sessionId`.

## Setting it up

1. **Create the PostHog project**, on US Cloud (`https://us.i.posthog.com`) or
   EU Cloud (`https://eu.i.posthog.com`). Copy its project API key, which
   starts with `phc_`. It is a public token: the browser sends it with every
   event.
2. **Vercel (website).** Set these, then redeploy (the host is read at build
   time):
   - `NEXT_PUBLIC_POSTHOG_KEY`: the key.
   - `NEXT_PUBLIC_POSTHOG_HOST`: the host, if not US Cloud.
   - `NEXT_PUBLIC_POSTHOG_SESSION_REPLAY=false` only to turn replay off.
3. **Railway (API).** In the Walle project, on `walle-api` (the shared
   backend) and `second-layout` (the legacy backend on api-lpcl), set:
   - `POSTHOG_API_KEY`: the same key.
   - `POSTHOG_HOST`: the host, if not US Cloud.
   - `LOG_LEVEL` (default `INFO`) and `POSTHOG_ACCESS_LOGS` (default `false`),
     if needed.
4. **Railway (scheduled jobs).** The same `POSTHOG_API_KEY` and
   `POSTHOG_HOST` on `walle-stats-cron`, and on the CricHeroes sync's cron
   service once it exists. All of these deploy from `main`, so nothing is
   sent until this work is merged there.
5. **In PostHog's project settings:**
   - Turn on session replay, which also has to be enabled on the project's
     side.
   - Turn on Logs if the project does not have it yet.
   - Add the site's domains (`wallearena.com` and its subdomains) to the
     authorized URLs, so the toolbar works on them.
   - Consider "Discard client IP data" (see Privacy below).
6. **Check it works.** Load a page and confirm a `$pageview` arrives. Then
   check that the API's startup lines (`CORS exact origins: ...`) show in
   Logs. If a service cannot reach PostHog, it prints
   `[posthog-logs] dropped N log record(s): ...` to its own console.

## Logging levels

The API used to configure logging at `CRITICAL`, which hid every line it
wrote. It now logs at `LOG_LEVEL`, `INFO` by default, both to the console
(Railway's logs) and to PostHog. uvicorn's own lines (startup, shutdown,
"Exception in ASGI application") go to PostHog as well. Its line per request
goes only with `POSTHOG_ACCESS_LOGS=true`: it is most of the volume, and the
API's exception events already carry the request.

## Privacy

PostHog knows people by user id alone: no email, name or mobile number is set
on a person. On top of that:

- **Email addresses and mobile numbers are redacted** (to `[email]` and
  `[mobile]`) from exception messages, log lines, URLs, clicked-element text
  and replayed page text, on both sides (`apps/backend/config/redaction.py`,
  `apps/frontend/src/lib/analytics/redact.ts`). An error can quote whatever it
  failed on: a duplicate-key error names the email that collided.
- **Secrets in URLs are masked** (`[redacted]`): the password-reset `token`,
  the `refresh_token` the API client sends, Google sign-in's `state`, and
  similar.
- **Session replay** masks every input (passwords, OTPs, what people type) and
  runs page text through the same redaction. Other text stays readable, names
  included, so that replays remain useful.
- **IP addresses** are sent, as PostHog's SDKs do by default. Turn on "Discard
  client IP data" in the project settings to drop them. The API's rate-limit
  warnings still log the client IP, because the limiter is tuned from those
  lines (docs/RATE_LIMITING_SPEC.md).
- The test suite never sends anything: `tests/conftest.py` blanks
  `POSTHOG_API_KEY`.

## Implementation notes

- Browser events go through this site at `/ingest` (`next.config.js`
  rewrites), not straight to PostHog, so ad blockers that block PostHog's
  domain do not hide those visitors' errors.
- The API's log handler (`PostHogLogHandler` in
  `apps/backend/config/observability.py`) sends OTLP/JSON to `/i/v1/logs`, in
  batches, from a background thread. It never blocks a request. If its queue
  fills or PostHog refuses a batch, the records are dropped and the drop is
  reported on stderr.
- The PostHog endpoints and payloads were taken from the SDKs' own source
  (posthog-js 1.449, posthog-python 7.91) and tested against a stand-in
  server. The first real deploy is the first time they meet PostHog itself,
  hence step 6.

## Not covered yet

- **Readable browser stack traces.** Production JavaScript is minified, and
  uploading source maps to PostHog needs a personal API key at build time
  (PostHog's `@posthog/nextjs-config`). Errors are still captured and grouped
  without them; their stack frames just point into minified chunks.
- **The mobile app** lives in another repository.
