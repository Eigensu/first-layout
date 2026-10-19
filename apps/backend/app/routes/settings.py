from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.models.settings import GlobalSettings
from app.schemas.settings import GlobalSettingsResponse
from app.utils.gridfs import open_contest_logo_stream
from app.utils.tenant import TenantId, get_tenant

router = APIRouter(prefix="/api/settings", tags=["Public Settings"])


@router.get("", response_model=GlobalSettingsResponse)
async def get_public_settings(tournament_id: TenantId = Depends(get_tenant)):
    """Get this tournament's public settings, like team-composition constraints."""
    settings = await GlobalSettings.get_for_tournament(tournament_id)
    return GlobalSettingsResponse(
        min_players_per_team=settings.min_players_per_team,
        max_players_per_team=settings.max_players_per_team,
        default_contest_logo_file_id=settings.default_contest_logo_file_id,
    )


@router.get("/logo")
async def get_default_logo(tournament_id: Optional[str] = Query(None)):
    """Serve a tournament's default contest logo.

    An ``<img src>``, so the tournament comes from the query string rather
    than the tenant header; ``default_logo_path`` builds the URL. Without one,
    the platform default.
    """
    tid = None
    if tournament_id:
        try:
            tid = PydanticObjectId(tournament_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Default logo not found")
    settings = await GlobalSettings.get_for_tournament(tid)

    if not settings.default_contest_logo_file_id:
        raise HTTPException(status_code=404, detail="Default logo not found")

    stream, content_type = await open_contest_logo_stream(
        settings.default_contest_logo_file_id
    )
    data = await stream.read()
    return Response(content=data, media_type=content_type)
