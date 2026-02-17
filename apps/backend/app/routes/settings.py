from fastapi import APIRouter, HTTPException, Response
from app.models.settings import GlobalSettings
from app.utils.gridfs import open_contest_logo_stream

router = APIRouter(prefix="/api/settings", tags=["Public Settings"])

@router.get("/logo")
async def get_default_logo():
    """Serve the default contest logo"""
    settings = await GlobalSettings.get_instance()
    
    if not settings.default_contest_logo_file_id:
        raise HTTPException(status_code=404, detail="Default logo not found")

    stream, content_type = await open_contest_logo_stream(settings.default_contest_logo_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
