"""Failures the CricHeroes client can raise.

Kept apart from the client so routes can import the types without importing
httpx. Each type says *whose* problem it is, because the most common failure
-- placeholder credentials -- would otherwise look exactly like an unknown
tournament id. docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §7 maps each one to a
route status.
"""

from typing import List, Optional

CREDENTIAL_ENV_VARS = (
    "CRICHEROES_API_KEY",
    "CRICHEROES_SECRET_ACCESS_KEY",
    "CRICHEROES_UDID",
)


class CricHeroesError(Exception):
    """Base for every failure raised by the CricHeroes client."""


class CricHeroesConfigError(CricHeroesError):
    """A credential is missing, so no request was sent."""

    def __init__(self, missing: List[str]):
        self.missing = list(missing)
        super().__init__(
            "CricHeroes is not configured: set "
            + ", ".join(self.missing)
            + ". No request was sent."
        )


class CricHeroesAuthError(CricHeroesError):
    """CricHeroes rejected our credentials (HTTP 401 or 403)."""

    def __init__(self, status_code: int):
        self.status_code = status_code
        super().__init__(
            f"CricHeroes rejected the request credentials (HTTP {status_code}). "
            f"Check {', '.join(CREDENTIAL_ENV_VARS)} -- the values in the "
            "CricHeroes API doc are examples, not working credentials."
        )


class CricHeroesRateLimitError(CricHeroesError):
    """CricHeroes answered 429 and the retries ran out.

    A 429 can mean a burst over 50 requests per second, which passes, or an
    exhausted annual quota, which does not. CricHeroes has not said how to tell
    them apart (spec §13.4), so the message names both.
    """

    def __init__(self, retry_after: Optional[float] = None):
        self.retry_after = retry_after
        wait = (
            f" CricHeroes asked us to wait {retry_after:g}s."
            if retry_after is not None
            else ""
        )
        super().__init__(
            "CricHeroes is throttling our requests (HTTP 429). Either we went "
            "over 50 requests per second, or the annual call quota is used up; "
            "the response does not say which." + wait
        )


class CricHeroesAPIError(CricHeroesError):
    """HTTP 200 carrying `status: false` -- CricHeroes has no such data."""

    def __init__(self, code: Optional[int], message: Optional[str]):
        self.code = code
        self.message = message
        super().__init__(
            f"CricHeroes returned an error (code {code}): {message or 'no message'}"
        )


class CricHeroesTransportError(CricHeroesError):
    """The request never got an answer: timeout, DNS, connection reset."""


class CricHeroesHTTPError(CricHeroesError):
    """CricHeroes answered with something unusable: another non-2xx, or a body
    that is not the documented JSON envelope."""

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        super().__init__(f"CricHeroes returned HTTP {status_code}: {body}")


class CricHeroesSchemaError(CricHeroesHTTPError):
    """A 200 whose `data` does not fit our model of it.

    Our models were written from the API doc's examples. When the live API
    disagrees, this names the endpoint and what did not fit, instead of the
    generic upstream error it would otherwise be.
    """

    def __init__(self, path: str, detail: str):
        self.path = path
        super().__init__(
            200,
            f"the response from {path} does not match the documented shape: {detail}",
        )
