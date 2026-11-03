"""The database URL a service prints on startup must not carry its password."""

from pathlib import Path

import pytest

from config.settings import Settings


@pytest.mark.parametrize(
    "url, shown",
    [
        (
            "mongodb+srv://walle_user:s3cr3t%40pw@cluster0.abc12.mongodb.net/"
            "?retryWrites=true&w=majority&appName=Walle",
            "mongodb+srv://cluster0.abc12.mongodb.net/",
        ),
        # A password may itself contain "@" once decoded; only the last one
        # ends the credentials.
        (
            "mongodb://user:p@ss@db.example.com:27017/walle_arena",
            "mongodb://db.example.com:27017/walle_arena",
        ),
        ("mongodb://localhost:27017", "mongodb://localhost:27017"),
    ],
)
def test_mongodb_url_redacted(monkeypatch, url, shown):
    monkeypatch.setenv("MONGODB_URL", url)
    settings = Settings(_env_file=None)
    assert settings.mongodb_url_redacted == shown
    assert "s3cr3t" not in settings.mongodb_url_redacted
    assert "ss@" not in settings.mongodb_url_redacted


def test_redact_mongodb_url_needs_no_settings(monkeypatch):
    # Standalone scripts call it without SECRET_KEY and the rest set.
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    from config.redaction import redact_mongodb_url

    shown = redact_mongodb_url(
        "mongodb+srv://walle_user:s3cr3t@cluster0.abc12.mongodb.net/?w=majority"
    )
    assert shown == "mongodb+srv://cluster0.abc12.mongodb.net/"


@pytest.mark.parametrize(
    "script",
    ["cleanup_slots.py", "report_duplicate_active_contest_enrollments.py"],
)
def test_scripts_print_the_redacted_url(script):
    source = (Path(__file__).resolve().parent.parent / "scripts" / script).read_text()
    assert 'print(f"Connecting to MongoDB at: {mongo_uri}")' not in source
    assert "redact_mongodb_url(mongo_uri)" in source
