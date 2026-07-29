from enum import Enum


class TournamentStatus(str, Enum):
    """Lifecycle of a tournament tenant (one subdomain per tournament)."""

    DRAFT = "draft"          # created, subdomain resolves but shows coming-soon
    LIVE = "live"            # publicly running
    COMPLETED = "completed"  # finished, still viewable
    ARCHIVED = "archived"    # hidden; subdomain returns 404
