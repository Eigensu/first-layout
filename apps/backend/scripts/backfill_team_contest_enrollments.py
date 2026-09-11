import asyncio
from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId

from app.common.datetime_utils import utc_now
from app.models.contest import Contest
from app.models.team import Team
from app.models.team_contest_enrollment import TeamContestEnrollment
from config.database import close_mongo_connection, connect_to_mongo


async def resolve_contest(contest_id_value: str) -> Optional[Contest]:
    """
    Try to resolve a Contest from an arbitrary team.contest_id value.
    Strategy:
      1) Treat as ObjectId and fetch Contest.get()
      2) Fallback: treat value as a code and find by code
    Returns None if not found.
    """
    # Try ObjectId lookup
    try:
        oid = PydanticObjectId(contest_id_value)
        contest = await Contest.get(oid)
        if contest:
            return contest
    except Exception:
        pass

    # Fallback: look up by code
    contest = await Contest.find_one(Contest.code == contest_id_value)
    return contest


async def backfill(dry_run: bool = True) -> None:
    print(f"Backfill start — dry_run={dry_run}")

    # Find teams with legacy contest_id present
    teams = await Team.find(Team.contest_id != None).to_list()  # type: ignore
    print(f"Found {len(teams)} teams with legacy contest_id")

    migrated = 0
    skipped = 0

    for team in teams:
        if not team.contest_id:
            continue

        contest = await resolve_contest(team.contest_id)
        if not contest:
            print(f"[SKIP] No contest found for team {team.id} legacy contest_id='{team.contest_id}'")
            skipped += 1
            continue

        # Check existing active enrollment to avoid dupes
        existing = await TeamContestEnrollment.find_one(
            (TeamContestEnrollment.team_id == team.id)
            & (TeamContestEnrollment.contest_id == contest.id)
            & (TeamContestEnrollment.status == "active")
        )
        if existing:
            print(f"[SKIP] Enrollment already exists for team={team.id} contest={contest.id}")
            skipped += 1
            continue

        if dry_run:
            print(
                f"[PLAN] Enroll team={team.id} user={team.user_id} contest={contest.id}"
            )
            migrated += 1
        else:
            enr = TeamContestEnrollment(
                team_id=team.id,
                user_id=team.user_id,
                contest_id=contest.id,
                status="active",
                enrolled_at=utc_now(),
            )
            await enr.insert()
            print(
                f"[OK] Enrolled team={team.id} user={team.user_id} contest={contest.id}"
            )
            migrated += 1

    print(f"Backfill done: migrated={migrated}, skipped={skipped}")


async def main():
    await connect_to_mongo()
    try:
        # Execute backfill in write mode by default
        await backfill(dry_run=False)
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
