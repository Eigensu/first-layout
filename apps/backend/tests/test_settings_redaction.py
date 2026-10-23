"""The database URL a service prints on startup must not carry its password."""

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
