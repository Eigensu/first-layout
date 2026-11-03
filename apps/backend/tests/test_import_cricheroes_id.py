"""The CricHeroes player id column in the player import.

It is what ties a player in one of our tournaments to their CricHeroes stats
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §13.2), so it is validated, unique
within a tournament, and never silently cleared.
"""

import io

import pytest
from beanie import PydanticObjectId
from openpyxl import Workbook

from app.models.admin.player import Player
from app.models.player import Player as PublicPlayer
from app.services.player_import.import_service import PlayerImportService
from app.utils.import_players.import_parsers import normalize_header
from app.utils.import_players.import_template import TEMPLATE_COLUMNS, TEMPLATE_HEADERS
from app.utils.import_players.import_validators import (
    ValidationError,
    validate_cricheroes_player_id,
    validate_player_row,
)

IMPORT = "/api/admin/players/import"


async def _import(client, csv_text: str, *, dry_run=False, conflict="skip"):
    response = await client.post(
        IMPORT,
        files={"file": ("players.csv", csv_text.encode(), "text/csv")},
        data={
            "dry_run": str(dry_run).lower(),
            "conflict": conflict,
            "slot_strategy": "ignore",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _player(name: str) -> Player:
    return await Player.find_one(Player.name == name)


# -- the value ---------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        (2826925, 2826925),  # a numeric cell
        (2826925.0, 2826925),  # a numeric cell Excel stored as a decimal
        ("2826925", 2826925),  # CSV
        ("  2826925 ", 2826925),
        (None, None),
        ("", None),
        ("   ", None),
    ],
)
def test_accepted_ids(raw, expected):
    assert validate_cricheroes_player_id(raw) == expected


@pytest.mark.parametrize(
    "raw", ["abc", "2826925x", "2,826,925", 12.5, 0, -5, "-5", "0", True]
)
def test_rejected_ids(raw):
    with pytest.raises(ValidationError) as caught:
        validate_cricheroes_player_id(raw)
    assert caught.value.field == "cricheroes_player_id"


async def _row(**fields):
    base = {"name": "Ankit Shah", "team": "DV SPARTANS"}
    return await validate_player_row(
        {**base, **fields}, slot_strategy="ignore", tournament_id=None
    )


async def test_the_id_is_a_field_not_a_stat(db):
    data, error = await _row(cricheroes_player_id="2826925", runs=742)

    assert error is None
    assert data["cricheroes_player_id"] == 2826925
    assert "cricheroes_player_id" not in (data["stats"] or {})
    assert data["stats"] == {"runs": 742}


async def test_a_cricheroes_id_header_is_accepted_too(db):
    data, error = await _row(cricheroes_id=2826925)

    assert error is None
    assert data["cricheroes_player_id"] == 2826925
    assert data["stats"] is None


async def test_a_bad_id_fails_its_row(db):
    data, error = await _row(cricheroes_player_id="abc")

    assert error is not None
    assert error.field == "cricheroes_player_id"


def test_the_template_header_reads_back_as_the_column_the_importer_takes():
    index = TEMPLATE_HEADERS.index("CricHeroes Player ID")

    assert TEMPLATE_COLUMNS[index] == "cricheroes_player_id"
    assert normalize_header(TEMPLATE_HEADERS[index]) == "cricheroes_player_id"


# -- importing ---------------------------------------------------------------

HEADER = "name,team,price,cricheroes_player_id\n"


async def test_import_links_each_player_to_their_cricheroes_id(client):
    result = await _import(
        client, HEADER + "Rohit,India,100,2826925\nWarner,Australia,90,2826889\n"
    )

    assert result["created"] == 2 and result["errors"] == []
    assert (await _player("Rohit")).cricheroes_player_id == 2826925
    assert (await _player("Warner")).cricheroes_player_id == 2826889


async def test_a_player_without_an_id_imports_unlinked(client):
    result = await _import(client, HEADER + "Rohit,India,100,\n")

    assert result["created"] == 1
    assert (await _player("Rohit")).cricheroes_player_id is None


async def test_the_dry_run_preview_shows_the_id(client):
    result = await _import(client, HEADER + "Rohit,India,100,2826925\n", dry_run=True)

    assert result["samples"][0]["cricheroes_player_id"] == 2826925
    assert await _player("Rohit") is None


async def test_xlsx_numeric_cells_import(client):
    wb = Workbook()
    ws = wb.active
    ws.append(["Name", "Team", "Price", "CricHeroes Player ID"])
    ws.append(["Rohit", "India", 100, 2826925])
    content = io.BytesIO()
    wb.save(content)

    response = await client.post(
        IMPORT,
        files={
            "file": ("players.xlsx", content.getvalue(), "application/octet-stream")
        },
        data={"dry_run": "false", "slot_strategy": "ignore"},
    )

    assert response.status_code == 200, response.text
    assert (await _player("Rohit")).cricheroes_player_id == 2826925


