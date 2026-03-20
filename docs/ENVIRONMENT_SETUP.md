# Environment Variables Setup

## Overview

This monorepo uses a **single centralized `.env` file** located in the root directory. Both the frontend and backend applications load their environment variables from this shared file.

## Structure

```
/
├── .env                    # 🔑 SINGLE source of truth for all environment variables
├── .env.example            # Template with all available variables
├── apps/
│   ├── frontend/
│   │   ├── next.config.js  # Loads env from root .env
│   │   └── .env.example    # Redirect notice only
│   └── backend/
│       ├── config/
│       │   └── settings.py # Loads env from root .env
│       └── .env.example    # Redirect notice only
```

## Why a Single .env File?

✅ **Benefits:**

- Single source of truth - no duplicate or conflicting values
- Easier to manage and maintain
- Consistent configuration across all services
- Simpler deployment process
- No confusion about which file to edit

## Setup Instructions

### 1. Initial Setup

```bash
# Copy the example file to create your .env
cp .env.example .env

# Edit the .env file with your values
# Use a text editor or:
nano .env
```

### 2. Required Variables

The following variables **must** be configured:

```bash
# Security (generate secure keys)
SECRET_KEY=your-super-secret-key-change-this-in-production-32chars-minimum
JWT_SECRET_KEY=your-jwt-secret-key-change-this-in-production-32chars-minimum

# MongoDB
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=world-tower
```

### 3. Generate Secure Keys

For production, generate secure random keys:

```bash
# Python method
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Or use OpenSSL
openssl rand -base64 32
```

## Environment Variables Reference

### Frontend Variables

Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=Fantasy11
NEXT_PUBLIC_APP_VERSION=1.0.0
```

### Backend Variables

```bash
# Environment
NODE_ENV=development
DEBUG=true

# Security
SECRET_KEY=<your-secret-key>
JWT_SECRET_KEY=<your-jwt-secret-key>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# MongoDB Database
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=world-tower

# CORS
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# Cloudinary (media uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_SECURE=true
CLOUDINARY_DEFAULT_FOLDER=walle
```

### Optional External Services

```bash
REDIS_URL=
CRICKET_API_KEY=
```

### Cloudinary (required for sponsor logo uploads)

```bash
# Create a free account at https://cloudinary.com and copy these from Dashboard
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Optional
CLOUDINARY_SECURE=true
CLOUDINARY_DEFAULT_FOLDER=walle
```

## How It Works

### Frontend (Next.js)

The `next.config.js` file loads environment variables from the root `.env` file:

```javascript
const path = require("path");
const { config } = require("dotenv");

// Load from root .env
const rootEnvPath = path.resolve(__dirname, "../../.env");
config({ path: rootEnvPath });
```

### Backend (FastAPI)

The `config/settings.py` file uses Pydantic Settings to load from the root `.env` file:

```python
from pathlib import Path

# Get root directory (two levels up from backend/config)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"

class Settings(BaseSettings):
    # ... field definitions ...

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore frontend-specific variables
```

## Important Notes

### ⚠️ Security

1. **Never commit `.env` to version control** - it's already in `.gitignore`
2. **Use different values for production** - never use development keys in production
3. **Rotate keys regularly** - especially after team member changes
4. **Use environment-specific files** - `.env.production`, `.env.staging` if needed

### 🔧 Development

- The shared `.env` file contains variables for **both** frontend and backend
- Backend ignores frontend-specific variables (those starting with `NEXT_PUBLIC_`)
- Frontend only uses variables that start with `NEXT_PUBLIC_`

### 🚀 Deployment

For production deployments, you can either:

1. **Use a `.env.production` file** in the root
2. **Set environment variables directly** in your hosting platform (Vercel, Railway, etc.)
3. **Use secrets management** (AWS Secrets Manager, HashiCorp Vault, etc.)

## Troubleshooting

### Backend: "Extra inputs are not permitted"

If you see this error, it means the backend is not ignoring frontend variables. Ensure `settings.py` has:

```python
class Config:
    extra = "ignore"
```

### Frontend: Environment variables not loading

1. Restart the Next.js dev server after changing `.env`
2. Ensure variables are prefixed with `NEXT_PUBLIC_`
3. Check that `dotenv` package is installed

### Variables not updating

1. **Restart both servers** after changing `.env`
2. Clear Next.js cache: `rm -rf .next`
3. Restart your terminal/IDE

## Migration from Old Setup

If you're migrating from separate `.env` files:

1. ✅ All environment variables are now in the root `.env`
2. ✅ Backend and frontend `.env.example` files now contain redirect notices
3. ✅ The old `apps/backend/.env` has been removed
4. ✅ Configuration files have been updated to point to the root `.env`

## Testing Your Setup

### Test Backend

```bash
cd apps/backend
pnpm dev
# Should start without errors
```

### Test Frontend

```bash
cd apps/frontend
pnpm dev
# Should start on http://localhost:3000
```

Both services should start successfully and use the shared environment variables from the root `.env` file.
