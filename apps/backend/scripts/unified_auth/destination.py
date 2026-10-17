"""The one check every writing phase makes before it touches the destination."""

from typing import Iterable


def refuse_source_as_destination(dest_name: str, source_dbs: Iterable[str]) -> None:
    """Stop before writing into a database the migration reads from.

    Every phase writes into MONGODB_DB_NAME, and the root .env sets that to a
    live tournament's database (Dcpl) for the app's sake. Run unchanged, phase
    2 would write the merged accounts into that tournament's users, and phase 3
    would retag its game data in place.
    """
    if dest_name in set(source_dbs):
        raise SystemExit(
            f"MONGODB_DB_NAME={dest_name!r} is a source database; "
            "set it to the unified database (walle_arena)"
        )
