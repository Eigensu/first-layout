"""CricHeroes response bodies shared by the CricHeroes test files.

Not a test module. pytest puts tests/ on sys.path, so the test files import it
as `cricheroes_responses`.
"""

import httpx


def refusal(code, message, status: int = 200) -> httpx.Response:
    """A `status: false` body, as CricHeroes send for "no such data" (mostly
    with a 200) and for an id they refuse (with a 403)."""
    return httpx.Response(
        status, json={"status": False, "error": {"code": code, "message": message}}
    )
