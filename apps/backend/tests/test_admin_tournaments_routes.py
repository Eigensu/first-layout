import httpx
import pytest
import pytest_asyncio
from cricheroes_responses import refusal

from app.routes.admin.cricheroes import get_cricheroes_client
from app.services.cricheroes_client import CricHeroesClient

BASE = "https://cricheroes.test/api/v1"
CREDS = {"api_key": "k", "secret_access_key": "s", "udid": "u"}


class ScriptedCricHeroes:
    """A CricHeroes that serves every tournament, until told otherwise, and
    counts the requests it gets."""

    def __init__(self):
        self.answer = httpx.Response(200, json={"status": True, "data": []})
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        return self.answer


@pytest_asyncio.fixture
async def cricheroes(db):
    """Put a scripted CricHeroes behind the routes that check a link with it,
    so no test here can reach the real one. Takes `db`, not `client`: `client`
    installs the admin sign-in override, which a test of the gate must not
    have."""
    from main import app

    scripted = ScriptedCricHeroes()
    http = httpx.AsyncClient(transport=httpx.MockTransport(scripted))
    served = CricHeroesClient(**CREDS, base_url=BASE, client=http)

    async def _client():
        yield served

    app.dependency_overrides[get_cricheroes_client] = _client
    yield scripted
    app.dependency_overrides.pop(get_cricheroes_client, None)
    await http.aclose()


class TestCheckSlug:
    async def test_available_slug(self, client):
        resp = await client.get("/api/admin/tournaments/check-slug/dpcl")
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"slug": "dpcl", "available": True, "reason": None}

    async def test_invalid_format_reports_unavailable_with_reason(self, client):
        resp = await client.get("/api/admin/tournaments/check-slug/www")
        assert resp.status_code == 200
        body = resp.json()
        assert body["available"] is False
        assert "reserved" in body["reason"]

    async def test_taken_slug_reports_unavailable(self, client):
        await client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        resp = await client.get("/api/admin/tournaments/check-slug/dpcl")
        body = resp.json()
        assert body["available"] is False
        assert "taken" in body["reason"]


