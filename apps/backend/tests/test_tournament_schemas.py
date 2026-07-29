import pytest
from datetime import datetime, timezone
from pydantic import ValidationError

from app.schemas.tournament import (
    validate_slug,
    TournamentCreate,
    TournamentUpdate,
    TournamentResponse,
)
from app.utils.timezone import IST


class TestValidateSlug:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("dpcl", "dpcl"),
            ("DPCL", "dpcl"),
            ("  dpcl  ", "dpcl"),
            ("summer-cup-2026", "summer-cup-2026"),
            ("a-b-c", "a-b-c"),
            ("abc", "abc"),
            ("a" * 32, "a" * 32),
        ],
    )
    def test_accepts_valid_slugs(self, raw, expected):
        assert validate_slug(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "a",
            "ab",
            "a" * 33,
            "-bad",
            "bad-",
            "-bad-",
            "bad_slug",
            "Bad Slug",
            "bad!",
            "café",
        ],
    )
    def test_rejects_malformed_slugs(self, raw):
        with pytest.raises(ValueError):
            validate_slug(raw)

    @pytest.mark.parametrize(
        "reserved",
        ["www", "api", "admin", "mail", "staging", "docs", "status"],
    )
    def test_rejects_reserved_subdomains(self, reserved):
        with pytest.raises(ValueError, match="reserved"):
            validate_slug(reserved)

    @pytest.mark.parametrize("raw", ["api-foo", "api-lpcl", "my-api", "team-api"])
    def test_rejects_api_prefixed_or_suffixed_slugs(self, raw):
        with pytest.raises(ValueError, match="api"):
            validate_slug(raw)


class TestTournamentCreate:
    def test_defaults_status_to_draft(self):
        t = TournamentCreate(slug="dpcl", name="DPCL")
        assert t.status.value == "draft"

    def test_normalizes_slug_case(self):
        t = TournamentCreate(slug="DPCL", name="DPCL")
        assert t.slug == "dpcl"

    def test_rejects_invalid_slug(self):
        with pytest.raises(ValidationError):
            TournamentCreate(slug="www", name="Bad")

    def test_rejects_missing_name(self):
        with pytest.raises(ValidationError):
            TournamentCreate(slug="dpcl")

    def test_naive_datetime_string_treated_as_ist(self):
        t = TournamentCreate(
            slug="dpcl", name="DPCL", start_at="2026-08-01T10:00:00"
        )
        assert t.start_at.tzinfo == IST
        assert t.start_at.hour == 10

    def test_utc_z_suffix_converted_to_ist(self):
        t = TournamentCreate(
            slug="dpcl", name="DPCL", start_at="2026-08-01T04:30:00Z"
        )
        assert t.start_at.tzinfo == IST
        assert t.start_at.hour == 10
        assert t.start_at.minute == 0

    def test_naive_datetime_object_treated_as_ist(self):
        naive = datetime(2026, 8, 1, 10, 0, 0)
        t = TournamentCreate(slug="dpcl", name="DPCL", start_at=naive)
        assert t.start_at.tzinfo == IST
        assert t.start_at.hour == 10

    def test_aware_datetime_converted_to_ist(self):
        utc_dt = datetime(2026, 8, 1, 4, 30, 0, tzinfo=timezone.utc)
        t = TournamentCreate(slug="dpcl", name="DPCL", start_at=utc_dt)
        assert t.start_at.tzinfo == IST
        assert t.start_at.hour == 10

    def test_explicit_none_start_at_passes_through(self):
        t = TournamentCreate(slug="dpcl", name="DPCL", start_at=None)
        assert t.start_at is None


class TestTournamentUpdate:
    def test_allows_omitted_fields(self):
        u = TournamentUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_none_slug_passes_through(self):
        u = TournamentUpdate(slug=None)
        assert u.slug is None

    def test_provided_slug_is_validated(self):
        with pytest.raises(ValidationError):
            TournamentUpdate(slug="www")

    def test_provided_slug_is_normalized(self):
        u = TournamentUpdate(slug="DPCL")
        assert u.slug == "dpcl"

    def test_null_clears_optional_field(self):
        u = TournamentUpdate(description=None)
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {"description": None}


class TestTournamentResponse:
    def test_none_datetime_fields_pass_through(self):
        r = TournamentResponse(
            id="000000000000000000000000",
            slug="dpcl",
            name="DPCL",
            status="draft",
            start_at=None,
            end_at=None,
            created_at=datetime(2026, 1, 1, tzinfo=IST),
            updated_at=datetime(2026, 1, 1, tzinfo=IST),
        )
        assert r.start_at is None
        assert r.end_at is None
