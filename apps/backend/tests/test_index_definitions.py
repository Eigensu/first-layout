"""Index declarations that say what the database actually builds.

Covers docs/UNIFIED_AUTH_SPEC.md §13.8: R21 (the membership index that took in
every app-created membership) and R22 (unique declarations Beanie discarded).
"""

import pytest
from beanie import PydanticObjectId
from beanie.odm.fields import IndexModelField
from beanie.odm.utils.init import get_index_attributes
from beanie.odm.utils.pydantic import get_model_fields
from conftest import DOCUMENT_MODELS
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError
from pymongo import IndexModel
from pymongo.errors import DuplicateKeyError

from app.models.sponsor import Sponsor
from app.models.tournament_membership import TournamentMembership
from config.database import FLAWED_INDEXES, drop_flawed_indexes

# --------------------------------------------------------------------------
# R22: a field-level unique that Settings.indexes shadows is never built
# --------------------------------------------------------------------------


def _settings_index_fields(model) -> set:
    fields = set()
    for entry in getattr(model.Settings, "indexes", None) or []:
        if isinstance(entry, str):
            entry = IndexModel([(entry, 1)])
        elif isinstance(entry, list):
            entry = IndexModel(entry)
        fields.add(IndexModelField(entry).fields)
    return fields


@pytest.mark.parametrize("model", DOCUMENT_MODELS, ids=lambda m: m.__name__)
def test_no_unique_declaration_is_silently_discarded(model):
    """Beanie keys indexes by their fields and lets Settings.indexes win.

    So `Indexed(..., unique=True)` on a field that Settings also lists builds a
    plain, non-unique index -- a constraint that reads as enforced and is not.
    Nine fields were declared that way; the live databases held 36 duplicated
    refresh tokens under one of them.
    """
    shadowed = _settings_index_fields(model)
    for name, field in get_model_fields(model).items():
        attributes = get_index_attributes(field)
        if attributes is None or not attributes[1].get("unique"):
            continue
        index = IndexModelField(IndexModel([(field.alias or name, attributes[0])]))
        assert index.fields not in shadowed, (
            f"{model.__name__}.{name} is declared unique, but Settings.indexes "
            f"also lists it, so the index built is not unique"
        )


# --------------------------------------------------------------------------
# R21: app-created memberships are outside uniq_legacy_row
# --------------------------------------------------------------------------


def _legacy_row_filter() -> dict:
    for entry in TournamentMembership.Settings.indexes:
        if getattr(entry, "document", {}).get("name") == "uniq_legacy_row":
            return entry.document["partialFilterExpression"]
    raise AssertionError("uniq_legacy_row is not declared")


# Read at import: the db fixture removes uniq_legacy_row from the model while a
# test runs, because mongomock cannot emulate a partial unique index.
LEGACY_ROW_FILTER = _legacy_row_filter()


def _membership(**overrides) -> TournamentMembership:
    fields = {
        "user_id": PydanticObjectId(),
        "tournament_id": PydanticObjectId(),
        "tournament_slug": "dcpl",
        "display_name": "rahul",
    }
    fields.update(overrides)
    return TournamentMembership(**fields)


@pytest.mark.asyncio
async def test_app_created_memberships_fall_outside_the_legacy_row_index(db):
    """The unique index must not cover memberships with no legacy row.

    Beanie stores their empty provenance as null. The first filter used
    `$exists`, which matches null, so every app-created membership shared the
    key (null, null) and the second one was refused as a duplicate.
    """
    for _ in range(2):
        await _membership().insert()
    await _membership(source_db="Dcpl", legacy_user_id=PydanticObjectId()).insert()

    collection = TournamentMembership.get_motor_collection()
    assert await collection.count_documents({"legacy_user_id": None}) == 2
    assert await collection.count_documents(LEGACY_ROW_FILTER) == 1


def test_a_legacy_row_must_name_its_database():
    with pytest.raises(ValidationError):
        _membership(legacy_user_id=PydanticObjectId())

    _membership(source_db="Dcpl", legacy_user_id=PydanticObjectId())
    _membership()


