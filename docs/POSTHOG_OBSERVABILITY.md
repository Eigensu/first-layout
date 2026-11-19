# PostHog: errors, logs and sessions, end to end

Every error goes to one PostHog project, whether it comes from the browser,
the website's server, the API or the API's scheduled jobs. The API's logs,
the website's pageviews and session replays go there too. All of it carries
the same user id and browser session, so an API error leads to the replay of
the click that caused it and to the log lines its request wrote.

Nothing is sent until the keys below are set. Without them the code paths do
nothing, and the API logs to the console only.

## What goes where

| Source | Error Tracking | Also |
| --- | --- | --- |
| Browser (posthog-js) | Uncaught errors and promise rejections. React render errors (`app/global-error.tsx`). API calls that fail with a 5xx, time out or get no answer, as `ApiError: API 502: POST /api/contests/:id/enroll` | Pageviews and clicks. Product events (`user_logged_in`, `team_created`, `contest_enrolled` and others). A 4xx from the API, as an `api_request_failed` event. Session replay. A few auth log lines, to PostHog Logs |
| Website server (Next.js, posthog-node) | Errors while rendering a page or running a route handler (`src/instrumentation.ts`) | |
| API (FastAPI, posthog-python) | Every exception that a request lets escape. Every exception logged with `logger.exception(...)` | Every log line at `LOG_LEVEL` and above, to PostHog Logs |
| Scheduled jobs: `scripts/refresh_membership_stats.py` (walle-stats-cron) and `scripts/sync_cricheroes.py` | An exception that ends the run. For the CricHeroes sync, also failed resources and contests (logged at ERROR) | Their log lines |

The API sometimes raises an `HTTPException` on purpose (a 401, a 422). That is
a response, not an error, so it is not captured.

### Where the website sets up PostHog

