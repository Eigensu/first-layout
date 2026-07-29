import pytest


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
        assert "already exists" in second.json()["detail"] or "taken" in second.json()["detail"]

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
        await self._create(client, "dpcl", "Delhi Premier Cricket League", status="live")
        await self._create(client, "dpcl-archive", "Delhi Premier Cricket League Old", status="archived")
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
