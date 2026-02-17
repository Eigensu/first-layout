from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from datetime import datetime
from config.settings import settings
import logging
from config.database import connect_to_mongo, close_mongo_connection
from app.routes import auth_router, users_router, sponsors_router, leaderboard_router, contests_router, settings_router
from app.routes.players import router as players_router
from app.routes.players_hot import router as players_hot_router
from app.routes.slots import router as slots_router
from app.routes.teams import router as teams_router
from app.routes.carousel import router as carousel_router
from app.routes.admin import (
    players_router as admin_players_router,
    slots_router as admin_slots_router,
    players_import_router as admin_players_import_router,
    contests_router as admin_contests_router,
    users_teams_router as admin_users_teams_router,
    settings_router as admin_settings_router,
)

# Logging configuration
logging.basicConfig(
    level=logging.CRITICAL,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("app.startup")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup: Connect to MongoDB
    await connect_to_mongo()
    yield
    # Shutdown: Close MongoDB connection
    await close_mongo_connection()


app = FastAPI(
    title="Walle Fantasy API",
    description="Fantasy Cricket Platform API with MongoDB Authentication",
    version="1.0.0",
    debug=settings.debug,
    lifespan=lifespan
)

# CORS middleware with wildcard support (exact origins + optional regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_exact_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log CORS configuration (helpful for debugging in deployments)
logger.info("CORS exact origins: %s", settings.cors_exact_origins)
logger.info("CORS origin regex: %s", settings.cors_origin_regex)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(sponsors_router)
app.include_router(leaderboard_router)
app.include_router(contests_router)
app.include_router(settings_router)
app.include_router(admin_players_router)
app.include_router(admin_slots_router)
app.include_router(admin_players_import_router)
app.include_router(admin_contests_router)
app.include_router(admin_users_teams_router)
app.include_router(admin_settings_router)
app.include_router(players_router)
app.include_router(players_hot_router)
app.include_router(slots_router)
app.include_router(teams_router)
app.include_router(carousel_router)

# Files are served via API streaming endpoints (GridFS); no static uploads mount required

@app.get("/")
async def root():
    return {
        "message": "Walle Fantasy API is running!",
        "database": "MongoDB",
        "version": "1.0.0"
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "database": "MongoDB connected",
        "timestamp": datetime.now()
    }

# Real players endpoints are provided via players_router

@app.get("/api/leaderboard")
async def get_leaderboard():
    """Get the leaderboard"""
    return {
        "leaderboard": [
            {"rank": 1, "username": "player1", "points": 1250.5},
            {"rank": 2, "username": "player2", "points": 1180.2},
            {"rank": 3, "username": "player3", "points": 1150.8},
        ]
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.is_development,
        log_level="critical",
        access_log=False
    )
