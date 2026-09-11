import argparse
import asyncio
import os
import sys
from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId

# Ensure we can import backend packages when run from repo root
CURRENT_DIR = os.path.dirname(__file__)
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.common.datetime_utils import utc_now
from app.models.contest import Contest
from config.database import close_mongo_connection, connect_to_mongo


async def resolve_contest(contest_id: Optional[str], contest_code: Optional[str]) -> Optional[Contest]:
    if contest_id:
        try:
            oid = PydanticObjectId(contest_id)
            contest = await Contest.get(oid)
            if contest:
                return contest
        except Exception:
            pass
    if contest_code:
        contest = await Contest.find_one(Contest.code == contest_code)
        if contest:
            return contest
    return None


async def add_allowed_team(contest: Contest, team_code: str, dry_run: bool = False) -> bool:
    if contest.contest_type != "daily":
        raise ValueError("Contest is not of type 'daily'")

    if team_code in contest.allowed_teams:
        print(f"[SKIP] Team '{team_code}' already allowed for contest {contest.code} ({contest.id})")
        return False

    print(f"[PLAN] Add team '{team_code}' to allowed_teams for contest {contest.code} ({contest.id})")
    if dry_run:
        return True

    contest.allowed_teams.append(team_code)
    contest.updated_at = utc_now()
    await contest.save()
    print(f"[OK] Added team '{team_code}' to contest {contest.code} ({contest.id})")
    return True


async def main_async(args: argparse.Namespace) -> None:
    await connect_to_mongo()
    try:
        contest = await resolve_contest(args.contest_id, args.contest_code)
        if not contest:
            raise SystemExit("Contest not found. Provide a valid --contest-id or --contest-code")

        await add_allowed_team(contest, args.team, dry_run=args.dry_run)
    finally:
        await close_mongo_connection()


def main() -> None:
    parser = argparse.ArgumentParser(description="Add an allowed team to a daily contest")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--contest-id", help="Contest ObjectId")
    group.add_argument("--contest-code", help="Contest code")
    parser.add_argument("--team", required=True, help="Real-world team code or name to allow (e.g., IND, AUS)")
    parser.add_argument("--dry-run", action="store_true", help="Plan changes without writing")

    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
