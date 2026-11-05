# WALL-E Layout (mwpl) - Monorepo

This repository contains the WALL-E Layout (MWPL) monorepo — a multi-application workspace that ships a Next.js frontend, a FastAPI backend, and a set of shared packages and utilities.

## Project Structure

```
mwpl/
├── apps/
│   ├── frontend/          # Next.js frontend application (app dir)
│   └── backend/           # FastAPI backend application
├── frontend/              # Optional standalone public frontend (legacy)
├── packages/              # Shared workspace packages (env / constants / ui)
├── docs/                  # Project documentation
├── package.json           # Root workspace scripts & configuration
└── turbo.json             # Turborepo configuration
```

## Tech Stack

### Frontend

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **React 18** - Latest React features

### Backend

- **FastAPI** - Modern Python web framework
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server
- **Python 3.9+** - Programming language

### Development Tools

- **Turborepo** - Monorepo build system
- **ESLint** - Linting for JavaScript/TypeScript
- **Prettier** - Code formatting

## Quick Start

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Set up Python environment for backend**

   ```bash
   cd apps/backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cd ../..
   ```

3. **Configure environment variables**

   ```bash
   # Copy the environment template
   cp .env.example .env

   # Edit .env with your configuration
   # See docs/ENVIRONMENT_SETUP.md for detailed instructions
   ```

4. **Start development servers**
   ```bash
   pnpm dev
   ```

This will start:

- Frontend at http://localhost:3000
- Backend at http://localhost:8000

If you prefer to run apps individually:

```bash
# Frontend only
cd apps/frontend && pnpm dev

# Backend only (venv or use package script)
cd apps/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pnpm run dev  # uses uvicorn script from apps/backend/package.json
```

## Available Scripts

- `pnpm dev` - Start all applications in development mode (turbo run dev)
- `pnpm build` - Build all applications (turbo run build)
- `pnpm lint` - Lint all applications (turbo run lint)
- `pnpm format` - Format code across the workspace using Prettier
- `pnpm clean` - Clean all build artifacts in workspace
- `pnpm test` - Run tests for all packages / apps (if any)

## Features

### Current Features

- ✅ Monorepo setup with Turborepo
- ✅ Next.js 15 with App Router
- ✅ FastAPI backend with sample endpoints
- ✅ Shared UI component library
- ✅ TypeScript configuration
- ✅ Tailwind CSS setup
- ✅ CORS configuration for frontend-backend communication

### Planned Features

- 🔲 User authentication and authorization
- 🔲 Player database integration
- 🔲 Team creation and management
- 🔲 Contest participation
- 🔲 Live scoring system
- 🔲 Leaderboards and rankings
- 🔲 Payment integration
- 🔲 Real-time notifications

## API Endpoints

### Available Endpoints

- `GET /` - API status
- `GET /api/health` - Health check
- `GET /api/players` - Get all players
- `GET /api/players/{id}` - Get player by ID
- `GET /api/matches` - Get all matches
- `GET /api/matches/{id}` - Get match by ID
- `POST /api/teams` - Create a team
- `GET /api/teams/{id}` - Get team by ID
- `GET /api/leaderboard` - Get leaderboard

## Environment Setup

This monorepo uses a **single centralized `.env` file** in the root directory for both frontend and backend.

### Quick Setup

```bash
# Copy the environment template
cp .env.example .env

# Edit with your values
nano .env
```

### 📖 Detailed Documentation

See [docs/ENVIRONMENT_SETUP.md](./docs/ENVIRONMENT_SETUP.md) for:

- Complete environment variables reference
- Security best practices
- Troubleshooting guide
- Migration instructions

> **Important:** The root `.env` is the primary source for environment variables. App-level overrides like `.env.local` are allowed for local development, but keep secrets out of git and prefer a single source of truth for shared values.

## Development

### Adding New Packages

To add dependencies to specific applications:

```bash
# Frontend
cd apps/frontend && pnpm add <package-name>

# Backend
cd apps/backend && pip install <package-name> && pip freeze > requirements.txt

# Shared UI
cd packages/ui && pnpm add <package-name>

# Add to a specific workspace from root
pnpm add <package-name> --filter ./apps/frontend
pnpm add <package-name> --filter ./apps/backend
pnpm add <package-name> --filter ./packages/ui
```

### Creating New Shared Packages

1. Create a new directory in `packages/`
2. Add `package.json` with appropriate configuration
3. Update root `package.json` workspaces if needed

## Deployment

### Frontend (Vercel)

The frontend can be deployed to Vercel with minimal configuration.

### Backend (Railway/Heroku)

The backend can be deployed to Railway, Heroku, or any platform supporting Python applications.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.
