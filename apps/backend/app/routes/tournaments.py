from fastapi import APIRouter, HTTPException
from typing import List

from app.models.tournament import Tournament
from app.common.enums.tournaments import TournamentStatus
from app.schemas.tournament import PublicTournamentResponse

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])


def to_public(t: Tournament) -> PublicTournamentResponse:
    return PublicTournamentResponse(
        slug=t.slug,
        name=t.name,
        description=t.description,
        logo_url=t.logo_url,
        status=t.status,
        start_at=t.start_at,
        end_at=t.end_at,
        primary_color=t.primary_color,
        secondary_color=t.secondary_color,
        api_base_url=t.api_base_url,
    )


@router.get("", response_model=List[PublicTournamentResponse])
async def list_public_tournaments():
    """All non-archived tournaments, newest first (for the root-domain directory)."""
    rows = (
        await Tournament.find(Tournament.status != TournamentStatus.ARCHIVED)
        .sort(-Tournament.created_at)
        .to_list()
    )
    return [to_public(t) for t in rows]


@router.get("/by-slug/{slug}", response_model=PublicTournamentResponse)
async def get_tournament_by_slug(slug: str):
    """Resolve a subdomain to its tournament. Archived slugs 404 so the
    subdomain stops resolving without losing the record."""
    tournament = await Tournament.find_one(Tournament.slug == slug.strip().lower())
    if not tournament or tournament.status == TournamentStatus.ARCHIVED:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return to_public(tournament)
