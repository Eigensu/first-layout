"""Phase 6 -- pick up what changed while the backfill was running.

    python scripts/unified_auth/07_resync_delta.py \\
        --map Dcpl=dcpl --map rspl=rspl ... \\
        --copy-of world_tower=walle_fantasy --platform-admins admins.txt \\
        --links merge_review.csv --apply

The backfill reads live databases, so anyone who signed up, played, reset a
password or deleted their account during it is out of date in the unified
one. This re-runs phases 2, 3 and 4 in full, inside the read-only window at
cutover, then phase 5 must be run again.

There is no change detection. An earlier version looked only at users and
teams and so missed a scoring update or a deleted contest (spec §13.6, R17).
Every phase is re-runnable and the whole migration is a few thousand users,
so re-running everything is both the simpler and the only complete answer.

Pass the same --copy-of, --platform-admins and --links as the backfill:
phase 2 rewrites every account, and without the list it would take platform
admin away from everyone on it, and without the links it would plan every
reviewed group as unreviewed again.
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(__file__)


def phase_commands(maps, copies, platform_admins, apply, links=None):
    """The phases to re-run, in order, as argument lists."""
    phase2 = [a for m in maps for a in ("--map", m)]
    phase2 += [a for c in copies for a in ("--copy-of", c)]
    if platform_admins:
        phase2 += ["--platform-admins", platform_admins]
    if links:
        phase2 += ["--links", links]

    commands = [("03_apply_merges.py", phase2)]
    for pair in maps:
        db, slug = pair.split("=", 1)
        commands.append(("04_import_tenant_data.py", ["--db", db, "--slug", slug]))
    commands.append(("05_copy_avatars.py", []))

    return [
        [sys.executable, os.path.join(HERE, script), *extra]
        + (["--apply"] if apply else [])
        for script, extra in commands
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", action="append", required=True, help="sourcedb=slug")
    parser.add_argument("--copy-of", action="append", default=[])
    parser.add_argument("--platform-admins")
    parser.add_argument("--links")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    commands = phase_commands(
        args.map, args.copy_of, args.platform_admins, args.apply, args.links
    )
    for cmd in commands:
        print(f"\n$ {' '.join(cmd)}")
        subprocess.run(cmd, check=True)

    maps = " ".join(f"--map {m}" for m in args.map)
    print(f"\nNow run phase 5 again: 06_verify.py {maps}")
    if not args.apply:
        print("Dry run -- nothing was written. Re-run with --apply.")


if __name__ == "__main__":
    main()