# --------------------------------------------------------------------------
# the flawed index is replaced at startup, and nothing else is touched
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_startup_drops_the_flawed_legacy_row_index():
    """Built on Dcpl and rspl before R21 was fixed.

    init_beanie never drops an index and MongoDB will not redefine one under
    the same name, so without this step the corrected definition would stop
    the service from starting.
    """
    database = AsyncMongoMockClient()["live-db"]
    collection = database["tournament_memberships"]
    await collection.create_index(
        [("source_db", 1), ("legacy_user_id", 1)],
        unique=True,
        partialFilterExpression={"legacy_user_id": {"$exists": True}},
        name="uniq_legacy_row",
    )

    dropped = await drop_flawed_indexes(database)

    assert dropped == ["tournament_memberships.uniq_legacy_row"]
    assert "uniq_legacy_row" not in await collection.index_information()


@pytest.mark.asyncio
async def test_startup_leaves_the_corrected_index_alone():
    database = AsyncMongoMockClient()["live-db"]
    collection = database["tournament_memberships"]
    await collection.create_index(
        [("source_db", 1), ("legacy_user_id", 1)],
        unique=True,
        partialFilterExpression=LEGACY_ROW_FILTER,
        name="uniq_legacy_row",
    )

    assert await drop_flawed_indexes(database) == []
    assert "uniq_legacy_row" in await collection.index_information()


@pytest.mark.asyncio
async def test_startup_does_nothing_on_a_new_database():
    database = AsyncMongoMockClient()["walle_arena"]

    assert await drop_flawed_indexes(database) == []


def test_the_corrected_filter_is_not_itself_listed_as_flawed():
    """Otherwise every startup would drop and rebuild the live index."""
    for _, name, wrong_filter in FLAWED_INDEXES:
        if name == "uniq_legacy_row":
            assert wrong_filter != LEGACY_ROW_FILTER


# --------------------------------------------------------------------------
# sponsor priority is unique per tournament, not across all of them (R38)
# --------------------------------------------------------------------------


def _sponsor_priority_index() -> dict:
    for entry in Sponsor.Settings.indexes:
        document = getattr(entry, "document", {})
        if document.get("name") == "uniq_sponsor_priority_per_tournament":
            return document
    raise AssertionError("uniq_sponsor_priority_per_tournament is not declared")


@pytest.mark.asyncio
async def test_two_tournaments_may_both_have_a_priority_3_sponsor():
    """One database holds every tournament's sponsors after the migration.

    Built from the declared keys: mongomock cannot apply the partial filter,
    and every sponsor here has a priority above zero anyway.
    """
    index = _sponsor_priority_index()
    sponsors = AsyncMongoMockClient()["walle_arena"]["sponsors"]
    await sponsors.create_index(list(index["key"].items()), unique=True)
    dcpl, tpl = PydanticObjectId(), PydanticObjectId()

    await sponsors.insert_one({"tournament_id": dcpl, "featured": False, "priority": 3})
    await sponsors.insert_one({"tournament_id": tpl, "featured": False, "priority": 3})

    with pytest.raises(DuplicateKeyError):
        await sponsors.insert_one(
            {"tournament_id": dcpl, "featured": False, "priority": 3}
        )


@pytest.mark.asyncio
async def test_startup_drops_the_tournament_blind_sponsor_priority_index():
    """Built on every database before R38; it stopped the migration's phase 3
    at the second tournament with sponsors."""
    database = AsyncMongoMockClient()["live-db"]
    collection = database["sponsors"]
    await collection.create_index(
        [("featured", 1), ("priority", 1)],
        unique=True,
        partialFilterExpression={"priority": {"$gt": 0}},
    )

    dropped = await drop_flawed_indexes(database)

    assert dropped == ["sponsors.featured_1_priority_1"]
    assert "featured_1_priority_1" not in await collection.index_information()


def test_the_corrected_sponsor_index_is_not_listed_as_flawed():
    assert "uniq_sponsor_priority_per_tournament" not in {
        name for _, name, _ in FLAWED_INDEXES
    }
    assert next(iter(_sponsor_priority_index()["key"])) == "tournament_id"
