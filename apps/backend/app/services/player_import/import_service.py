"""Player import service - Business logic for importing players"""

import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import UploadFile

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
    find_cricheroes_id_holder,
    validate_player_row,
)
from app.utils.tenant import TenantId

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
        *,
        tournament_id: TenantId,
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
        # CricHeroes id -> the row that claimed it, for duplicates in the file.
        cricheroes_ids_seen: Dict[int, int] = {}

        for row in rows:
            row_number = row.get("_row_number", 0)

            # Validate row
            validated_data, validation_error = await validate_player_row(
                row, slot_strategy=slot_strategy, tournament_id=tournament_id
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
            existing = await check_conflict(
                validated_data["name"], tournament_id=tournament_id
            )

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

            # One CricHeroes id is one player in a tournament. Two of our
            # players sharing one would both be credited with its stats.
            cricheroes_id = validated_data.get("cricheroes_player_id")
            if cricheroes_id is not None:
                clash = await PlayerImportService._cricheroes_id_clash(
                    cricheroes_id,
                    row_number,
                    cricheroes_ids_seen,
                    existing=existing,
                    tournament_id=tournament_id,
                )
                if clash:
                    errors.append(
                        RowError(
                            row=row_number, field="cricheroes_player_id", message=clash
                        )
                    )
                    continue
                cricheroes_ids_seen[cricheroes_id] = row_number

            valid_data.append(validated_data)

        return valid_data, errors, conflicts

    @staticmethod
    async def _cricheroes_id_clash(
        cricheroes_id: int,
        row_number: int,
        seen: Dict[int, int],
        *,
        existing: Optional[Player],
        tournament_id: TenantId,
    ) -> Optional[str]:
        """Why this row may not take this CricHeroes id, or None if it may."""
        if cricheroes_id in seen:
            return (
                f"CricHeroes player ID {cricheroes_id} is also on row "
                f"{seen[cricheroes_id]}; each player needs their own"
            )
        holder = await find_cricheroes_id_holder(
            cricheroes_id, tournament_id=tournament_id
        )
        # Updating the player who already holds it is fine; anyone else is not.
        if holder and (existing is None or holder.id != existing.id):
            return (
                f"CricHeroes player ID {cricheroes_id} already belongs to "
                f"'{holder.name}' in this tournament"
            )
        return None

    @staticmethod
    def get_samples(
        valid_data: List[Dict[str, Any]], limit: int = 5
    ) -> List[PlayerSample]:
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
                    cricheroes_player_id=data.get("cricheroes_player_id"),
                )
            )
        return samples

    @staticmethod
    async def save_players(
        valid_data: List[Dict[str, Any]], *, tournament_id: TenantId
    ) -> Tuple[int, int, int]:
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
                    # A blank cell keeps the id already linked: re-importing an
                    # older sheet without the column must not unlink everyone.
                    if validated_data.get("cricheroes_player_id") is not None:
                        existing.cricheroes_player_id = validated_data[
                            "cricheroes_player_id"
                        ]
                    existing.stats = validated_data.get("stats")
                    existing.updated_at = datetime.utcnow()
                    await existing.save()
                    updated_count += 1
                else:
                    # Create new player
                    new_player = Player(
                        tournament_id=tournament_id,
                        name=validated_data["name"],
                        team=validated_data["team"],
                        status=validated_data["status"],
                        price=validated_data["price"],
                        points=validated_data["points"],
                        slot=validated_data.get("slot"),
                        image_url=validated_data.get("image_url"),
                        cricheroes_player_id=validated_data.get("cricheroes_player_id"),
                        stats=validated_data.get("stats"),
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
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
        *,
        tournament_id: TenantId,
    ) -> ImportLog:
        """Create and save import log"""
        import_log = ImportLog(
            tournament_id=tournament_id,
            user_id=user_id,
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
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
        *,
        tournament_id: TenantId,
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
        valid_data, errors, conflicts = (
            await PlayerImportService.validate_and_process_rows(
                rows, slot_strategy, conflict, tournament_id=tournament_id
            )
        )

        # Get samples for preview
        samples = PlayerImportService.get_samples(valid_data)

        # Save players if not dry run
        created = 0
        updated = 0
        skipped = len(conflicts) if conflict == "skip" else 0

        if not dry_run and len(errors) == 0:
            created, updated, skipped = await PlayerImportService.save_players(
                valid_data, tournament_id=tournament_id
            )

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
            tournament_id=tournament_id,
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
