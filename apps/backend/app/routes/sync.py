from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os
from app.services.google_sheets_sync import sync_players_from_sheet
from config.settings import settings

router = APIRouter(prefix="/api/sync", tags=["Sync"])

class SyncRequest(BaseModel):
    spreadsheet_id: str
    sheet_name: str = "Fantasy & MVP Player List"
    secret_token: str

@router.post("/trigger-sheet-sync")
async def trigger_sheet_sync(request: SyncRequest):
    """
    Trigger a sync of MVP points from a Google Sheet.
    Designed to be called by a Google Apps Script webhook onEdit().
    """
    if request.secret_token != settings.sync_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    credentials_path = os.environ.get("GOOGLE_CREDENTIALS_PATH", "google-credentials.json")
    google_creds_json = settings.google_credentials_json
    
    if not google_creds_json and not os.path.exists(credentials_path):
        raise HTTPException(status_code=500, detail=f"Google credentials file not found at {credentials_path}. Please place your JSON key file there or set GOOGLE_CREDENTIALS_JSON env var.")
        
    try:
        result = await sync_players_from_sheet(
            credentials_path=credentials_path,
            spreadsheet_id=request.spreadsheet_id,
            sheet_name=request.sheet_name
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
