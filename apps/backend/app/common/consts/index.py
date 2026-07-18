"""Global constants for the backend application."""

# Number of unique teams a player must be selected in to be considered "hot".
HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD: int = 10

# Tournament subdomain slugs: 3-32 chars, lowercase alphanumeric + hyphens,
# must start and end with an alphanumeric. Mirrored in the frontend at
# src/common/consts/tournament.ts — keep both in sync.
TOURNAMENT_SLUG_PATTERN: str = r"^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$"

# Subdomains that can never be used as tournament slugs because they are
# (or may become) infrastructure hostnames on the root domain.
RESERVED_SUBDOMAINS: frozenset[str] = frozenset(
    {
        "www",
        "app",
        "api",
        "admin",
        "mail",
        "cdn",
        "staging",
        "dev",
        "test",
        "docs",
        "status",
        "assets",
        "static",
        "blog",
        "help",
        "support",
        "portal",
        "smtp",
        "imap",
        "ftp",
    }
)

__all__ = [
    "HOT_PLAYER_TEAM_SELECTIONS_THRESHOLD",
    "TOURNAMENT_SLUG_PATTERN",
    "RESERVED_SUBDOMAINS",
]