class TestCreateTournament:
    async def test_create_success(self, client):
        resp = await client.post(
            "/api/admin/tournaments",
            json={
                "slug": "DPCL",
                "name": "Delhi Premier Cricket League",
                "start_at": "2026-08-01T10:00:00",
                "end_at": "2026-08-20T20:00:00",
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["slug"] == "dpcl"
        assert body["status"] == "draft"
        assert body["id"]

    async def test_create_rejects_duplicate_slug(self, client):
        payload = {"slug": "dpcl", "name": "DPCL"}
        first = await client.post("/api/admin/tournaments", json=payload)
        assert first.status_code == 201
        second = await client.post("/api/admin/tournaments", json=payload)
        assert second.status_code == 400
        assert (
            "already exists" in second.json()["detail"]
            or "taken" in second.json()["detail"]
        )

    async def test_create_rejects_start_after_end(self, client):
        resp = await client.post(
            "/api/admin/tournaments",
            json={
                "slug": "dpcl",
                "name": "DPCL",
                "start_at": "2026-08-20T10:00:00",
                "end_at": "2026-08-01T10:00:00",
            },
        )
        assert resp.status_code == 400

    async def test_create_rejects_invalid_slug(self, client):
        resp = await client.post(
            "/api/admin/tournaments", json={"slug": "api", "name": "Bad"}
        )
        assert resp.status_code == 422

    async def test_requires_admin_auth(self, anon_client):
        resp = await anon_client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        assert resp.status_code == 401


class TestListTournaments:
    async def _create(self, client, slug, name, status=None):
        payload = {"slug": slug, "name": name}
        if status:
            payload["status"] = status
        resp = await client.post("/api/admin/tournaments", json=payload)
        assert resp.status_code == 201
        return resp.json()

    async def test_list_empty(self, client):
        resp = await client.get("/api/admin/tournaments")
        assert resp.status_code == 200
        body = resp.json()
        assert body["tournaments"] == []
        assert body["total"] == 0

    async def test_list_returns_created_tournaments(self, client):
        await self._create(client, "dpcl", "DPCL")
        await self._create(client, "summer-cup", "Summer Cup")
        resp = await client.get("/api/admin/tournaments")
        body = resp.json()
        assert body["total"] == 2
        slugs = {t["slug"] for t in body["tournaments"]}
        assert slugs == {"dpcl", "summer-cup"}

    async def test_list_filters_by_status(self, client):
        await self._create(client, "dpcl", "DPCL", status="live")
        await self._create(client, "summer-cup", "Summer Cup", status="draft")
        resp = await client.get("/api/admin/tournaments", params={"status": "live"})
        body = resp.json()
        assert body["total"] == 1
        assert body["tournaments"][0]["slug"] == "dpcl"

    async def test_list_search_matches_name_or_slug(self, client):
        await self._create(client, "dpcl", "Delhi Premier Cricket League")
        await self._create(client, "summer-cup", "Summer Cup")
        resp = await client.get("/api/admin/tournaments", params={"search": "delhi"})
        body = resp.json()
        assert body["total"] == 1
        assert body["tournaments"][0]["slug"] == "dpcl"

    async def test_list_combined_status_and_search_filters(self, client):
        await self._create(
            client, "dpcl", "Delhi Premier Cricket League", status="live"
        )
        await self._create(
            client,
            "dpcl-archive",
            "Delhi Premier Cricket League Old",
            status="archived",
        )
        resp = await client.get(
            "/api/admin/tournaments", params={"status": "live", "search": "delhi"}
        )
        body = resp.json()
        assert body["total"] == 1
        assert body["tournaments"][0]["slug"] == "dpcl"

    async def test_list_pagination(self, client):
        for i in range(3):
            await self._create(client, f"cup-{i}", f"Cup {i}")
        resp = await client.get(
            "/api/admin/tournaments", params={"page": 1, "page_size": 2}
        )
        body = resp.json()
        assert body["total"] == 3
        assert len(body["tournaments"]) == 2


class TestGetTournament:
    async def test_get_by_id(self, client):
        created = (
            await client.post(
                "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
            )
        ).json()
        resp = await client.get(f"/api/admin/tournaments/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["slug"] == "dpcl"

    async def test_get_unknown_id_404(self, client):
        resp = await client.get("/api/admin/tournaments/000000000000000000000000")
        assert resp.status_code == 404

    async def test_get_malformed_id_400(self, client):
        resp = await client.get("/api/admin/tournaments/not-an-object-id")
        assert resp.status_code == 400


class TestUpdateTournament:
    async def _create(self, client, **overrides):
        payload = {"slug": "dpcl", "name": "DPCL"}
        payload.update(overrides)
        resp = await client.post("/api/admin/tournaments", json=payload)
        return resp.json()

    async def test_partial_update(self, client):
        created = await self._create(client)
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"name": "Delhi Premier Cricket League"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Delhi Premier Cricket League"
        assert body["slug"] == "dpcl"

    async def test_rename_to_taken_slug_rejected(self, client):
        await self._create(client, slug="dpcl", name="DPCL")
        other = await self._create(client, slug="summer-cup", name="Summer Cup")
        resp = await client.put(
            f"/api/admin/tournaments/{other['id']}", json={"slug": "dpcl"}
        )
        assert resp.status_code == 400

    async def test_rename_to_own_slug_is_noop(self, client):
        created = await self._create(client)
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}", json={"slug": "dpcl"}
        )
        assert resp.status_code == 200

    async def test_null_clears_optional_field(self, client):
        created = await self._create(client, description="Something")
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}", json={"description": None}
        )
        assert resp.status_code == 200
        assert resp.json()["description"] is None

    async def test_update_unknown_id_404(self, client):
        resp = await client.put(
            "/api/admin/tournaments/000000000000000000000000", json={"name": "X"}
        )
        assert resp.status_code == 404

    async def test_null_name_is_ignored_not_cleared(self, client):
        created = await self._create(client, name="DPCL")
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}", json={"name": None}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "DPCL"

    async def test_update_rejects_invalid_date_range(self, client):
        created = await self._create(
            client,
            start_at="2026-08-01T10:00:00",
            end_at="2026-08-20T10:00:00",
        )
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"start_at": "2026-08-25T10:00:00"},
        )
        assert resp.status_code == 400


