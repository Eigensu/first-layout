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
from app.routes import auth_router, users_router


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

# Include authentication routers
app.include_router(auth_router)
app.include_router(users_router)

# Pydantic models
class Player(BaseModel):
    id: int
    name: str
    team: str
    role: str
    points: float
    price: float

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

# Sample data
sample_players = [
    {"id": 1, "name": "Virat Kohli", "team": "RCB", "role": "Batsman", "points": 85.5, "price": 12.0},
    {"id": 2, "name": "MS Dhoni", "team": "CSK", "role": "Wicket-keeper", "points": 78.2, "price": 11.5},
    {"id": 3, "name": "Rohit Sharma", "team": "MI", "role": "Batsman", "points": 82.1, "price": 11.0},
    {"id": 4, "name": "Jasprit Bumrah", "team": "MI", "role": "Bowler", "points": 89.3, "price": 10.5},
    {"id": 5, "name": "Hardik Pandya", "team": "MI", "role": "All-rounder", "points": 76.8, "price": 9.5},
]

sample_matches = [
    {"id": 1, "team1": "MI", "team2": "CSK", "start_time": "2024-04-01T19:30:00", "status": "upcoming"},
    {"id": 2, "team1": "RCB", "team2": "KKR", "start_time": "2024-04-02T19:30:00", "status": "upcoming"},
]

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

@app.get("/api/players", response_model=List[Player])
async def get_players():
    """Get all available players"""
    return sample_players

@app.get("/api/players/{player_id}", response_model=Player)
async def get_player(player_id: int):
    """Get a specific player by ID"""
    for player in sample_players:
        if player["id"] == player_id:
            return player
    return JSONResponse(status_code=404, content={"message": "Player not found"})

@app.get("/api/matches", response_model=List[Match])
async def get_matches():
    """Get all matches"""
    return sample_matches

@app.get("/api/matches/{match_id}", response_model=Match)
async def get_match(match_id: int):
    """Get a specific match by ID"""
    for match in sample_matches:
        if match["id"] == match_id:
            return match
    return JSONResponse(status_code=404, content={"message": "Match not found"})

@app.post("/api/teams", response_model=Team)
async def create_team(team: Team):
    """Create a new team"""
    team.id = len(sample_players) + 1  # Simple ID generation
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
