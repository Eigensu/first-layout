"""Check that the CricHeroes credentials in the environment actually work.

Makes ONE call -- get-tournament-boundary-count, the lightest documented
endpoint -- and reports what came back. Every call is charged against the
annual quota (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6), so this does not
retry and is not meant to be run in a loop.

Run from apps/backend, with CRICHEROES_API_KEY, CRICHEROES_SECRET_ACCESS_KEY
and CRICHEROES_UDID set (or in the monorepo-root .env):

    python scripts/check_cricheroes_credentials.py
    python scripts/check_cricheroes_credentials.py --tournament-id 1493258

Exits 0 when CricHeroes accepted the credentials, 1 otherwise.
"""

import argparse
import asyncio
import os
import sys

# Ensure we can import backend packages when run from repo root
CURRENT_DIR = os.path.dirname(__file__)
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Settings() refuses to load without the app's own secrets, which this script
# does not use. Placeholders keep a missing app secret from failing the check
# for a reason that has nothing to do with CricHeroes. Real values, if set, win.
os.environ.setdefault("SECRET_KEY", "cricheroes-check-placeholder-secret-key-00")
os.environ.setdefault("JWT_SECRET_KEY", "cricheroes-check-placeholder-jwt-secret-00")

from app.services.cricheroes_client import CricHeroesClient  # noqa: E402
from app.services.cricheroes_errors import (  # noqa: E402
    CricHeroesAPIError,
    CricHeroesError,
)

# The tournament the API doc's examples use. Its sample teams are the MWPL
# sides, so it is very likely ours -- confirm before relying on it.
DEFAULT_TOURNAMENT_ID = 1493258


async def check(tournament_id: int) -> int:
    async with CricHeroesClient(max_retries=0) as client:
        try:
            result = await client.get_tournament_boundary_count(tournament_id)
        except CricHeroesAPIError as exc:
            # The credentials got through; CricHeroes just has nothing for this
            # id. That still answers the question this script asks.
            print(f"OK: credentials accepted. {exc}")
            print("(Try --tournament-id with one of your tournaments for data.)")
            return 0
        except CricHeroesError as exc:
            print(f"FAILED ({type(exc).__name__}): {exc}")
            return 1

    print(f"OK: credentials accepted. Boundary count for {tournament_id}:")
    for key, value in result.model_dump().items():
        print(f"  {key}: {value}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--tournament-id",
        type=int,
        default=DEFAULT_TOURNAMENT_ID,
        help=f"CricHeroes tournament id (default {DEFAULT_TOURNAMENT_ID})",
    )
    args = parser.parse_args()
    return asyncio.run(check(args.tournament_id))


if __name__ == "__main__":
    sys.exit(main())
