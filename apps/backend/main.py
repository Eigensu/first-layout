from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
from typing import Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime
from config.settings import settings
from config.database import connect_to_mongo, close_mongo_connection
from app.routes import auth_router, users_router, sponsors_router, leaderboard_router
from app.routes.players import router as players_router
from app.routes.teams import router as teams_router
from app.routes.admin import players_router as admin_players_router, slots_router as admin_slots_router


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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(sponsors_router)
app.include_router(leaderboard_router)
app.include_router(admin_players_router)
app.include_router(admin_slots_router)
app.include_router(players_router)
app.include_router(teams_router)

# Pydantic models
class Team(BaseModel):
    id: Optional[int] = None
    user_id: int
    players: List[int]
    total_points: float = 0.0
    created_at: Optional[datetime] = None

class Match(BaseModel):
    id: int
    team1: str
    team2: str
    start_time: datetime
    status: str

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

@app.post("/api/teams", response_model=Team)
async def create_team(team: Team):
    """Create a new team"""
    # Simple ID generation without relying on sample data
    team.id = int(datetime.now().timestamp())
    team.created_at = datetime.now()
    return team

@app.get("/api/teams/{team_id}", response_model=Team)
async def get_team(team_id: int):
    """Get a team by ID"""
    # This would normally fetch from database
    return JSONResponse(status_code=404, content={"message": "Team not found"})

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
        reload=settings.is_development
    )
