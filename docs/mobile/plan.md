
Phase 0: Project Architecture & Monorepo Wiring

0.1 Directory Structure

Target layout:

apps/
  frontend/          # existing web app
  mobile/            # new Expo app
packages/
  api-client/        # shared axios + API helpers
  types/             # shared TS types & schemas
  utils/             # fantasy logic & helpers
  ui-native/         # shared React Native UI primitives

Tasks
	•	Create apps/mobile with Expo:

npx create-expo-app apps/mobile


	•	Ensure monorepo tooling (Turborepo / pnpm / Yarn workspaces) includes apps/mobile and packages/*.
	•	Configure TS path aliases so both apps can do:

import { User } from "@fantasy11/types";



⸻

Phase 1: Shared Logic & Types Extraction (Suggestion 1)

1.1 packages/types

Move your shared types from apps/frontend/src/types/ to packages/types:
	•	auth.ts, leaderboard.ts, contest.ts, etc.
	•	Any zod/OpenAPI-generated schemas.

Tasks
	•	Create packages/types/src and move reusable types there.
	•	Add packages/types/src/index.ts that re-exports everything.
	•	Update web imports from ../types/... → @fantasy11/types.
	•	Use the same imports in mobile.

1.2 packages/utils – Fantasy Logic

Put all the “game rules” here:
	•	Credit calculation.
	•	Role validation (WK/BAT/AR/BWL).
	•	Per-team player limits.
	•	Helper like canSelectPlayer(currentTeamState, candidatePlayer) returning either ok or a specific error type.

Tasks
	•	Move existing helpers from apps/frontend → packages/utils.
	•	Add Jest tests for:
	•	Credit caps.
	•	Role constraints.
	•	Per-team limits.
	•	Captain/VC rules, if present.

⸻

Phase 2: Mobile App Setup & Foundation

2.1 Expo + NativeWind + Tailwind

Tasks
	•	In apps/mobile:

npm install nativewind tailwindcss
npx tailwindcss init


	•	Configure tailwind.config.js with correct content paths (pointing at apps/mobile and packages/ui-native).
	•	Set up NativeWind per docs (may need NativeWindStyleSheet depending on version).

2.2 Navigation Setup

Use React Navigation. Target structure:
	•	AuthStack
	•	Login
	•	Register
	•	(Optional) ForgotPassword / OTP
	•	App Tabs
	•	Home (Contests)
	•	MyContests
	•	Wallet / Transactions (optional)
	•	Profile
	•	Nested Screens
	•	ContestDetail
	•	TeamCreation
	•	CaptainVcSelection (modal / screen)
	•	Leaderboard
	•	TeamPreview

Tasks
	•	Install React Navigation + deps.
	•	Create AppNavigator.tsx:
	•	If isAuthenticated → Tab navigator.
	•	Else → Auth stack.
	•	Implement a simple protected route pattern using auth state.

2.3 packages/ui-native – Shared UI Kit

Components:
	•	Button, Card, Input, Chip, Badge, ScreenContainer, etc.

Tasks
	•	Define color palette (reuse brand from web).
	•	Implement base components using NativeWind classes.
	•	Import and use these from day 1 in apps/mobile to keep UI consistent.

⸻

Phase 3: Networking & Auth Infrastructure

3.1 Smart API Client (packages/api-client) – includes Suggestion 2

Create a shared Axios client that handles:
	•	Base URL via env plus smart defaults for local dev:
	•	Web: localhost:8000
	•	Android emulator: 10.0.2.2:8000
	•	iOS simulator: localhost:8000
	•	Auth headers.
	•	Refresh-on-401 logic.

Base URL helper:

// packages/api-client/src/config.ts
import { Platform } from "react-native";

const getDefaultBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === "android") return "http://10.0.2.2:8000";
    return "http://localhost:8000";
  }
  return "https://api.yourdomain.com";
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? getDefaultBaseUrl();

Tasks
	•	Install Axios in packages/api-client.
	•	Create apiClient.ts:
	•	Use API_BASE_URL.
	•	Request interceptor → attach Authorization: Bearer <accessToken> passed in somehow (e.g., via a token getter, or injecting per call).
	•	Response interceptor:
	•	On 401 → call /api/auth/refresh with refreshToken from SecureStore.
	•	If success → update access token, retry original request.
	•	If fail → trigger logout.

You can expose hooks or functions like login, getContests, getLeaderboard that are thin wrappers over Axios.

3.2 Auth State & Token Persistence (Suggestion 3)

Tech:
	•	expo-secure-store for refreshToken.
	•	Zustand or React Context for:
	•	user
	•	accessToken (in memory)
	•	isAuthenticated

Flow:
	•	On login:
	•	POST /api/auth/login → { accessToken, refreshToken, user }.
	•	SecureStore.setItemAsync("refresh_token", refreshToken).
	•	authStore.setState({ accessToken, user, isAuthenticated: true }).
	•	On app start (bootstrap):
	•	Get refreshToken from SecureStore.
	•	If exists:
	•	Call /api/auth/refresh.
	•	On success → set new accessToken and call /api/users/me.
	•	On failure → clear SecureStore and go to Login.

Tasks
	•	Implement useAuthStore (Zustand) or AuthContext.
	•	Add login(), logout(), bootstrap() methods.
	•	Call bootstrap() once in App.tsx and show a loading/splash screen while it runs.

3.3 Error Handling & Toasts

Tasks
	•	Define a normalized error type (AppError).
	•	Implement a global toast/snackbar (small overlay):
	•	Network offline.
	•	Server errors.
	•	Session expired.
	•	Use in React Query’s onError handlers and Axios interceptors.

⸻

Phase 4: Core Feature Development

4.1 Auth Screens

Screens:
	•	Login
	•	Register

Endpoints:
	•	POST /api/auth/login
	•	POST /api/auth/register

Tasks
	•	Use react-hook-form (+ optional zod) for both.
	•	On success → store tokens via useAuthStore + SecureStore.
	•	Navigate to main tabs.
	•	Show proper error messages for incorrect credentials / taken email, etc.

4.2 Home / Contests List

Screens:
	•	Home – all/public contests.
	•	MyContests – user’s enrolled contests.

Endpoints:
	•	GET /api/contests
	•	GET /api/contests/enrollments/me

Tasks
	•	Use FlatList or FlashList for performance.
	•	Filter chips: All / Upcoming / Live / Completed.
	•	Contest card:
	•	Match name, teams, start time, entry fee, prize pool, status.
	•	CTA:
	•	Upcoming & not joined → “Join”.
	•	Upcoming & joined → “Edit Team”.
	•	Live/completed → “View Team” / “Leaderboard”.
	•	Tap → navigate to ContestDetail.

4.3 Contest Detail

Shows:
	•	Core contest info.
	•	Rules summary.
	•	User’s team state (no team / team created).
	•	Prize breakdown.

Tasks
	•	Endpoint: GET /api/contests/{id}.
	•	Buttons:
	•	If not joined: “Join & Create Team”.
	•	If joined (and editable): “Edit Team”.
	•	“View Leaderboard” for live/completed.

4.4 Team Creation (Main Complexity)

Screens:
	•	TeamCreation
	•	CaptainVcSelection

Endpoints:
	•	GET /api/contests/{id}/players (or your equivalent).
	•	POST /api/teams.

UI:
	•	Tabs/segments: WK | BAT | AR | BWL.
	•	Each tab: list of players with name, team, credits, key stats.
	•	Sticky bottom bar:
	•	Players: X / 11
	•	Credits left: Y
	•	Per-team counts.

Tasks
	•	Fetch and cache player list via React Query.
	•	Keep selected player IDs/objects in local state or Zustand.
	•	Use packages/utils to:
	•	Validate each selection (canSelectPlayer).
	•	Calculate remaining credits and counts.
	•	After exactly 11 players selected → move to CaptainVcSelection.
	•	On final confirmation → POST /api/teams and handle success/fail.

4.5 Leaderboard

Screen:
	•	Leaderboard

Endpoint:
	•	GET /api/contests/{id}/leaderboard?skip=0&limit=50

Tasks
	•	FlatList with infinite scroll using onEndReached.
	•	Rows: rank, username, team name, points.
	•	“View Team” → team preview screen.
	•	Optional “Jump to my rank” (scroll or fetch my entry index).

4.6 My Contests & Profile

My Contests:
	•	Group by status: Upcoming / Live / Completed.

Profile:
	•	Shows user info.
	•	Logout.
	•	(Optional) Settings: notifications, theme, etc.

Tasks
	•	Use /me and relevant contest enrollment endpoints.
	•	logout() clears SecureStore + auth store + navigates to AuthStack.

⸻

Phase 5: Advanced Features

5.1 Push Notifications

Use Expo Notifications.

Tasks
	•	Ask permission and get Expo push token on login / app start.
	•	Send token to backend via /api/devices or similar.
	•	Backend:
	•	Cron/scheduler to send “match starting soon” notifications.
	•	Notifications for result / winnings.

5.2 Deep Linking

Use cases:
	•	walle://contest/:id → open ContestDetail.
	•	Shared invite/referral links.

Tasks
	•	Configure deep links in app.config / app.json and React Navigation linking config.
	•	Test:
	•	Cold start (app closed).
	•	Warm start (app in background).

5.3 Analytics & Error Monitoring

Tasks
	•	Integrate Sentry (or similar).
	•	Track:
	•	Screen views (Home, ContestDetail, TeamCreation, Leaderboard).
	•	Funnel steps: login → view contest → create team → join.
	•	Use data to tweak UX, identify drop-off points.

⸻

Phase 6: Testing Strategy

6.1 Unit Tests

Targets:
	•	packages/utils (game rules).
	•	Hooks like useTeamSelection, useAuth.

Tasks
	•	Setup Jest for monorepo.
	•	Write tests for:
	•	Role constraints.
	•	Credit calculations.
	•	Player selection logic.

6.2 Integration Tests (React Native Testing Library)

Targets:
	•	Auth screens.
	•	Team creation interactions.

Tasks
	•	Render screens.
	•	Simulate typing, button presses.
	•	Mock API calls (Axios) and assert navigation + state changes.

6.3 E2E Tests (Maestro)

Scenarios:
	•	Flow 1: Open app → Login → Join Contest → Create Team → Submit.
	•	Flow 2: App with existing session → My Contests → Leaderboard → View Team.
	•	Flow 3: Token expiry → 401 → refresh → retry → success / redirect to login.

Tasks
	•	Set up Maestro with YAML flows.
	•	Run against a dev/staging backend with seeded data.

6.4 Manual QA

Tasks
	•	Test on:
	•	Android emulator + at least one real device.
	•	iOS simulator + ideally one real iPhone.
	•	Verify:
	•	Layout on small & large screens.
	•	Behavior on poor network / offline.
	•	Countdown behavior around match start times.

⸻

Phase 7: Deployment & Release (EAS + Optional CI/CD)

7.1 EAS Config

Tasks
	•	Configure app.json / app.config:
	•	App name, slug, icons, splash.
	•	Bundle ID (iOS) & package name (Android).
	•	Create eas.json with profiles:
	•	development – local dev builds.
	•	preview – TestFlight / internal track.
	•	production – app store release.

7.2 Build & Store Submission

Tasks
	•	Preview build:

eas build --profile preview --platform all


	•	Distribute preview:
	•	iOS → TestFlight.
	•	Android → Internal testing track on Google Play.
	•	Collect feedback, fix issues.
	•	Production build:

eas build --profile production --platform all


	•	Submit:

eas submit --profile production --platform ios
eas submit --profile production --platform android



7.3 OTA Updates with EAS Update

Tasks
	•	For JS-only changes:

eas update --branch production --message "Fix leaderboard UI"


	•	For native dependency changes: create a new eas build (no OTA).

7.4 Compliance & Policies

Tasks
	•	Add in-app screens/links for Privacy Policy & Terms of Service.
	•	Ensure app + store listing follow fantasy gaming laws/rules in your region.
	•	Add age/region gating if required.

7.5 Optional: GitHub CI/CD with EAS

If you want CI:
	•	Create an EAS token (eas token:create) and store as EAS_TOKEN in GitHub secrets.
	•	Add .github/workflows/eas-build.yml to:
	•	Run tests.
	•	Call eas build / eas update for specific branches/tags.

⸻

Suggested Milestones (Execution Order)
	1.	Monorepo & shared packages (types, utils, api-client, ui-native).
	2.	Mobile skeleton (Expo app compiles + navigation + theme).
	3.	Auth flow (login/register + token persistence).
	4.	Home + Contests list + Contest detail.
	5.	Team creation + C/VC + submit.
	6.	Leaderboard + My Contests + Profile.
	7.	Push notifications + deep linking + analytics.
	8.	Testing (unit, integration, Maestro) + performance tuning.
	9.	EAS preview builds → tester feedback → production release.

