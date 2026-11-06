"""Template generation utilities for player import"""

import csv
import io
from copy import copy
from typing import Any, BinaryIO, Iterable, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from app.utils.import_players.import_parsers import normalize_header
from app.utils.import_players.import_validators import CRICHEROES_ID_COLUMNS

# Define standard columns
TEMPLATE_COLUMNS = [
    "name",
    "team",
    "points",
    "price",
    "slot_code",
    "slot_name",
    "mobile",
    "status",
    "image_url",
    "cricheroes_player_id",
    "matches",
    "runs",
    "wickets",
]

TEMPLATE_HEADERS = [
    "Name",
    "Team",
    "Points",
    "Price",
    "Slot Code",
    "Slot Name",
    "Mobile",
    "Status",
    "Image URL",
    "CricHeroes Player ID",
    "Matches",
    "Runs",
    "Wickets",
]


INSTRUCTION_TEXT = [
    ("Player Import Template Instructions", True),
    ("", False),
    ("Required Fields:", True),
    ("• Name: Player's full name (required)", False),
    ("• Team: Team name (required)", False),
    ("• Points: Player points (required)", False),
    ("", False),
    ("Optional Fields:", True),
    (
        "• Price: Auction sale value, used by auction-purse contests. Leave blank",
        False,
    ),
    ("  and the Points value is used instead. A player left at 0 counts as", False),
    ("  never auctioned and will not appear in auction contests.", False),
    (
        "• Slot Code/Name: Reference to slot assignment (e.g., 'SLOT 1 (Season)')",
        False,
    ),
    ("• Mobile: Contact number for the player (digits only is recommended)", False),
    ("• Status: Active, Inactive, or Injured (default: Active)", False),
    ("• Image URL: Player image URL", False),
    (
        "• CricHeroes Player ID: the player's numeric id on CricHeroes, e.g. 12345678.",
        False,
    ),
    ("  Links the player to their CricHeroes stats. Each player in a", False),
    (
        "  tournament needs their own. When updating existing players, a blank",
        False,
    ),
    ("  cell keeps the ID they already have.", False),
    (
        "• Additional stats: Any extra columns (matches, runs, wickets, etc.) will be stored as stats",
        False,
    ),
    ("", False),
    ("Tips:", True),
    ("• Use the dropdown menu for Status", False),
    ("• Delete the example row before importing", False),
    ("• Save file as .xlsx format", False),
    ("• Maximum 5,000 rows per file", False),
]


