from .players import router as players_router
from .slots import router as slots_router
from .players_import import router as players_import_router
from .contests import router as contests_router
from .teams_users import router as users_teams_router
from .settings import router as settings_router

__all__ = [
    "players_router",
    "slots_router",
    "players_import_router",
    "contests_router",
    "users_teams_router",
    "settings_router",
]
