"""Phases 3-6 end to end, against two small source databases.

Each phase is run the way phase 6 runs it -- again, after the sources have
changed -- and phase 5 is checked to fail on exactly the half-finished states
it used to pass (spec §13.4-13.7, R10-R20).
"""

import importlib
from datetime import datetime

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient, AsyncMongoMockCollection

from scripts.unified_auth.apply_accounts import apply_accounts
from scripts.unified_auth.identity_graph import build_components
from scripts.unified_auth.loader import load_rows
from scripts.unified_auth.merge_apply import plan_accounts
from scripts.unified_auth.tenant_import import LEDGER, copy_gridfs_file
from scripts.unified_auth.verify import verify

phase3 = importlib.import_module("scripts.unified_auth.04_import_tenant_data")
phase4 = importlib.import_module("scripts.unified_auth.05_copy_avatars")
phase6 = importlib.import_module("scripts.unified_auth.07_resync_delta")

SLUGS = {"lpcl_db": "lpcl", "fifth_db": "fifth"}
WHEN = datetime(2026, 1, 10)


def gridfs_file(db, bucket, content_type):
    file_id = ObjectId()
    return file_id, [
        (
            f"{bucket}.chunks",
            {"_id": ObjectId(), "files_id": file_id, "n": 0, "data": b"img"},
        ),
        (
            f"{bucket}.files",
            {
                "_id": file_id,
                "length": 3,
                "chunkSize": 261120,
                "filename": "f",
                "metadata": {"content_type": content_type},
            },
        ),
    ]


@pytest.fixture
async def world():
    """Two tournaments, one person who played both, and some game data."""
    client = AsyncMongoMockClient()
    dest = client["walle_arena"]
    tournaments = {}
    for slug in SLUGS.values():
        tournaments[slug] = (
            await dest["tournaments"].insert_one({"slug": slug})
        ).inserted_id

    ids = {}
    for db_name, mobile in (("lpcl_db", "9876543210"), ("fifth_db", "+91 98765 43210")):
        src = client[db_name]
        avatar_id, avatar_docs = gridfs_file(src, "avatars", "image/png")
        logo_id, logo_docs = gridfs_file(src, "contest_logos", "image/webp")
        for coll, doc in avatar_docs + logo_docs:
            await src[coll].insert_one(doc)
        user = await src["users"].insert_one(
            {
                "username": f"rahul_{db_name}",
                "email": f"rahul@{db_name}.com",
                "mobile": mobile,
                "full_name": "Rahul Patel",
                "hashed_password": f"hash-{db_name}",
                "is_active": True,
                "created_at": WHEN,
                "last_login": WHEN,
                "avatar_file_id": str(avatar_id),
            }
        )
        contest = await src["contests"].insert_one(
            {"code": "FINAL", "logo_file_id": str(logo_id)}
        )
        team = await src["teams"].insert_one(
            {"user_id": user.inserted_id, "contest_id": contest.inserted_id}
        )
        await src["team_contest_enrollments"].insert_one(
            {
                "user_id": user.inserted_id,
                "team_id": team.inserted_id,
                "contest_id": contest.inserted_id,
                "status": "active",
            }
        )
        await src["global_settings"].insert_one(
            {"_id": "global", "max_players_per_team": 5, "min_players_per_team": 2}
        )
        ids[db_name] = {
            "user": user.inserted_id,
            "contest": contest.inserted_id,
            "avatar": avatar_id,
            "logo": logo_id,
        }
    return client, dest, tournaments, ids


async def migrate(client, dest, tournaments):
    rows = await load_rows(client, list(SLUGS))
    components, junk = build_components(rows)
    planned = [
        (f"g{i}", plan_accounts(c, f"g{i}", None, junk))
        for i, c in enumerate(components)
    ]
    await apply_accounts(dest, planned, SLUGS, tournaments, set(), apply=True)
    reports = [
        await phase3.import_tenant(client, dest, db, slug, apply=True)
        for db, slug in SLUGS.items()
    ]
    await phase4.copy_avatars(client, dest, apply=True)
    return reports


async def check(client, dest, tournaments):
    return await verify(
        dest,
        {db: client[db] for db in SLUGS},
        {db: tournaments[slug] for db, slug in SLUGS.items()},
    )


def failed(result):
    return {c.name for c in result.checks if not c.ok}


# --------------------------------------------------------------------------
# a full migration passes, and passes again
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_complete_migration_verifies(world):
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)

    result = await check(client, dest, tournaments)

    assert result.ok, [(c.name, c.detail, c.sample) for c in result.checks if not c.ok]
    assert await dest["users"].count_documents({}) == 1


@pytest.mark.asyncio
async def test_phase_3_runs_twice(world):
    """The preflight called every copied _id a collision, so re-runs aborted (R10)."""
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)

    again = await migrate(client, dest, tournaments)

    assert again[0].copied["teams"] == 1
    assert await dest["teams"].count_documents({}) == 2
    assert (await check(client, dest, tournaments)).ok