class TestDeleteTournament:
    async def _create(self, client):
        resp = await client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        return resp.json()

    async def test_default_archives_instead_of_deleting(self, client):
        created = await self._create(client)
        resp = await client.delete(f"/api/admin/tournaments/{created['id']}")
        assert resp.status_code == 200
        assert "archived" in resp.json()["message"]

        # Still fetchable by id after archiving.
        get_resp = await client.get(f"/api/admin/tournaments/{created['id']}")
        assert get_resp.status_code == 200
        assert get_resp.json()["status"] == "archived"

    async def test_force_permanently_deletes(self, client):
        created = await self._create(client)
        resp = await client.delete(
            f"/api/admin/tournaments/{created['id']}", params={"force": "true"}
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"]

        get_resp = await client.get(f"/api/admin/tournaments/{created['id']}")
        assert get_resp.status_code == 404


class TestCricHeroesLink:
    """cricheroes_tournament_id: which CricHeroes tournament a tournament's
    public stats page reads from the cache (CRICHEROES_INTEGRATION_TECH_SPEC.md
    §13.1)."""

    @pytest.fixture(autouse=True)
    def _scripted_cricheroes(self, cricheroes):
        return cricheroes

    async def _create(self, client, **overrides):
        payload = {"slug": "tpl", "name": "TPL", **overrides}
        resp = await client.post("/api/admin/tournaments", json=payload)
        assert resp.status_code == 201, resp.text
        return resp.json()

    async def test_unlinked_by_default(self, client):
        created = await self._create(client)
        assert created["cricheroes_tournament_id"] is None

    async def test_linked_at_creation(self, client):
        created = await self._create(client, cricheroes_tournament_id=2242502)
        assert created["cricheroes_tournament_id"] == 2242502

        fetched = await client.get(f"/api/admin/tournaments/{created['id']}")
        assert fetched.json()["cricheroes_tournament_id"] == 2242502
        listed = await client.get("/api/admin/tournaments")
        assert listed.json()["tournaments"][0]["cricheroes_tournament_id"] == 2242502

    async def test_linked_relinked_and_unlinked_by_edit(self, client):
        created = await self._create(client)
        url = f"/api/admin/tournaments/{created['id']}"

        resp = await client.put(url, json={"cricheroes_tournament_id": 2242502})
        assert resp.json()["cricheroes_tournament_id"] == 2242502

        # An edit that does not mention it leaves it alone.
        resp = await client.put(url, json={"name": "Tyrant Premier League"})
        assert resp.json()["cricheroes_tournament_id"] == 2242502

        resp = await client.put(url, json={"cricheroes_tournament_id": 2251924})
        assert resp.json()["cricheroes_tournament_id"] == 2251924

        resp = await client.put(url, json={"cricheroes_tournament_id": None})
        assert resp.status_code == 200
        assert resp.json()["cricheroes_tournament_id"] is None

    @pytest.mark.parametrize(
        "value",
        [0, -2242502, 1.5, 2242502.0, "2242502", "abc", True, 2**53],
        ids=[
            "zero",
            "negative",
            "fraction",
            "float",
            "numeric-string",
            "text",
            "bool",
            "beyond-js-safe-integer",
        ],
    )
    async def test_only_a_positive_whole_number_is_accepted(self, client, value):
        resp = await client.post(
            "/api/admin/tournaments",
            json={"slug": "tpl", "name": "TPL", "cricheroes_tournament_id": value},
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"][0]["loc"][-1] == "cricheroes_tournament_id"

        created = await self._create(client, slug="tpl-two")
        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"cricheroes_tournament_id": value},
        )
        assert resp.status_code == 422, resp.text
        fetched = await client.get(f"/api/admin/tournaments/{created['id']}")
        assert fetched.json()["cricheroes_tournament_id"] is None

    async def test_not_on_the_public_tournament(self, client, anon_client):
        await self._create(client, cricheroes_tournament_id=2242502)
        resp = await anon_client.get("/api/tournaments/by-slug/tpl")
        assert "cricheroes_tournament_id" not in resp.json()

    async def test_platform_admins_only(self, anon_client, db):
        resp = await anon_client.post(
            "/api/admin/tournaments",
            json={"slug": "tpl", "name": "TPL", "cricheroes_tournament_id": 2242502},
        )
        assert resp.status_code == 401


