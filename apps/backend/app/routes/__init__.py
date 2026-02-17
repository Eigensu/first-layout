from .auth import router as auth_router
from .users import router as users_router
from .sponsors import router as sponsors_router
from .leaderboard import router as leaderboard_router
from .contests import router as contests_router
from .settings import router as settings_router

__all__ = [
    "auth_router",
    "users_router",
    "sponsors_router",
    "leaderboard_router",
    "contests_router",
    "settings_router",
]
