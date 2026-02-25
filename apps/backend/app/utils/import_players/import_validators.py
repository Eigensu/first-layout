"""Validation and normalization utilities for player imports"""
from typing import Optional, Dict, Any, Tuple
from app.models.admin.player import Player
from app.models.admin.slot import Slot

# Status normalization
STATUS_MAPPINGS = {
    "active": "Active",
    "inactive": "Inactive",
    "injured": "Injured",
}

ALLOWED_STATUSES = {"Active", "Inactive", "Injured"}


class ValidationError(Exception):
    """Validation error with field and message"""
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


def normalize_status(status: Optional[str]) -> str:
    """Normalize status value"""
    if not status:
        return "Active"
    
    status_clean = status.strip()
    
    # Check exact match
    if status_clean in ALLOWED_STATUSES:
        return status_clean
    
    # Try case-insensitive match
    status_lower = status_clean.lower()
    if status_lower in STATUS_MAPPINGS:
        return STATUS_MAPPINGS[status_lower]
    
    raise ValidationError("status", f"Invalid status '{status}'. Allowed: {', '.join(ALLOWED_STATUSES)}")


def validate_name(name: Optional[str]) -> str:
    """Validate and normalize name"""
    if not name or not name.strip():
        raise ValidationError("name", "Name is required")
    
    name_clean = name.strip()
    if len(name_clean) < 1 or len(name_clean) > 100:
        raise ValidationError("name", "Name must be 1-100 characters")
    
    return name_clean


def validate_team(team: Optional[str]) -> str:
    """Validate and normalize team"""
    if not team or not team.strip():
        raise ValidationError("team", "Team is required")
    
    team_clean = team.strip()
    if len(team_clean) < 1 or len(team_clean) > 100:
        raise ValidationError("team", "Team must be 1-100 characters")
    
    return team_clean


def validate_number(value: Any, field: str, min_val: float = 0) -> float:
    """Validate numeric field"""
    if value is None:
        return 0.0
    
    try:
        num = float(value)
        if num < min_val:
            raise ValidationError(field, f"Must be >= {min_val}")
        return num
    except (ValueError, TypeError):
        raise ValidationError(field, f"Must be a number >= {min_val}")


async def resolve_slot(
    slot_code: Optional[str],
    slot_name: Optional[str],
    strategy: str = "lookup"
) -> Optional[str]:
    """
    Resolve slot to ObjectId string
    
    Args:
        slot_code: Slot code
        slot_name: Slot name
        strategy: 'lookup', 'create', or 'ignore'
        
    Returns:
        Slot ObjectId as string, or None
    """
    if strategy == "ignore":
        return None
    
    slot_doc = None
    
    # Try slot_code
    if slot_code:
        # Code is stored in uppercase and with underscores in the DB
        # When comparing, we should normalize the input the same way
        normalized_code = slot_code.strip().upper().replace(" ", "_")
        
        slot_doc = await Slot.find_one({
            "code": {"$regex": f"^{normalized_code}$", "$options": "i"}
        })
        
        if not slot_doc and strategy == "create":
            # Create new slot from code
            from datetime import datetime
            slot_doc = Slot(
                code=slugify_code(slot_code),
                name=slot_code.strip(),
                min_select=4,
                max_select=4,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            await slot_doc.insert()
    
    # Try slot_name
    if not slot_doc and slot_name:
        # Search case-insensitively
        slot_doc = await Slot.find_one({
            "name": {"$regex": f"^{slot_name.strip()}$", "$options": "i"}
        })
        
        if not slot_doc and strategy == "create":
            # Create new slot from name
            from datetime import datetime
            slot_doc = Slot(
                code=slugify_code(slot_name),
                name=slot_name.strip(),
                min_select=4,
                max_select=4,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            await slot_doc.insert()
    
    return str(slot_doc.id) if slot_doc else None


def slugify_code(text: str) -> str:
    """Safely convert text to an uppercase slug format."""
    return text.strip().upper().replace(" ", "_").replace("-", "_")


def extract_stats(row: Dict[str, Any], known_fields: set) -> Optional[Dict[str, Any]]:
    """Extract additional fields as stats dictionary"""
    stats = {}
    for key, value in row.items():
        if key not in known_fields and not key.startswith("_") and value is not None:
            stats[key] = value
    
    return stats if stats else None


async def validate_player_row(
    row: Dict[str, Any],
    slot_strategy: str = "lookup"
) -> Tuple[Dict[str, Any], Optional[ValidationError]]:
    """
    Validate and normalize a single player row
    
    Returns:
        Tuple of (normalized_data, error)
        If error is not None, normalized_data may be partial
    """
    known_fields = {
        "name", "team", "status", "points",
        "slot_code", "slot_name", "image_url", "image", "_row_number"
    }
    
    try:
        # Use points for the price field (since we're using points in the template)
        points_value = validate_number(row.get("points", 0), "points", 0)
        
        # Accept both "image" and "image_url" columns
        image_url = row.get("image_url") or row.get("image")
        
        data = {
            "name": validate_name(row.get("name")),
            "team": validate_team(row.get("team")),
            "status": normalize_status(row.get("status")),
            "price": points_value,  # Map points to price for database
            "points": 0,  # Always start with 0 accumulated points
            "image_url": image_url,
            "stats": extract_stats(row, known_fields),
        }
        
        # Resolve slot
        slot = await resolve_slot(
            row.get("slot_code"),
            row.get("slot_name"),
            slot_strategy
        )
        data["slot"] = slot
        
        return data, None
        
    except ValidationError as e:
        return {}, e


async def check_conflict(name: str) -> Optional[Player]:
    """Check if player with name already exists"""
    return await Player.find_one(Player.name == name)