def _new_players_workbook(slot_codes: Optional[list[str]]) -> tuple[Workbook, Any]:
    """A workbook whose "Players" sheet has the template's headers, widths and
    dropdowns, and no data rows yet. Shared by the template and the export so
    an exported file is always one the importer reads back."""
    wb = Workbook()
    ws = wb.active

    if ws is None:
        raise ValueError("Failed to create worksheet")

    ws.title = "Players"

    # Style for header row
    header_fill = PatternFill(
        start_color="366092", end_color="366092", fill_type="solid"
    )
    header_font = Font(bold=True, color="FFFFFF")
    header_alignment = Alignment(horizontal="center", vertical="center")

    # Write headers
    for col_idx, header in enumerate(TEMPLATE_HEADERS, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.value = header  # type: ignore[assignment]
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment

    # Set column widths
    ws.column_dimensions["A"].width = 20  # Name
    ws.column_dimensions["B"].width = 18  # Team
    ws.column_dimensions["C"].width = 10  # Points
    ws.column_dimensions["D"].width = 14  # Price
    ws.column_dimensions["E"].width = 15  # Slot Code
    ws.column_dimensions["F"].width = 15  # Slot Name
    ws.column_dimensions["G"].width = 16  # Mobile
    ws.column_dimensions["H"].width = 12  # Status
    ws.column_dimensions["I"].width = 30  # Image URL
    ws.column_dimensions["J"].width = 22  # CricHeroes Player ID
    ws.column_dimensions["K"].width = 12  # Matches
    ws.column_dimensions["L"].width = 12  # Runs
    ws.column_dimensions["M"].width = 12  # Wickets

    # Data validation for Status (column H)
    status_dv = DataValidation(
        type="list", formula1='"Active,Inactive,Injured"', allow_blank=True
    )
    status_dv.error = "Please select a valid status"
    status_dv.errorTitle = "Invalid Status"
    ws.add_data_validation(status_dv)
    status_dv.add(f"H2:H5000")

    # Data validation for Slot Code if provided (column E)
    if slot_codes:
        slot_formula = '","'.join(slot_codes[:50])  # Limit to 50 for formula length
        slot_dv = DataValidation(
            type="list", formula1=f'"{slot_formula}"', allow_blank=True
        )
        slot_dv.error = "Please select a valid slot code"
        slot_dv.errorTitle = "Invalid Slot"
        ws.add_data_validation(slot_dv)
        slot_dv.add(f"E2:E5000")

    return wb, ws


# Advice that only fits the blank template. An export has no example row, so
# telling the admin to delete one would cost them their first real player.
_TEMPLATE_ONLY_TIPS = {"• Delete the example row before importing"}

EXPORT_TIPS = [
    ("• To update these players, import this file with 'Update' on conflict", False),
]


def _add_instructions_sheet(wb: Workbook, *, for_export: bool = False) -> None:
    instructions = wb.create_sheet("Instructions")
    instructions.column_dimensions["A"].width = 80

    lines = INSTRUCTION_TEXT
    if for_export:
        lines = [line for line in lines if line[0] not in _TEMPLATE_ONLY_TIPS]
        lines += EXPORT_TIPS

    for row_idx, (text, bold) in enumerate(lines, start=1):
        cell = instructions.cell(row=row_idx, column=1)
        cell.value = text
        if bold:
            cell.font = Font(bold=True, size=12)


def _to_bytes(wb: Workbook) -> BinaryIO:
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


async def generate_xlsx_template(slot_codes: Optional[list[str]] = None) -> BinaryIO:
    """
    Generate XLSX template with data validations

    Args:
        slot_codes: Optional list of slot codes for dropdown

    Returns:
        Binary file-like object with XLSX content
    """
    wb, ws = _new_players_workbook(slot_codes)

    # Add example row
    example_row = [
        "Ankit Shah",
        "DV SPARTANS",
        1000,
        200000,
        "SLOT 1 (Season)",
        "",
        "9876543210",
        "Active",
        "https://example.com/player.jpg",
        # CricHeroes Player ID: left blank, so an example row imported by
        # mistake is not linked to a real CricHeroes player.
        None,
        25,
        742,
        0,
    ]

    for col_idx, value in enumerate(example_row, start=1):
        ws.cell(row=2, column=col_idx).value = value

    _add_instructions_sheet(wb)
    return _to_bytes(wb)


# Template columns whose values live in Player.stats: the importer stores
# every column it does not otherwise know as a stat (extract_stats).
_STATS_COLUMNS = ("mobile", "matches", "runs", "wickets")

# Every header the importer gives a meaning of its own, so no stat column may
# read back as one of them: the template's columns plus the aliases
# validate_player_row also accepts.
_RESERVED_IMPORT_COLUMNS = (*TEMPLATE_COLUMNS, "image", *CRICHEROES_ID_COLUMNS)


def _cell_value(value: Any) -> Any:
    """A stat as a cell. Nested values have no column shape and are left out
    rather than written as text the importer would store back as a string."""
    if isinstance(value, (dict, list, tuple, set)):
        return None
    return value


def _write_literal(ws: Any, row: int, column: int, value: Any) -> None:
    """Write a stored value as data, never as a formula.

    openpyxl treats any string starting with "=" as a formula, so a player
    named '=HYPERLINK(...)' -- which an admin's import accepts as plain text --
    would become a live formula in the admin's spreadsheet. Typing the cell as
    a string keeps the text exactly as stored, so it still imports back
    unchanged.
    """
    cell = ws.cell(row=row, column=column)
    cell.value = value
    if isinstance(value, str):
        cell.data_type = "s"


async def generate_xlsx_export(
    players: Iterable[Any],
    slots: Iterable[Any],
) -> BinaryIO:
    """Every given player as a row of the import template.

    The file is the template with the example row replaced by real players, so
    it can be edited and imported back (conflict "update"). Stats beyond the
    template's own columns get a column each after Wickets, headed by the
    stat's key, which is what the importer reads them back as.

    Args:
        players: Admin Player documents, in the order to write them
        slots: The tournament's Slot documents, to turn Player.slot ids into
            the code and name the importer looks up
    """
    slots = list(slots)
    slot_by_id = {str(slot.id): slot for slot in slots}
    wb, ws = _new_players_workbook([slot.code for slot in slots][:50])

    players = list(players)
    # The importer reads headers through normalize_header, so a stat column is
    # only safe if its normalized key is new: a stat called "Team" would read
    # back as a second team column and overwrite the real one, and "Run Rate"
    # next to "run_rate" would collide with each other. Such stats are left
    # out; keys starting with "_" are too, since extract_stats drops them.
    taken = {normalize_header(c) for c in _RESERVED_IMPORT_COLUMNS}
    extra_stats: list[str] = []
    for player in players:
        for key, value in (player.stats or {}).items():
            if key in extra_stats or _cell_value(value) is None:
                continue
            normalized = normalize_header(str(key))
            if not normalized or normalized.startswith("_") or normalized in taken:
                continue
            taken.add(normalized)
            extra_stats.append(key)

    header_style = ws.cell(row=1, column=1)
    for offset, key in enumerate(extra_stats):
        column = len(TEMPLATE_HEADERS) + 1 + offset
        _write_literal(ws, 1, column, key)
        cell = ws.cell(row=1, column=column)
        cell.fill = copy(header_style.fill)
        cell.font = copy(header_style.font)
        cell.alignment = copy(header_style.alignment)

    for row_idx, player in enumerate(players, start=2):
        stats = player.stats or {}
        slot = slot_by_id.get(player.slot) if player.slot else None
        row = [
            player.name,
            player.team,
            player.points,
            player.price,
            slot.code if slot else None,
            slot.name if slot else None,
            _cell_value(stats.get("mobile")),
            player.status,
            player.image_url,
            player.cricheroes_player_id,
            _cell_value(stats.get("matches")),
            _cell_value(stats.get("runs")),
            _cell_value(stats.get("wickets")),
            *(_cell_value(stats.get(key)) for key in extra_stats),
        ]
        for col_idx, value in enumerate(row, start=1):
            _write_literal(ws, row_idx, col_idx, value)

    ws.freeze_panes = "A2"
    _add_instructions_sheet(wb, for_export=True)
    return _to_bytes(wb)


def generate_csv_template() -> str:
    """Generate CSV template as string"""
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(TEMPLATE_COLUMNS)

    # Write example row (must stay aligned with TEMPLATE_COLUMNS)
    writer.writerow(
        [
            "Ankit Shah",
            "DV SPARTANS",
            1000,
            200000,
            "SLOT 1 (Season)",
            "",
            "9876543210",
            "Active",
            "https://example.com/player.jpg",
            "",  # CricHeroes Player ID, blank like the xlsx example
            25,
            742,
            0,
        ]
    )

    return output.getvalue()
