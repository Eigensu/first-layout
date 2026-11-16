# Stage 1 Implementation Spec: Shared Packages Extraction

## Overview
This document provides a step-by-step implementation guide for Phase 1 of the mobile app development plan. We'll extract shared types and utilities from the frontend app into reusable packages that both web and mobile apps can consume.

## Current State Analysis

### Existing Structure
```
walle-arena/
├── apps/
│   ├── frontend/          # Next.js web app
│   └── backend/           # Python FastAPI backend
├── packages/
│   ├── constants/         # ✅ Already exists
│   └── env-config/        # ✅ Already exists
```

### What Needs to be Created
- `packages/types` - Shared TypeScript types
- `packages/utils` - Shared business logic and utilities
- `apps/mobile` - Expo mobile app (Phase 2)

### Files to Migrate
From `apps/frontend/src/types/`:
- `auth.ts` - User, auth tokens, login/register types
- `leaderboard.ts` - Leaderboard entry types
- `sponsor.ts` - Sponsor tier and filter types

From `apps/frontend/src/` (future phases):
- `hooks/useTeamBuilder.ts` - Team selection logic
- `common/utils/` - Utility functions
- Fantasy game rules (credit limits, role constraints, etc.)

---

## Implementation Steps

### Step 1: Create `@walle/types` Package

#### 1.1 Create Directory Structure
```bash
mkdir -p packages/types/src
```

#### 1.2 Create `packages/types/package.json`
```json
{
  "name": "@walle/types",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist .turbo node_modules"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.3",
    "eslint": "8.57.0"
  }
}
```

#### 1.3 Create `packages/types/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### 1.4 Copy Type Files
Copy the following files from `apps/frontend/src/types/` to `packages/types/src/`:
- `auth.ts`
- `leaderboard.ts`
- `sponsor.ts`

#### 1.5 Create Entry Point `packages/types/src/index.ts`
```typescript
// Re-export all types for easy consumption
export * from './auth';
export * from './leaderboard';
export * from './sponsor';
```

---

### Step 2: Create `@walle/utils` Package

#### 2.1 Create Directory Structure
```bash
mkdir -p packages/utils/src
```

#### 2.2 Create `packages/utils/package.json`
```json
{
  "name": "@walle/utils",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist .turbo node_modules"
  },
  "dependencies": {
    "@walle/types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.3",
    "eslint": "8.57.0"
  }
}
```

#### 2.3 Create `packages/utils/tsconfig.json`
Same as `packages/types/tsconfig.json`

#### 2.4 Create Placeholder Logic `packages/utils/src/index.ts`
```typescript
/**
 * Shared utility functions for Wall-E app
 * This package will contain game rules, validation logic, and helper functions
 */

/**
 * Validates if a team has the correct number of players
 * @param playerCount - Number of players in the team
 * @returns true if valid, false otherwise
 */
export function isValidTeamSize(playerCount: number): boolean {
  return playerCount === 11;
}

/**
 * Validates if total credits are within the allowed limit
 * @param totalCredits - Sum of all player credits
 * @param maxCredits - Maximum allowed credits (default: 100)
 * @returns true if within limit, false otherwise
 */
export function isWithinCreditLimit(
  totalCredits: number,
  maxCredits: number = 100
): boolean {
  return totalCredits <= maxCredits;
}

// Future additions:
// - Role validation (WK/BAT/AR/BWL constraints)
// - Per-team player limits
// - Captain/Vice-captain validation
// - Team selection helpers
```

---

### Step 3: Update Frontend to Use Shared Packages

#### 3.1 Update `apps/frontend/package.json`
Add dependencies (and ensure existing packages use `workspace:*`):
```json
{
  "dependencies": {
    "@walle/types": "workspace:*",
    "@walle/utils": "workspace:*",
    "@walle/constants": "workspace:*",
    "@walle/env-config": "workspace:*",
    // ... existing dependencies
  }
}
```

**Note:** Verify that `@walle/constants` and `@walle/env-config` are using `workspace:*` protocol for consistency. This ensures all workspace packages use the same versioning approach.