@pytest.mark.asyncio
async def test_a_document_from_another_source_is_still_a_collision(world):
    client, dest, tournaments, ids = world
    await migrate(client, dest, tournaments)
    await client["fifth_db"]["contests"].insert_one({"_id": ids["lpcl_db"]["contest"]})

    with pytest.raises(SystemExit):
        await phase3.import_tenant(client, dest, "fifth_db", "fifth", apply=True)


@pytest.mark.asyncio
async def test_a_deletion_in_a_source_reaches_the_unified_database(world):
    """An upsert-only import kept contests deleted before cutover (R11)."""
    client, dest, tournaments, ids = world
    await migrate(client, dest, tournaments)
    await client["lpcl_db"]["contests"].delete_one({"_id": ids["lpcl_db"]["contest"]})

    reports = await migrate(client, dest, tournaments)

    assert reports[0].removed == {"contests": 1}
    assert not await dest["contests"].find_one({"_id": ids["lpcl_db"]["contest"]})
    assert not await dest[LEDGER].find_one({"doc_id": ids["lpcl_db"]["contest"]})


# --------------------------------------------------------------------------
# settings and files
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_each_tournament_keeps_its_own_settings(world):
    """Every source's settings were called "global" and none was copied (R12)."""
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)
    await migrate(client, dest, tournaments)

    rows = [r async for r in dest["global_settings"].find({})]
    assert sorted(r["_id"] for r in rows) == sorted(
        f"tournament:{t}" for t in tournaments.values()
    )
    assert {r["max_players_per_team"] for r in rows} == {5}


@pytest.mark.asyncio
async def test_contest_logos_come_across_under_their_own_id(world):
    """Only avatars were copied; every logo 404'd after cutover (R13)."""
    client, dest, tournaments, ids = world
    await migrate(client, dest, tournaments)

    logo = await dest["contest_logos.files"].find_one({"_id": ids["lpcl_db"]["logo"]})
    assert logo["metadata"]["content_type"] == "image/webp"
    assert (
        await dest["contest_logos.chunks"].count_documents(
            {"files_id": ids["lpcl_db"]["logo"]}
        )
        == 1
    )


@pytest.mark.asyncio
async def test_an_avatar_keeps_its_type_and_is_copied_once(world):
    """It was relabelled image/jpeg (R15) and re-uploaded on every run (R16)."""
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)
    await migrate(client, dest, tournaments)

    user = await dest["users"].find_one({})
    files = [f async for f in dest["avatars.files"].find({})]
    assert len(files) == 1
    assert files[0]["_id"] == ObjectId(user["avatar_file_id"])
    assert files[0]["metadata"]["content_type"] == "image/png"


@pytest.mark.asyncio
async def test_copying_a_file_twice_reports_it_present():
    client = AsyncMongoMockClient()
    src, dest = client["src"], client["dest"]
    file_id, docs = gridfs_file(src, "avatars", "image/png")
    for coll, doc in docs:
        await src[coll].insert_one(doc)

    assert await copy_gridfs_file(src, dest, "avatars", file_id) == "copied"
    assert await copy_gridfs_file(src, dest, "avatars", file_id) == "present"
    assert await copy_gridfs_file(src, dest, "avatars", ObjectId()) == "missing"


@pytest.mark.asyncio
async def test_an_avatar_missing_from_its_source_is_cleared(world):
    client, dest, tournaments, ids = world
    for db in SLUGS:
        await client[db]["avatars.files"].delete_many({})

    await migrate(client, dest, tournaments)

    user = await dest["users"].find_one({})
    assert user["avatar_file_id"] is None
    assert user["avatar_url"] is None


# --------------------------------------------------------------------------
# phase 6
# --------------------------------------------------------------------------


def test_the_delta_reruns_every_phase_with_the_backfills_arguments():
    """It skipped work it could not see change (R17), never copied avatars
    (R18), and dropped the admin list and --copy-of on the way through."""
    commands = phase6.phase_commands(
        ["Dcpl=dcpl", "rspl=rspl"],
        ["world_tower=walle_fantasy"],
        "admins.txt",
        apply=True,
    )
    scripts = [c[1].rsplit("/", 1)[-1] for c in commands]

    assert scripts == [
        "03_apply_merges.py",
        "04_import_tenant_data.py",
        "04_import_tenant_data.py",
        "05_copy_avatars.py",
    ]
    phase2 = commands[0]
    assert phase2[phase2.index("--copy-of") + 1] == "world_tower=walle_fantasy"
    assert phase2[phase2.index("--platform-admins") + 1] == "admins.txt"
    assert all(c[-1] == "--apply" for c in commands)