class TestCricHeroesLinkCheck:
    """Saving a link asks CricHeroes, with one call, whether they serve that
    tournament to us (CRICHEROES_INTEGRATION_TECH_SPEC.md §13.1), so an id that
    could never be read is refused now rather than leaving the stats page
    empty."""

    async def _create(self, client, **overrides):
        payload = {"slug": "gsl", "name": "GSL", **overrides}
        resp = await client.post("/api/admin/tournaments", json=payload)
        return resp

    async def test_a_new_link_is_checked_once(self, client, cricheroes):
        created = (await self._create(client)).json()
        assert cricheroes.calls == 0

        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"cricheroes_tournament_id": 2242502},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["cricheroes_tournament_id"] == 2242502
        assert resp.json()["cricheroes_warning"] is None
        assert cricheroes.calls == 1

    async def test_creating_with_a_link_checks_it(self, client, cricheroes):
        resp = await self._create(client, cricheroes_tournament_id=2242502)

        assert resp.status_code == 201, resp.text
        assert resp.json()["cricheroes_warning"] is None
        assert cricheroes.calls == 1

    async def test_an_id_outside_our_agreement_is_refused_and_not_saved(
        self, client, cricheroes
    ):
        created = (await self._create(client)).json()
        cricheroes.answer = refusal(170001, "Tournament not accessible", status=403)

        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"cricheroes_tournament_id": 60214, "name": "Renamed"},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"].startswith("Not linked.")
        fetched = (await client.get(f"/api/admin/tournaments/{created['id']}")).json()
        # Nothing of the edit was saved, the rename included.
        assert fetched["cricheroes_tournament_id"] is None
        assert fetched["name"] == "GSL"

    async def test_a_refused_id_does_not_create_the_tournament(
        self, client, cricheroes
    ):
        cricheroes.answer = refusal(170001, "Tournament not accessible", status=403)

        resp = await self._create(client, cricheroes_tournament_id=60214)

        assert resp.status_code == 422
        listed = await client.get("/api/admin/tournaments")
        assert listed.json()["total"] == 0

    async def test_a_tournament_with_no_fixtures_yet_is_served(
        self, client, cricheroes
    ):
        cricheroes.answer = refusal(170011, "No matches found for this tournament")

        resp = await self._create(client, cricheroes_tournament_id=2251924)

        assert resp.status_code == 201, resp.text
        assert resp.json()["cricheroes_tournament_id"] == 2251924
        assert resp.json()["cricheroes_warning"] is None

    async def test_an_outage_saves_the_link_and_says_it_is_unconfirmed(
        self, client, cricheroes
    ):
        cricheroes.answer = httpx.Response(500, text="down")

        resp = await self._create(client, cricheroes_tournament_id=2242502)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["cricheroes_tournament_id"] == 2242502
        assert "could not confirm" in body["cricheroes_warning"]
        assert "2242502" in body["cricheroes_warning"]
        assert "HTTP 500" in body["cricheroes_warning"]

    async def test_no_credentials_here_saves_the_link_with_a_warning(self, client):
        from main import app

        async def _unconfigured():
            async with CricHeroesClient(
                api_key="", secret_access_key="", udid="", base_url=BASE
            ) as unconfigured:
                yield unconfigured

        app.dependency_overrides[get_cricheroes_client] = _unconfigured
        try:
            resp = await self._create(client, cricheroes_tournament_id=2242502)
        finally:
            app.dependency_overrides.pop(get_cricheroes_client, None)

        assert resp.status_code == 201, resp.text
        assert "CRICHEROES_API_KEY" in resp.json()["cricheroes_warning"]

    async def test_resaving_the_same_link_or_unlinking_asks_nothing(
        self, client, cricheroes
    ):
        created = (await self._create(client, cricheroes_tournament_id=2242502)).json()
        url = f"/api/admin/tournaments/{created['id']}"
        assert cricheroes.calls == 1

        # The edit form sends the stored link back on every save.
        resp = await client.put(
            url, json={"name": "Renamed", "cricheroes_tournament_id": 2242502}
        )
        assert resp.status_code == 200 and resp.json()["cricheroes_warning"] is None
        resp = await client.put(url, json={"cricheroes_tournament_id": None})
        assert resp.status_code == 200
        assert resp.json()["cricheroes_tournament_id"] is None

        assert cricheroes.calls == 1

    async def test_relinking_checks_the_new_id(self, client, cricheroes):
        created = (await self._create(client, cricheroes_tournament_id=2242502)).json()

        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={"cricheroes_tournament_id": 2251924},
        )

        assert resp.json()["cricheroes_tournament_id"] == 2251924
        assert cricheroes.calls == 2

    async def test_an_edit_refused_for_another_reason_costs_no_call(
        self, client, cricheroes
    ):
        created = (await self._create(client)).json()

        resp = await client.put(
            f"/api/admin/tournaments/{created['id']}",
            json={
                "cricheroes_tournament_id": 2242502,
                "start_at": "2026-08-20T10:00:00",
                "end_at": "2026-08-01T10:00:00",
            },
        )

        assert resp.status_code == 400
        assert cricheroes.calls == 0

    async def test_the_warning_is_only_on_the_save_that_raised_it(
        self, client, cricheroes
    ):
        cricheroes.answer = httpx.Response(500, text="down")
        created = (await self._create(client, cricheroes_tournament_id=2242502)).json()

        fetched = await client.get(f"/api/admin/tournaments/{created['id']}")
        listed = await client.get("/api/admin/tournaments")

        assert fetched.json()["cricheroes_warning"] is None
        assert listed.json()["tournaments"][0]["cricheroes_warning"] is None
