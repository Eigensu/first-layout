# Fantasy11 - Monorepo

A modern monorepo setup for Fantasy11 cricket platform using Turborepo, Next.js, and FastAPI.

## Project Structure

```
fantasy11-monorepo/
├── apps/
│   ├── frontend/          # Next.js 14 frontend application
│   └── backend/           # FastAPI backend application
├── packages/
│   └── ui/               # Shared UI components
├── package.json          # Root package.json with workspace configuration
└── turbo.json           # Turborepo configuration
```

## Tech Stack

### Frontend

- **Next.js 14** - React framework with App Router
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

## Available Scripts

- `pnpm dev` - Start all applications in development mode
- `pnpm build` - Build all applications
- `pnpm lint` - Lint all applications
- `pnpm clean` - Clean all build artifacts
- `pnpm format` - Format code with Prettier

## Features

### Current Features

- ✅ Monorepo setup with Turborepo
- ✅ Next.js 14 with App Router
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

**Important:** Both frontend and backend load from the root `.env` file. Do not create separate `.env` files in `apps/frontend` or `apps/backend`.

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

# Add to specific workspace from root
pnpm add <package-name> --filter @fantasy11/frontend
pnpm add <package-name> --filter @fantasy11/backend
pnpm add <package-name> --filter @fantasy11/ui
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
