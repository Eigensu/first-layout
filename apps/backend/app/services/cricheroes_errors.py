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

# Documented codes we act on (doc of 4 Nov 2026, spec §7). Compared as
# strings: the doc shows numbers, but nothing promises it.
ACCESS_DENIED_CODE = "170001"  # a tournament, or its match, outside our agreement
MATCH_NOT_FOUND_CODE = "170002"  # no such match; sent with HTTP 403
SQUAD_NOT_FOUND_CODE = "170003"  # the match has no playing squad

# The codes CricHeroes send with HTTP 403 that are about the id, not about our
# credentials. Any other 403 is read as rejected credentials.
ID_REFUSAL_CODES = frozenset({ACCESS_DENIED_CODE, MATCH_NOT_FOUND_CODE})


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
    """CricHeroes rejected our credentials: HTTP 401, or a 403 without a
    documented code (see ACCESS_DENIED_CODE and MATCH_NOT_FOUND_CODE)."""

    def __init__(self, status_code: int):
        self.status_code = status_code
        super().__init__(
            f"CricHeroes rejected the request credentials (HTTP {status_code}). "
            f"Check {', '.join(CREDENTIAL_ENV_VARS)} hold the values CricHeroes "
            "issued us: the API doc's examples may not be ours, and its secret is a "
            "placeholder."
        )


class CricHeroesRateLimitError(CricHeroesError):
    """CricHeroes answered 429 and the retries ran out.

    CricHeroes return 429 above 50 requests per second, and charge it against
    the quota like a successful call (spec §13.4). Calls past the quota are
    billed rather than refused, so a 429 is very likely the rate limit -- which,
    at our volumes, more likely means a runaway loop than real load.
    """

    def __init__(self, retry_after: Optional[float] = None):
        self.retry_after = retry_after
        wait = (
            f" CricHeroes asked us to wait {retry_after:g}s."
            if retry_after is not None
            else ""
        )
        super().__init__(
            "CricHeroes is throttling our requests (HTTP 429): more than 50 "
            "requests per second. Throttled requests are still charged against "
            "the annual call quota." + wait
        )


class CricHeroesAPIError(CricHeroesError):
    """`status: false` -- CricHeroes has no such data. Usually an HTTP 200; a
    match that does not exist (170002) comes as a 403."""

    def __init__(
        self, code: Optional[int], message: Optional[str], text: Optional[str] = None
    ):
        self.code = code
        self.message = message
        super().__init__(
            text
            or f"CricHeroes returned an error (code {code}): {message or 'no message'}"
        )


class CricHeroesAccessError(CricHeroesAPIError):
    """Code 170001: our credentials work, but CricHeroes serve us only the
    tournaments in our agreement, and this id is not one of them."""

    def __init__(self, code: Optional[int], message: Optional[str]):
        super().__init__(
            code,
            message,
            text=(
                "CricHeroes do not give us access to this tournament or match "
                f"(code {code}: {message or 'no message'}). Only the tournaments "
                "in our CricHeroes agreement can be read."
            ),
        )


def api_error(code: Optional[int], message: Optional[str]) -> CricHeroesAPIError:
    """The exception for a `status: false` body, whatever the HTTP status it
    came with: 170001 is an access refusal, anything else is "no such data"."""
    if str(code) == ACCESS_DENIED_CODE:
        return CricHeroesAccessError(code, message)
    return CricHeroesAPIError(code, message)


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
