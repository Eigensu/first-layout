"""scripts/refresh_membership_stats.py: its report goes through logging.

The hourly walle-stats-cron is only visible in PostHog Logs through the
logging handler; a print() reaches the console and nothing else.
"""

import argparse
import logging
from types import SimpleNamespace

import scripts.refresh_membership_stats as script
from config.settings import get_settings


async def test_the_report_is_logged(monkeypatch, caplog):
    async def nothing():
        return None

    async def refresh(tournament):
        return SimpleNamespace(slug=tournament.slug, members=74, created=2)

    class Query:
        async def to_list(self):
            return [SimpleNamespace(slug="wtsa")]

    monkeypatch.setattr(script, "setup_observability", lambda service: None)
    monkeypatch.setattr(script, "flush_observability", lambda: None)
    monkeypatch.setattr(script, "connect_to_mongo", nothing)
    monkeypatch.setattr(script, "close_mongo_connection", nothing)
    monkeypatch.setattr(script, "refresh_tournament", refresh)
    monkeypatch.setattr(
        script, "Tournament", SimpleNamespace(find=lambda *a: Query(), status=None)
    )
    monkeypatch.setattr(
        type(get_settings()), "shared_tenancy", property(lambda s: True)
    )

    with caplog.at_level(logging.INFO, logger="scripts.refresh_membership_stats"):
        args = argparse.Namespace(all_live=True, all=False, tournament=None)
        assert await script.main(args) == 0

    assert "wtsa: 74 members refreshed, 2 missing rows created" in caplog.text
