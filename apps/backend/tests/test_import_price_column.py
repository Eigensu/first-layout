"""Importer mapping for the auction sale value.

The template's Points column has always fed Player.price. The dedicated Price
column added for auction contests takes precedence when present, and older
sheets that only carry Points keep working unchanged.
"""

from app.utils.import_players.import_validators import validate_player_row


async def _row(**fields):
    base = {"name": "Ankit Shah", "team": "DV SPARTANS", "status": "Active"}
    base.update(fields)
    data, error = await validate_player_row(base, slot_strategy="ignore")
    return data, error


async def test_price_column_sets_the_auction_value(db):
    data, error = await _row(points=1000, price=200_000)
    assert error is None
    assert data["price"] == 200_000
    # Accumulated fantasy points always start at zero.
    assert data["points"] == 0


async def test_points_column_still_feeds_price_when_price_absent(db):
    data, error = await _row(points=1000)
    assert error is None
    assert data["price"] == 1000


async def test_blank_price_falls_back_to_points(db):
    data, error = await _row(points=1000, price="  ")
    assert error is None
    assert data["price"] == 1000


async def test_player_with_neither_is_left_unauctioned(db):
    data, error = await _row()
    assert error is None
    assert data["price"] == 0


async def test_price_does_not_leak_into_stats(db):
    data, error = await _row(points=1000, price=200_000, runs=742)
    assert error is None
    stats = data["stats"] or {}
    assert "price" not in stats
    assert stats.get("runs") == 742


async def test_negative_price_is_rejected(db):
    data, error = await _row(price=-5)
    assert error is not None
    assert error.field == "price"
