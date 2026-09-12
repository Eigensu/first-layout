"""Admin players import routes"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.models.admin.import_log import ImportLog
from app.models.admin.slot import Slot
from app.models.user import User
from app.schemas.admin.player_import import (
    ImportLogListResponse,
    ImportLogResponse,
    ImportResponse,
)
from app.services.player_import.import_service import PlayerImportService
from app.utils.dependencies import get_admin_user
from app.utils.import_players.import_template import (
    generate_csv_template,
    generate_xlsx_template,
)

router = APIRouter(prefix="/api/admin/players/import", tags=["Admin - Players Import"])


@router.get("/template")
async def get_template(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    current_user: User = Depends(get_admin_user),
):
    """
    Download import template file

    Args:
        format: File format (xlsx or csv)

    Returns:
        Template file download
    """
    if format == "xlsx":
        # Get current slot codes for dropdown
        slots = await Slot.find_all().limit(50).to_list()
        slot_codes = [slot.code for slot in slots]

        template_file = await generate_xlsx_template(slot_codes)

        return StreamingResponse(
            template_file,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=players_import_template.xlsx"
            },
        )
    else:  # csv
        template_content = generate_csv_template()

        return StreamingResponse(
            iter([template_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=players_import_template.csv"
            },
        )


@router.post("", response_model=ImportResponse)
async def import_players(
    file: UploadFile = File(...),
    dry_run: bool = Form(True),
    conflict: str = Form("skip", pattern="^(skip|update|error)$"),
    slot_strategy: str = Form("lookup", pattern="^(lookup|create|ignore)$"),
    header_row: int = Form(1),
    idempotency_key: Optional[str] = Form(None),
    current_user: User = Depends(get_admin_user),
):
    """
    Import players from Excel or CSV file

    Args:
        file: Upload file (.xlsx or .csv)
        dry_run: If True, validate only without persisting
        conflict: How to handle duplicate names (skip/update/error)
        slot_strategy: How to handle slot mapping (lookup/create/ignore)
        header_row: Row number containing headers (1-based)
        idempotency_key: Optional key for idempotent requests

    Returns:
        Import results with validation errors and counts
    """
    try:
        # Process import using service layer
        result = await PlayerImportService.process_import(
            file=file,
            user_id=str(current_user.id),
            dry_run=dry_run,
            conflict=conflict,
            slot_strategy=slot_strategy,
            header_row=header_row,
            idempotency_key=idempotency_key,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.get("/logs", response_model=ImportLogListResponse)
async def get_import_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_admin_user),
):
    """Get import history logs"""
    query = ImportLog.find(ImportLog.user_id == str(current_user.id))
    total = await query.count()

    skip = (page - 1) * page_size
    logs = await query.sort([("started_at", -1)]).skip(skip).limit(page_size).to_list()

    log_responses = [
        ImportLogResponse(
            id=str(log.id),
            user_id=log.user_id,
            started_at=log.started_at,
            completed_at=log.completed_at,
            dry_run=log.dry_run,
            filename=log.filename,
            format=log.format,
            total_rows=log.total_rows,
            created=log.created,
            updated=log.updated,
            skipped=log.skipped,
            invalid_rows=log.invalid_rows,
            conflict_policy=log.conflict_policy,
            slot_strategy=log.slot_strategy,
        )
        for log in logs
    ]

    return ImportLogListResponse(
        logs=log_responses,
        total=total,
        page=page,
        page_size=page_size,
    )