# --------------------------------------------------------------------------
# phase 5 fails on what is missing, not only on what is wrong (R20)
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verification_fails_when_phase_3_did_not_run(world):
    client, dest, tournaments, _ = world
    rows = await load_rows(client, list(SLUGS))
    components, junk = build_components(rows)
    planned = [
        (f"g{i}", plan_accounts(c, f"g{i}", None, junk))
        for i, c in enumerate(components)
    ]
    await apply_accounts(dest, planned, SLUGS, tournaments, set(), apply=True)

    result = await check(client, dest, tournaments)

    assert "every source document was copied" in failed(result)


@pytest.mark.asyncio
async def test_verification_fails_on_a_missing_membership(world):
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)
    await dest["tournament_memberships"].delete_one({})

    assert "every row that earns a membership has one" in failed(
        await check(client, dest, tournaments)
    )


@pytest.mark.asyncio
async def test_verification_fails_on_a_missing_file(world):
    client, dest, tournaments, ids = world
    await migrate(client, dest, tournaments)
    await dest["contest_logos.files"].delete_one({"_id": ids["fifth_db"]["logo"]})

    assert "every file a document points at was copied" in failed(
        await check(client, dest, tournaments)
    )


@pytest.mark.asyncio
async def test_an_account_deleted_everywhere_is_not_reported_as_locked_out(world):
    """It carries no credential by design (R1), and that is not a failure."""
    client, dest, tournaments, ids = world
    for db in SLUGS:
        await client[db]["users"].update_many({}, {"$set": {"is_active": False}})

    await migrate(client, dest, tournaments)

    assert "every live account has a usable credential" not in failed(
        await check(client, dest, tournaments)
    )


@pytest.mark.asyncio
async def test_an_apple_only_account_is_not_reported_as_locked_out(world):
    client, dest, tournaments, _ = world
    await client["lpcl_db"]["users"].insert_one(
        {
            "username": "apple_user",
            "email": "apple@privaterelay.appleid.com",
            "auth_provider": "apple",
            "apple_id": "apple-sub-9",
            "hashed_password": None,
            "is_active": True,
            "created_at": WHEN,
        }
    )

    await migrate(client, dest, tournaments)

    user = await dest["users"].find_one({"apple_ids": "apple-sub-9"})
    assert user is not None
    assert "every live account has a usable credential" not in failed(
        await check(client, dest, tournaments)
    )


@pytest.mark.asyncio
async def test_an_import_stopped_between_its_two_writes_resumes(world, monkeypatch):
    """Each copy is two writes: its claim in the ledger and the document.

    Stopped in between, the next run has to recognise the work as its own --
    a document without a claim is indistinguishable from another source's.
    """
    client, dest, tournaments, _ = world
    rows = await load_rows(client, list(SLUGS))
    components, junk = build_components(rows)
    planned = [
        (f"g{i}", plan_accounts(c, f"g{i}", None, junk))
        for i, c in enumerate(components)
    ]
    await apply_accounts(dest, planned, SLUGS, tournaments, set(), apply=True)

    writes = []
    real_update, real_replace = (
        AsyncMongoMockCollection.update_one,
        AsyncMongoMockCollection.replace_one,
    )

    def crash_on_second(real):
        async def write(self, *args, **kwargs):
            if self.name in ("contests", LEDGER):
                writes.append(self.name)
                if len(writes) == 2:
                    raise ConnectionError("stopped mid-import")
            return await real(self, *args, **kwargs)

        return write

    monkeypatch.setattr(
        AsyncMongoMockCollection, "update_one", crash_on_second(real_update)
    )
    monkeypatch.setattr(
        AsyncMongoMockCollection, "replace_one", crash_on_second(real_replace)
    )
    with pytest.raises(ConnectionError):
        await phase3.import_tenant(client, dest, "lpcl_db", "lpcl", apply=True)
    monkeypatch.undo()

    report = await phase3.import_tenant(client, dest, "lpcl_db", "lpcl", apply=True)

    assert report.copied["contests"] == 1


@pytest.mark.asyncio
async def test_verification_compares_identities_not_counts(world):
    """A deletion and an addition since the last run leave every count equal."""
    client, dest, tournaments, ids = world
    await migrate(client, dest, tournaments)
    src = client["lpcl_db"]
    await src["contests"].delete_one({"_id": ids["lpcl_db"]["contest"]})
    await src["contests"].insert_one({"code": "SEMI"})
    await src["users"].insert_one({"username": "late", "is_active": True})
    await src["users"].delete_one({"_id": ids["lpcl_db"]["user"]})

    failures = failed(await check(client, dest, tournaments))

    assert "every source document was copied" in failures
    assert "every legacy row maps exactly once" in failures


@pytest.mark.asyncio
async def test_verification_fails_on_a_mapping_to_nobody(world):
    """What phase 2 leaves if it stops between the map and the account."""
    client, dest, tournaments, _ = world
    await migrate(client, dest, tournaments)
    await dest["user_id_map"].insert_one(
        {
            "source_db": "lpcl_db",
            "legacy_user_id": str(ObjectId()),
            "user_id": ObjectId(),
            "earns_membership": False,
        }
    )

    assert "every mapping points at an account" in failed(
        await check(client, dest, tournaments)
    )
