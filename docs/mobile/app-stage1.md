Technical Spec: Phase 1 - Shared Packages Extraction
Objective
Refactor the monorepo to support code sharing between the existing web app (apps/frontend) and the future mobile app (apps/mobile). This involves creating two new workspace packages: @fantasy11/types and @fantasy11/utils.

Context
Repository Type: Turborepo + pnpm workspaces.

Naming Convention: @fantasy11/* scope.

Current State: Types are currently isolated in apps/frontend/src/types.

Target State: Types and pure logic are hosted in packages/ and consumed by apps.

Execution Steps
Step 1: Configure Workspace for New Packages
Action: Ensure the monorepo build system recognizes the new additions.

Verify pnpm-workspace.yaml:

Ensure it includes packages/*. (Likely already done, but verify).

Verify turbo.json:

Ensure the build pipeline includes the new packages if they require a build step (TypeScript transpilation).

Step 2: Create @fantasy11/types Package
Action: Initialize the shared types package.

Create Directory: packages/types

Initialize package.json:

Name: @fantasy11/types

Version: 0.0.0

Main: ./src/index.ts (or ./dist/index.js if building) -> Recommendation: Use src/index.ts directly for internal monorepo simplicity.

DevDependencies: typescript, eslint.

Create tsconfig.json:

Extend the root or base tsconfig.

Set compilerOptions: { "composite": true, "declaration": true }.

Migrate Source Files:

Copy apps/frontend/src/types/auth.ts -> packages/types/src/auth.ts

Copy apps/frontend/src/types/leaderboard.ts -> packages/types/src/leaderboard.ts

Copy apps/frontend/src/types/sponsor.ts -> packages/types/src/sponsor.ts

(Check for other generic types in apps/frontend/src/types and migrate them).

Create Entry Point (packages/types/src/index.ts):

Export all types:

TypeScript

export * from './auth';
export * from './leaderboard';
export * from './sponsor';
Step 3: Create @fantasy11/utils Package
Action: Initialize the shared logic package.

Create Directory: packages/utils

Initialize package.json:

Name: @fantasy11/utils

Version: 0.0.0

Main: ./src/index.ts

Create tsconfig.json:

Similar configuration to packages/types.

Create Placeholder Logic:

Create packages/utils/src/index.ts.

Add a simple validation function (e.g., isValidTeamSize) to test the setup.

Note: Detailed fantasy logic migration will happen in later phases, this step creates the container.

Step 4: Consume Packages in Frontend
Action: Refactor apps/frontend to use the new shared packages.

Update Dependencies (apps/frontend/package.json):

Add: "@fantasy11/types": "workspace:*"

Add: "@fantasy11/utils": "workspace:*"

Install: Run pnpm install from root.

Refactor Imports:

Find: import ... from "@/types/auth" or import ... from "../types/auth"

Replace with: import ... from "@fantasy11/types"

Repeat for leaderboard and sponsor.

Verify:

Run pnpm build --filter @fantasy11/frontend to ensure no type errors exist.

Step 5: Setup Mobile App to Consume Packages
Action: Prepare the mobile app to receive these types.

Update Dependencies (apps/mobile/package.json):

Add: "@fantasy11/types": "workspace:*"

Add: "@fantasy11/utils": "workspace:*"

Add: "@fantasy11/constants": "workspace:*" (if not already added).

Add: "@fantasy11/env-config": "workspace:*" (if not already added).

Install: Run pnpm install from root.

Configure Metro (apps/mobile/metro.config.js):

Critical: Ensure Metro bundler is configured to resolve files from ../../packages and ../../node_modules. (Use the configuration provided in the previous plan).

Acceptance Criteria
packages/types exists and contains auth.ts, leaderboard.ts, and sponsor.ts.

packages/utils exists with a valid package.json.

apps/frontend builds successfully while importing types from @fantasy11/types.

apps/mobile dependencies include the new workspaces.

pnpm install runs without errors at the root level.