`apps/frontend/instrumentation-client.ts` calls `posthog.init` once, before
the app hydrates. The PostHog wizard wrote it (PR #98). Next.js finds it at
the app's root because `src/` has no file of that name. Do not add a second
one in `src/`, because Next.js would load that one instead.

It spreads in `observabilityOptions()` from `src/lib/analytics/posthog.ts`,
which adds the redaction and the tracing headers described below. The same
module tags events with the tournament and reports failed API calls
(`src/lib/api/client.ts`). Identification is in `src/contexts/AuthContext.tsx`.

### How the pieces are tied together

- **User.** The website identifies a signed-in user by their id
  (`posthog.identify(user.id, ...)` in `AuthContext.tsx`). The API identifies
  each request by the id in its access token, which is the same id. The API
  sends nothing else about the person. The website also sets the person's
  email, name, username, `auth_provider`, `is_admin` and `is_platform_admin`
  (see Privacy).
- **Session.** posthog-js adds `X-POSTHOG-SESSION-ID` and
  `X-POSTHOG-DISTINCT-ID` to every call to `NEXT_PUBLIC_API_URL`
  (`tracing_headers`). The API puts them on its exception events
  (`$session_id`) and on its log lines (`sessionId`, `posthogDistinctId`). The
  website's server reads them from the PostHog cookie. PostHog links all of
  these to the session's replay.
- **Tournament.** Browser events carry the subdomain's tournament slug as
  `tournament`. API events and logs carry the `X-Tournament-Slug` header.
- **Service.** Backend events have `service` set to `backend` (the API),
  `membership-stats` or `cricheroes-sync`. Their logs carry the same value as
  `service.name`, with the prefix `walle-`. Website server events have
  `service: frontend-server`. The browser's own log lines have
  `service.name` set to `fantasy11-frontend`.

To follow an error end to end:

1. Open the issue in Error Tracking.
2. Open the session on one of its events and watch the replay.
3. Filter Logs by that `sessionId`.

## Setting it up

1. **The PostHog project** is on US Cloud (`https://us.i.posthog.com`). Its
   project API key starts with `phc_`. It is a public token: the browser sends
   it with every event.
2. **Vercel (website, the walle-web project).** These are set, and production
   has used them since 2026-11-19. Redeploy after you change either one,
   because they are read at build time:
   - `NEXT_PUBLIC_POSTHOG_KEY`: the key.
   - `NEXT_PUBLIC_POSTHOG_HOST`: the host. It is required: without it the
     website sends nothing (and throws an error in development).
3. **Railway (API).** In the Walle project, set these on `walle-api`:
   - `POSTHOG_API_KEY`: the same key.
   - `POSTHOG_HOST`: the host. It is optional, and the default is US Cloud.
   - `LOG_LEVEL` (default `INFO`) and `POSTHOG_ACCESS_LOGS` (default `false`),
     if needed.
4. **Railway (scheduled jobs).** Set the same `POSTHOG_API_KEY` and
   `POSTHOG_HOST` on `walle-stats-cron`. That service reads its values from
   `walle-api` by reference, so add them as references too. Do the same on
   the CricHeroes sync's cron service once it exists. All of these deploy
   from `main`, so nothing is sent until this work is merged there.
5. **In PostHog's project settings:**
   - Turn on session replay. The project must also have it turned on.
   - Turn on Logs if the project does not have it yet.
   - Add the site's domains (`wallearena.com` and its subdomains) to the
     authorized URLs, so that the toolbar works on them.
   - Consider "Discard client IP data" (see Privacy below).
6. **Check that it works.** Load a page and confirm that a `$pageview`
   arrives. Then check that the API's startup lines (`CORS exact origins:
   ...`) show in Logs. If a service cannot reach PostHog, it prints
   `[posthog-logs] dropped N log record(s): ...` to its own console.

## Logging levels

The API used to configure logging at `CRITICAL`, which hid every line it
wrote. It now logs at `LOG_LEVEL`, `INFO` by default, to the console
(Railway's logs) and to PostHog. uvicorn's own lines (startup, shutdown,
"Exception in ASGI application") go to PostHog too. uvicorn's line for each
request goes only when `POSTHOG_ACCESS_LOGS=true`. Those lines are most of
the volume, and the API's exception events already carry the request.

The HTTP client libraries (`httpx`, `httpcore`, `urllib3`) log at `WARNING`
and above, whatever `LOG_LEVEL` is. At `INFO` httpx logs every request's
full URL, and 2Factor's URLs carry its API key and the OTP being checked.

## Privacy

- **Email addresses and mobile numbers are redacted** (to `[email]` and
  `[mobile]`) from exception messages, log lines, URLs, clicked-element text
  and replayed page text. The browser and the API both do this
  (`apps/frontend/src/lib/analytics/redact.ts`,
  `apps/backend/config/redaction.py`). This matters because an error can
  quote whatever it failed on: a duplicate-key error names the email that
  collided.
- **Secrets in URLs are masked** (to `[redacted]`). These include the
  password-reset `token`, the `refresh_token` that the API client sends, and
  Google sign-in's `state`.
- **Session replay** masks every input (passwords, OTPs, what people type)
  and runs page text through the same redaction. Other text, names included,
  stays readable, so that replays remain useful.
- **The person profile is not redacted.** The website sets the signed-in
  user's email, name and username on their PostHog person
  (`identifyUser` in `AuthContext.tsx`). To keep PostHog to user ids alone,
  remove those three properties there. The API never sets them.
- **IP addresses** are sent, as PostHog's SDKs do by default. To drop them,
  turn on "Discard client IP data" in the project settings. The API's
  rate-limit warnings still log the client IP, because the limiter is tuned
  from those lines (docs/RATE_LIMITING_SPEC.md).
- **The test suites never send anything.** `tests/conftest.py` blanks
  `POSTHOG_API_KEY`, and the frontend tests mock posthog-js and posthog-node.

## Implementation notes

- The browser sends events straight to `NEXT_PUBLIC_POSTHOG_HOST`. Ad
  blockers that block PostHog's domain therefore hide those visitors'
  events, their errors included (see Not covered yet).
- The API's log handler (`PostHogLogHandler` in
  `apps/backend/config/observability.py`) sends OTLP/JSON to `/i/v1/logs` in
  batches, from a background thread. It never blocks a request. If its queue
  fills, or if PostHog refuses a batch, the records are dropped and the drop
  is reported on stderr.
- The PostHog endpoints and payloads come from the SDKs' own source
  (posthog-js 1.449, posthog-python 7.91), and were tested against a
  stand-in server. The first real deploy is the first time the backend meets
  PostHog itself, which is why step 6 is there.

## Not covered yet

- **A reverse proxy for browser events.** Sending them through this site
  (an `/ingest` rewrite in `next.config.js`, and `api_host: "/ingest"`)
  would get past ad blockers. It also needs `skipTrailingSlashRedirect`,
  which changes how every URL on the site handles a trailing slash, and an
  exclusion in the middleware's matcher.
- **Readable browser stack traces.** Production JavaScript is minified.
  Uploading source maps to PostHog needs a personal API key at build time
  (PostHog's `@posthog/nextjs-config`). Errors are still captured and grouped
  without source maps, but their stack frames point into minified chunks.
- **The mobile app** lives in another repository.
