"""The player export is the import template filled with real players.

Its point is the round trip: export, edit, import back with conflict "update".
So every assertion here reads the exported file the way the importer does.
"""

from io import BytesIO

from beanie import PydanticObjectId
from openpyxl import load_workbook

from app.models.admin.player import Player
from app.models.admin.slot import Slot
from app.utils.import_players.import_parsers import normalize_header
from app.utils.import_players.import_template import (
    TEMPLATE_HEADERS,
    generate_xlsx_export,
)
from app.utils.import_players.import_validators import validate_player_row


async def _export(players, slots):
    ws = load_workbook(await generate_xlsx_export(players, slots))["Players"]
    header = [c.value for c in ws[1]]
    rows = [
        {normalize_header(str(h)): v for h, v in zip(header, row)}
        for row in ws.iter_rows(min_row=2, values_only=True)
    ]
    return header, rows


async def test_an_exported_player_imports_back_unchanged(db):
    slot = Slot(code="SLOT_1", name="Batters", min_select=4, max_select=4)
    await slot.insert()
    player = Player(
        name="Ankit Shah",
        team="DV SPARTANS",
        points=40,
        price=200_000,
        status="Injured",
        slot=str(slot.id),
        image_url="https://example.com/p.jpg",
        cricheroes_player_id=2826925,
        stats={"mobile": "9876543210", "matches": 25, "runs": 742, "wickets": 0},
    )

    header, rows = await _export([player], [slot])

    assert header == TEMPLATE_HEADERS
    data, error = await validate_player_row(
        rows[0], slot_strategy="lookup", tournament_id=None
    )
    assert error is None, error
    assert data["name"] == "Ankit Shah"
    assert data["team"] == "DV SPARTANS"
    assert data["price"] == 200_000
    assert data["status"] == "Injured"
    assert data["slot"] == str(slot.id)
    assert data["image_url"] == "https://example.com/p.jpg"
    assert data["cricheroes_player_id"] == 2826925
    assert data["stats"] == player.stats


async def test_extra_stats_get_their_own_columns(db):
    players = [
        Player(name="A", team="X", stats={"strike_rate": 140.5}),
        Player(name="B", team="X", stats={"economy": 6.2, "history": [1, 2]}),
        Player(name="C", team="X"),
    ]

    header, rows = await _export(players, [])

    assert header == [*TEMPLATE_HEADERS, "strike_rate", "economy"]
    data, error = await validate_player_row(
        rows[1], slot_strategy="ignore", tournament_id=None
    )
    assert error is None, error
    # A nested stat has no cell shape and is left out, not stringified.
    assert data["stats"] == {"economy": 6.2}


async def test_a_slot_from_another_tournament_is_written_blank(db):
    player = Player(name="A", team="X", slot=str(PydanticObjectId()))

    _, rows = await _export([player], [])

    assert rows[0]["slot_code"] is None
    assert rows[0]["slot_name"] is None


async def test_formula_like_text_is_written_as_text(db):
    """A name or stat that looks like a formula must not run when the admin
    opens the export, and must still import back as the same text."""
    payload = '=HYPERLINK("http://evil.example","click")'
    player = Player(
        name=payload, team="=1+1", stats={"mobile": "=2+2", "=note": "=3+3"}
    )

    ws = load_workbook(await generate_xlsx_export([player], []))["Players"]

    cells = [c for c in ws[2] if isinstance(c.value, str)] + [
        c for c in ws[1] if c.value == "=note"
    ]
    assert cells and all(c.data_type == "s" for c in cells)
    _, rows = await _export([player], [])
    assert rows[0]["name"] == payload
    assert rows[0]["team"] == "=1+1"
