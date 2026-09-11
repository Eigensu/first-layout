"""Player import service - Business logic for importing players"""
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import UploadFile

from app.common.datetime_utils import utc_now
from app.models.admin.import_log import ImportLog
from app.models.admin.player import Player
from app.schemas.admin.player_import import (
    ConflictDetail,
    ImportResponse,
    PlayerSample,
    RowError,
)
from app.utils.import_players.import_parsers import detect_format, parse_csv, parse_xlsx
from app.utils.import_players.import_validators import (
    ValidationError,
    check_conflict,
    validate_player_row,
)

# Configuration
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB for XLSX
MAX_FILE_SIZE_CSV = 2 * 1024 * 1024  # 2MB for CSV
MAX_ROWS = 5000
MAX_ERRORS_RETURNED = 200
CHUNK_SIZE = 200


class PlayerImportService:
    """Service class for handling player imports"""

    @staticmethod
    def calculate_file_checksum(content: bytes) -> str:
        """Calculate SHA256 checksum of file content"""
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    async def parse_file(
        file: UploadFile, header_row: int = 1
    ) -> Tuple[str, List[str], List[Dict[str, Any]], bytes]:
        """
        Parse uploaded file and return format, headers, rows, and content
        
        Args:
            file: Uploaded file
            header_row: Row number for headers (1-based)
            
        Returns:
            Tuple of (format, headers, rows, file_content)
            
        Raises:
            ValueError: If file format is invalid or parsing fails
        """
        # Read file content
        content = await file.read()
        await file.seek(0)

        # Detect format
        file_format = detect_format(file.filename)

        # Validate file size
        max_size = MAX_FILE_SIZE if file_format == "xlsx" else MAX_FILE_SIZE_CSV
        if len(content) > max_size:
            raise ValueError(
                f"File too large. Maximum size: {max_size / 1024 / 1024:.1f}MB"
            )

        # Parse file
        import io

        # Parse file
        file_stream = io.BytesIO(content)
        if file_format == "xlsx":
            headers, rows = parse_xlsx(file_stream, header_row)
        else:
            headers, rows = parse_csv(file_stream, header_row)

        # Validate row count
        if len(rows) > MAX_ROWS:
            raise ValueError(f"Too many rows. Maximum: {MAX_ROWS}")

        return file_format, headers, rows, content

    @staticmethod
    async def validate_and_process_rows(
        rows: List[Dict[str, Any]],
        slot_strategy: str,
        conflict_policy: str,
    ) -> Tuple[List[Dict[str, Any]], List[RowError], List[ConflictDetail]]:
        """
        Validate all rows and handle conflicts
        
        Args:
            rows: Parsed rows from file
            slot_strategy: How to handle slots (lookup/create/ignore)
            conflict_policy: How to handle duplicates (skip/update/error)
            
        Returns:
            Tuple of (valid_data, errors, conflicts)
        """
        valid_data = []
        errors = []
        conflicts = []

        for row in rows:
            row_number = row.get("_row_number", 0)

            # Validate row
            validated_data, validation_error = await validate_player_row(
                row, slot_strategy=slot_strategy
            )

            if validation_error:
                errors.append(
                    RowError(
                        row=row_number,
                        field=validation_error.field,
                        message=validation_error.message,
                    )
                )
                continue

            # Check for conflicts
            existing = await check_conflict(validated_data["name"])

            if existing:
                if conflict_policy == "error":
                    errors.append(
                        RowError(
                            row=row_number,
                            field="name",
                            message=f"Player '{validated_data['name']}' already exists",
                        )
                    )
                    continue
                elif conflict_policy == "skip":
                    conflicts.append(
                        ConflictDetail(
                            row=row_number,
                            reason=f"Player '{validated_data['name']}' already exists (skipped)",
                        )
                    )
                    continue
                elif conflict_policy == "update":
                    validated_data["_is_update"] = True
                    validated_data["_existing_player"] = existing
                    conflicts.append(
                        ConflictDetail(
                            row=row_number,
                            reason=f"Player '{validated_data['name']}' already exists (will update)",
                        )
                    )

            valid_data.append(validated_data)

        return valid_data, errors, conflicts

    @staticmethod
    def get_samples(valid_data: List[Dict[str, Any]], limit: int = 5) -> List[PlayerSample]:
        """Extract sample players for preview"""
        samples = []
        for data in valid_data[:limit]:
            samples.append(
                PlayerSample(
                    name=data["name"],
                    team=data["team"],
                    points=data.get("price", 0),
                    status=data["status"],
                    slot=data.get("slot"),
                )
            )
        return samples

    @staticmethod
    async def save_players(valid_data: List[Dict[str, Any]]) -> Tuple[int, int, int]:
        """
        Save validated players to database
        
        Args:
            valid_data: List of validated player data
            
        Returns:
            Tuple of (created_count, updated_count, skipped_count)
        """
        created_count = 0
        updated_count = 0
        skipped_count = 0

        # Process in chunks
        for i in range(0, len(valid_data), CHUNK_SIZE):
            chunk = valid_data[i : i + CHUNK_SIZE]

            for validated_data in chunk:
                if validated_data.get("_is_update"):
                    # Update existing player
                    existing = validated_data["_existing_player"]
                    existing.team = validated_data["team"]
                    existing.status = validated_data["status"]
                    existing.price = validated_data["price"]
                    existing.points = validated_data["points"]
                    existing.slot = validated_data.get("slot")
                    existing.image_url = validated_data.get("image_url")
                    existing.stats = validated_data.get("stats")
                    existing.updated_at = utc_now()
                    await existing.save()
                    updated_count += 1
                else:
                    # Create new player
                    new_player = Player(
                        name=validated_data["name"],
                        team=validated_data["team"],
                        status=validated_data["status"],
                        price=validated_data["price"],
                        points=validated_data["points"],
                        slot=validated_data.get("slot"),
                        image_url=validated_data.get("image_url"),
                        stats=validated_data.get("stats"),
                        created_at=utc_now(),
                        updated_at=utc_now(),
                    )
                    await new_player.insert()
                    created_count += 1

        return created_count, updated_count, skipped_count

    @staticmethod
    async def create_import_log(
        user_id: str,
        filename: str,
        file_size: int,
        checksum: str,
        file_format: str,
        conflict_policy: str,
        slot_strategy: str,
        dry_run: bool,
        total_rows: int,
        created: int,
        updated: int,
        skipped: int,
        invalid_rows: int,
        sample_errors: Optional[List[Dict[str, Any]]] = None,
        conflicts: Optional[List[Dict[str, Any]]] = None,
        idempotency_key: Optional[str] = None,
    ) -> ImportLog:
        """Create and save import log"""
        import_log = ImportLog(
            user_id=user_id,
            started_at=utc_now(),
            completed_at=utc_now(),
            dry_run=dry_run,
            filename=filename,
            file_size=file_size,
            checksum=checksum,
            format=file_format,
            conflict_policy=conflict_policy,
            slot_strategy=slot_strategy,
            total_rows=total_rows,
            created=created,
            updated=updated,
            skipped=skipped,
            invalid_rows=invalid_rows,
            sample_errors=sample_errors,
            conflicts=conflicts,
            idempotency_key=idempotency_key,
        )
        await import_log.insert()
        return import_log

    @staticmethod
    async def process_import(
        file: UploadFile,
        user_id: str,
        dry_run: bool,
        conflict: str,
        slot_strategy: str,
        header_row: int = 1,
        idempotency_key: Optional[str] = None,
    ) -> ImportResponse:
        """
        Main orchestration method for player import
        
        Args:
            file: Uploaded file
            user_id: ID of user performing import
            dry_run: If True, only validate without saving
            conflict: Conflict resolution strategy (skip/update/error)
            slot_strategy: Slot resolution strategy (lookup/create/ignore)
            header_row: Row number for headers (1-based)
            idempotency_key: Optional key for idempotent operations
            
        Returns:
            ImportResponse with results
        """
        # Parse file
        file_format, headers, rows, content = await PlayerImportService.parse_file(
            file, header_row
        )

        # Calculate checksum
        checksum = PlayerImportService.calculate_file_checksum(content)

        # Validate and process rows
        valid_data, errors, conflicts = await PlayerImportService.validate_and_process_rows(
            rows, slot_strategy, conflict
        )

        # Get samples for preview
        samples = PlayerImportService.get_samples(valid_data)

        # Save players if not dry run
        created = 0
        updated = 0
        skipped = len(conflicts) if conflict == "skip" else 0

        if not dry_run and len(errors) == 0:
            created, updated, skipped = await PlayerImportService.save_players(valid_data)

        # Create import log
        await PlayerImportService.create_import_log(
            user_id=user_id,
            filename=file.filename,
            file_size=len(content),
            checksum=checksum,
            file_format=file_format,
            conflict_policy=conflict,
            slot_strategy=slot_strategy,
            dry_run=dry_run,
            total_rows=len(rows),
            created=created,
            updated=updated,
            skipped=skipped,
            invalid_rows=len(errors),
            sample_errors=[
                {"row": e.row, "field": e.field, "message": e.message}
                for e in errors[:MAX_ERRORS_RETURNED]
            ],
            conflicts=[{"row": c.row, "reason": c.reason} for c in conflicts],
            idempotency_key=idempotency_key,
        )

        # Return response
        return ImportResponse(
            dry_run=dry_run,
            format=file_format,
            total_rows=len(rows),
            valid_rows=len(valid_data),
            invalid_rows=len(errors),
            created=created,
            updated=updated,
            skipped=skipped,
            conflicts=conflicts,
            errors=errors[:MAX_ERRORS_RETURNED],
            samples=samples,
            has_more_errors=len(errors) > MAX_ERRORS_RETURNED,
        )
