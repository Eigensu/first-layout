from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from app.models.settings import GlobalSettings
from app.models.user import User
from app.utils.dependencies import get_admin_user
from app.utils.gridfs import upload_contest_logo_to_gridfs, delete_contest_logo_from_gridfs, open_contest_logo_stream
from app.utils.timezone import now_ist
from app.schemas.settings import GlobalSettingsResponse, GlobalSettingsUpdate
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin/settings", tags=["Admin - Settings"])

class UploadResponse(BaseModel):
    url: str
    message: str


def _to_settings_response(settings: GlobalSettings) -> GlobalSettingsResponse:
    return GlobalSettingsResponse(
        min_players_per_team=settings.min_players_per_team,
        max_players_per_team=settings.max_players_per_team,
        default_contest_logo_file_id=settings.default_contest_logo_file_id,
    )


@router.get("", response_model=GlobalSettingsResponse)
async def get_settings(
    current_user: User = Depends(get_admin_user),
):
    """Get the global settings singleton."""
    settings = await GlobalSettings.get_instance()
    return _to_settings_response(settings)


@router.put("", response_model=GlobalSettingsResponse)
async def update_settings(
    data: GlobalSettingsUpdate,
    current_user: User = Depends(get_admin_user),
):
    """Update the global team-composition settings."""
    settings = await GlobalSettings.get_instance()

    new_min = (
        data.min_players_per_team
        if data.min_players_per_team is not None
        else settings.min_players_per_team
    )
    new_max = (
        data.max_players_per_team
        if data.max_players_per_team is not None
        else settings.max_players_per_team
    )

    if new_min > new_max:
        raise HTTPException(
            status_code=400,
            detail="min_players_per_team cannot be greater than max_players_per_team",
        )

    settings.min_players_per_team = new_min
    settings.max_players_per_team = new_max
    settings.updated_at = now_ist()
    await settings.save()

    return _to_settings_response(settings)


@router.post("/logo", response_model=UploadResponse)
async def upload_default_logo(
    file: UploadFile = File(..., description="Default contest logo image"),
    current_user: User = Depends(get_admin_user),
):
    settings = await GlobalSettings.get_instance()

    import logging
    logger = logging.getLogger(__name__)

    # Delete old logo if it exists
    if settings.default_contest_logo_file_id:
        try:
            await delete_contest_logo_from_gridfs(settings.default_contest_logo_file_id)
        except Exception as e:
            logger.warning(f"Failed to delete old default logo {settings.default_contest_logo_file_id}: {e}")

    # Save new logo
    try:
        file_id = await upload_contest_logo_to_gridfs(file, filename_prefix="default_contest_logo")
        settings.default_contest_logo_file_id = file_id
        settings.updated_at = now_ist()
        await settings.save()
        
        return UploadResponse(
            url="/api/settings/logo",
            message="Default logo uploaded successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload logo: {str(e)}")
