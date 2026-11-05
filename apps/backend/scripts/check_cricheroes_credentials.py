"""Check that the CricHeroes credentials in the environment actually work.

Makes ONE call -- get-tournament-boundary-count, the lightest documented
endpoint -- and reports what came back. Every call is charged against the
annual quota (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §6), so this does not
retry and is not meant to be run in a loop.

Run from apps/backend, with CRICHEROES_API_KEY, CRICHEROES_SECRET_ACCESS_KEY
and CRICHEROES_UDID set (or in the monorepo-root .env):

    python scripts/check_cricheroes_credentials.py
    python scripts/check_cricheroes_credentials.py --tournament-id 2251924

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
    CricHeroesAccessError,
    CricHeroesAPIError,
    CricHeroesBlockedError,
    CricHeroesError,
)

# The two tournaments CricHeroes serve us: Tyrant Premier League Season 13 and
# its Test format. The doc's introduction calls the first 60214, but its
# parameters and its own sample data say 2242502 (spec §13.12).
SERVED_TOURNAMENT_IDS = (2242502, 2251924)
DEFAULT_TOURNAMENT_ID = SERVED_TOURNAMENT_IDS[0]

# The one refusal that proves the credentials got through: CricHeroes looked
# the tournament up and has no boundary data for it. The API doc does not say
# how bad credentials are reported -- possibly as another status:false code --
# so no other refusal counts as success.
NO_BOUNDARY_DATA = "170008"


async def check(tournament_id: int) -> int:
    async with CricHeroesClient(max_retries=0) as client:
        try:
            result = await client.get_tournament_boundary_count(tournament_id)
        except CricHeroesAccessError as exc:
            # Probably past the credentials check, but the doc does not say
            # in which order CricHeroes check, so this proves nothing.
            print(f"FAILED ({type(exc).__name__}): {exc}")
            others = [t for t in SERVED_TOURNAMENT_IDS if t != tournament_id]
            print(
                "Not proof either way: try --tournament-id "
                + " or ".join(str(t) for t in others)
                + "."
            )
            return 1
        except CricHeroesAPIError as exc:
            if str(exc.code) == NO_BOUNDARY_DATA:
                # The credentials got through; CricHeroes just has nothing for
                # this id. That still answers the question this script asks.
                print(f"OK: credentials accepted. {exc}")
                print("(Try --tournament-id with one of your tournaments for data.)")
                return 0
            print(f"FAILED ({type(exc).__name__}): {exc}")
            print(
                "CricHeroes refused the request. This may be how it rejects "
                "credentials; do not treat them as working."
            )
            return 1
        except CricHeroesBlockedError as exc:
            # The firewall stopped the request before the API saw it: the
            # credentials were not checked, so this says nothing about them.
            print(f"FAILED ({type(exc).__name__}): {exc}")
            print("The credentials were not tested; run this again once unblocked.")
            return 1
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