#### 3.2 Install Dependencies
```bash
cd walle-arena
pnpm install
```

#### 3.3 Update Import Statements in Frontend

**Files to update:**
- `apps/frontend/src/contexts/AuthContext.tsx`
- `apps/frontend/src/components/auth/*`
- `apps/frontend/src/app/auth/*`
- `apps/frontend/src/components/leaderboard/*`
- `apps/frontend/src/app/leaderboard/*`
- `apps/frontend/src/components/sponsors/*`
- `apps/frontend/src/app/sponsors/*`
- Any other files importing from `@/types/auth`, `@/types/leaderboard`, or `@/types/sponsor`

**Find and replace:**
- `import { ... } from '@/types/auth'` → `import { ... } from '@walle/types'`
- `import { ... } from '@/types/leaderboard'` → `import { ... } from '@walle/types'`
- `import { ... } from '@/types/sponsor'` → `import { ... } from '@walle/types'`

#### 3.4 Update `apps/frontend/next.config.js` (CRITICAL)

**Why this is needed:** Next.js excludes `node_modules` from compilation by default. Since our packages export raw TypeScript files (`src/index.ts`) instead of compiled JavaScript, Next.js will throw errors when importing from `@walle/types` or `@walle/utils` unless we explicitly tell it to transpile these packages.

Add the `transpilePackages` configuration:

```javascript
const path = require("path");
const { config } = require("dotenv");

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, "../../.env");
config({ path: rootEnvPath });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // CRITICAL: Transpile workspace packages so Next.js can compile their TypeScript
  transpilePackages: [
    "@walle/types",
    "@walle/utils",
    "@walle/constants",
    "@walle/env-config"
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "drive.google.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NEXT_PUBLIC_API_URL
            ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api/:path*`
            : "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  devIndicators: {
    position: "bottom-right",
  },
};

