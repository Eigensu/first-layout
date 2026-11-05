# Packages

This directory contains shared packages used across the WALL-E Layout (MWPL) monorepo.

## Structure

```
packages/
├── env/           # Environment configuration and validation
├── ui/            # Shared UI components
├── constants/     # Application constants and types
└── [future packages]
```

## Package Descriptions

### 📦 `@fantasy11/env`

Environment configuration package with validation using Zod schema.

**Features:**

- Environment variable validation
- Type-safe environment access
- Shared configuration across frontend and backend
- Development/production environment detection

**Usage:**

```typescript
import { validateFrontendEnv, type FrontendEnv } from "@fantasy11/env";
```

### 📦 `@fantasy11/ui`

Shared React UI components library.

**Features:**

- Reusable React components
- TypeScript support
- Tailwind CSS styling
- Component documentation

**Usage:**

```typescript
import { Button } from "@fantasy11/ui";
```

### 📦 `@fantasy11/constants`

Application-wide constants and type definitions.

**Features:**

- API route constants
- Business logic constants (team formation, points system)
- UI constants (colors, breakpoints)
- Type definitions

**Usage:**

```typescript
import {
  API_ROUTES,
  TEAM_FORMATION,
  POINTS_SYSTEM,
} from "@fantasy11/constants";
```

## Development

Each package includes:

- `package.json` - Package configuration
- `tsconfig.json` - TypeScript configuration
- `src/` - Source code directory
- Build and development scripts

## Building Packages

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @fantasy11/env build

# Watch mode for development
pnpm --filter @fantasy11/ui dev
```

## Adding New Packages

1. Create new directory in `packages/`
2. Add `package.json` with proper naming (`@fantasy11/package-name`)
3. Configure TypeScript and build scripts
4. Update workspace dependencies where needed
5. Add to Turborepo pipeline if necessary

## Environment Variables

The monorepo uses a centralized environment configuration:

- **Root `.env`** - Main environment file
- **`.env.example`** - Template file for new developers
- **`@fantasy11/env`** - Validation and type safety

### Environment File Hierarchy

1. Root `.env` - Loaded by all applications
2. App-specific `.env.local` - App overrides (gitignored)
3. Environment-specific files (`.env.production`, `.env.development`)

## Package Dependencies

Packages can depend on each other using workspace references:

```json
{
  "dependencies": {
    "@fantasy11/constants": "workspace:*",
    "@fantasy11/env": "workspace:*"
  }
}
```

This ensures proper build ordering and type checking across packages.