async def test_the_same_id_twice_in_one_file_stops_the_import(client):
    result = await _import(
        client, HEADER + "Rohit,India,100,2826925\nSomeone,India,50,2826925\n"
    )

    [error] = result["errors"]
    assert (error["row"], error["field"]) == (3, "cricheroes_player_id")
    assert "row 2" in error["message"]
    # Any row error blocks the whole import, so neither was saved.
    assert result["created"] == 0
    assert await _player("Rohit") is None


async def test_an_id_another_player_holds_is_refused(client):
    await Player(name="Rohit", team="India", cricheroes_player_id=2826925).insert()

    result = await _import(client, HEADER + "Impostor,India,50,2826925\n")

    [error] = result["errors"]
    assert error["field"] == "cricheroes_player_id"
    assert "'Rohit'" in error["message"]
    assert await _player("Impostor") is None


async def test_updating_a_player_can_set_their_id(client):
    await Player(name="Rohit", team="India").insert()

    result = await _import(
        client, HEADER + "Rohit,India,100,2826925\n", conflict="update"
    )

    assert result["updated"] == 1 and result["errors"] == []
    assert (await _player("Rohit")).cricheroes_player_id == 2826925


async def test_updating_a_player_with_their_own_id_is_not_a_clash(client):
    await Player(name="Rohit", team="India", cricheroes_player_id=2826925).insert()

    result = await _import(
        client, HEADER + "Rohit,Mumbai,100,2826925\n", conflict="update"
    )

    assert result["errors"] == []
    assert (await _player("Rohit")).team == "Mumbai"


async def test_a_blank_cell_keeps_the_id_on_update(client):
    """Re-importing an older sheet without the column must not unlink anyone."""
    await Player(name="Rohit", team="India", cricheroes_player_id=2826925).insert()

    await _import(client, "name,team,price\nRohit,Mumbai,100\n", conflict="update")
    await _import(client, HEADER + "Rohit,Delhi,100,\n", conflict="update")

    rohit = await _player("Rohit")
    assert rohit.team == "Delhi"
    assert rohit.cricheroes_player_id == 2826925


async def test_updating_onto_another_players_id_is_refused(client):
    await Player(name="Rohit", team="India", cricheroes_player_id=2826925).insert()
    await Player(name="Warner", team="Australia").insert()

    result = await _import(
        client, HEADER + "Warner,Australia,90,2826925\n", conflict="update"
    )

    assert result["errors"][0]["field"] == "cricheroes_player_id"
    assert (await _player("Warner")).cricheroes_player_id is None


async def test_ids_are_unique_per_tournament_not_across_them(db):
    alpha, bravo = PydanticObjectId(), PydanticObjectId()
    await Player(
        tournament_id=alpha, name="Rohit", team="India", cricheroes_player_id=2826925
    ).insert()
    row = {"name": "Rohit", "team": "India", "cricheroes_player_id": 2826925}

    in_bravo, bravo_errors, _ = await PlayerImportService.validate_and_process_rows(
        [dict(row, _row_number=2)], "ignore", "skip", tournament_id=bravo
    )
    as_other, alpha_errors, _ = await PlayerImportService.validate_and_process_rows(
        [dict(row, name="Impostor", _row_number=2)],
        "ignore",
        "skip",
        tournament_id=alpha,
    )

    # The same player may play in another tournament under the same id...
    assert bravo_errors == [] and len(in_bravo) == 1
    # ...but within one, the id is taken.
    assert alpha_errors[0].field == "cricheroes_player_id"


# -- reading it back -----------------------------------------------------------


async def test_the_admin_player_list_shows_the_id(client):
    await Player(name="Rohit", team="India", cricheroes_player_id=2826925).insert()

    response = await client.get("/api/admin/players")

    assert response.status_code == 200, response.text
    assert response.json()["players"][0]["cricheroes_player_id"] == 2826925


async def test_saving_through_the_public_model_keeps_the_id(db):
    """The public Player model shares the collection but does not declare the
    id. Its save() must not drop it -- awarding contest points does exactly
    this. If a Beanie upgrade makes save() replace the document, this fails
    before every CricHeroes link is silently erased."""
    admin = Player(name="Rohit", team="India", cricheroes_player_id=2826925)
    await admin.insert()

    public = await PublicPlayer.get(admin.id)
    public.points = 42.0
    await public.save()

    reloaded = await Player.get(admin.id)
    assert reloaded.points == 42.0
    assert reloaded.cricheroes_player_id == 2826925