module.exports = nextConfig;
```

**Note:** We're also including the existing `@walle/constants` and `@walle/env-config` packages to ensure they work correctly if they export TypeScript files.

#### 3.5 Remove Old Type Files
After confirming all imports work:
```bash
rm apps/frontend/src/types/auth.ts
rm apps/frontend/src/types/leaderboard.ts
rm apps/frontend/src/types/sponsor.ts
```

Keep the `types` directory if other types remain, otherwise remove it.

---

### Step 4: Verify Turbo Configuration

#### 4.1 Check `turbo.json`
Current configuration already supports the new packages. No changes needed.

#### 4.2 Check `pnpm-workspace.yaml`
Current configuration already includes `packages/*`. No changes needed.

---

### Step 5: Testing & Validation

#### 5.1 Type Check All Packages
```bash
cd walle-arena
pnpm run type-check
```

#### 5.2 Build All Packages
```bash
pnpm run build
```

#### 5.3 Lint All Packages
```bash
pnpm run lint
```

#### 5.4 Test Frontend Development Server
```bash
pnpm --filter @walle/frontend dev
```

Navigate to `http://localhost:3000` and verify:
- Auth pages work correctly
- Leaderboard displays properly
- Sponsors page renders
- No TypeScript errors in the console

---

## Acceptance Criteria Checklist

- [ ] `packages/types` directory exists with proper structure
- [ ] `packages/types/src/auth.ts` contains all auth types
- [ ] `packages/types/src/leaderboard.ts` contains leaderboard types
- [ ] `packages/types/src/sponsor.ts` contains sponsor types
- [ ] `packages/types/src/index.ts` exports all types
- [ ] `packages/utils` directory exists with proper structure
- [ ] `packages/utils/src/index.ts` contains placeholder validation functions
- [ ] `apps/frontend/package.json` includes workspace dependencies with `workspace:*` protocol
- [ ] `apps/frontend/next.config.js` includes `transpilePackages` array with all workspace packages
- [ ] All frontend imports updated to use `@walle/types`
- [ ] Old type files removed from `apps/frontend/src/types/`
- [ ] `pnpm install` runs without errors
- [ ] `pnpm run type-check` passes for all packages
- [ ] `pnpm run build` succeeds for all packages
- [ ] Frontend dev server starts and runs correctly
- [ ] No TypeScript errors in frontend
- [ ] No runtime errors when importing from workspace packages

---

## Suggested Improvements & Considerations

### 1. Add More Shared Types
Consider extracting these types in future iterations:
- Contest types (from contest pages)
- Team types (from team builder)
- Player types (currently in components)
- API response types

### 2. Create `@walle/api-client` Package (Phase 3)
This will handle:
- Axios configuration
- Base URL management (web vs mobile)
- Auth token injection
- Refresh token logic
- API endpoint wrappers

### 3. Add Zod Schemas
For runtime validation, consider adding Zod schemas alongside TypeScript types:
```typescript
// packages/types/src/auth.ts
import { z } from 'zod';

export const LoginCredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
});

export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
```

### 4. Extract Fantasy Game Rules
In future phases, move these to `@walle/utils`:
- Credit calculation logic
- Role constraints (WK: 1-4, BAT: 3-6, AR: 1-4, BWL: 3-6)
- Per-team player limits (max 7 from one team)
- Captain/Vice-captain point multipliers
- Team validation before submission

### 5. Add Unit Tests
Set up Jest for `@walle/utils`:
```bash
pnpm add -D jest @types/jest ts-jest --filter @walle/utils
```

Test coverage for:
- `isValidTeamSize()`
- `isWithinCreditLimit()`
- Future game rule functions

---

## Next Steps (Phase 2 Preview)

After completing Stage 1, you'll be ready for:
1. Create `apps/mobile` with Expo
2. Configure Metro bundler for monorepo
3. Set up React Navigation
4. Create `packages/ui-native` for shared components
5. Implement auth flow in mobile app

---

## Troubleshooting

### Issue: TypeScript can't find `@walle/types`
**Solution:** Run `pnpm install` from the root directory.

### Issue: "Module parse failed" or "Unexpected token" errors in browser
**Solution:** This means Next.js is trying to load raw TypeScript from `node_modules`. Ensure `transpilePackages` is configured in `next.config.js` with all workspace packages listed.

### Issue: Circular dependency warnings
**Solution:** Ensure `@walle/types` doesn't import from `@walle/utils` or other packages.

### Issue: Frontend build fails after migration
**Solution:** 
1. Check all import statements are updated
2. Verify no files still import from `@/types/auth` etc.
3. Run `pnpm run type-check` to find remaining issues
4. Verify `transpilePackages` is configured correctly in `next.config.js`

### Issue: Metro bundler issues (future mobile setup)
**Solution:** Configure `metro.config.js` to resolve workspace packages:
```javascript
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
```

---

## Important Notes

### Repository Naming
The spec references `walle-arena` as the root directory, which matches your current repository structure. All paths are relative to this root.

### Existing Packages
You already have `packages/constants` and `packages/env-config` in your monorepo. This spec adds `packages/types` and `packages/utils` to complement them. Ensure all packages use the `workspace:*` protocol in `package.json` for consistency.

### Type File Dependencies
Before moving type files from `apps/frontend/src/types/` to `packages/types/src/`, check if they import anything from other frontend files (like constants from `src/common/consts`). If they do:
1. Move those dependencies to `packages/constants` first
2. Update imports in the type files to use `@walle/constants`
3. Then move the type files to `packages/types`

This prevents broken imports after the migration.

## Estimated Time
- Step 1 (Create types package): 15 minutes
- Step 2 (Create utils package): 10 minutes
- Step 3 (Update frontend): 30-45 minutes
- Step 4 (Verify config): 5 minutes
- Step 5 (Testing): 15-20 minutes

**Total: ~1.5-2 hours**

---

## Success Metrics
✅ Zero TypeScript errors across all packages
✅ Frontend builds and runs successfully
✅ All type imports resolved correctly
✅ Monorepo structure ready for mobile app
✅ Foundation set for shared business logic extraction
