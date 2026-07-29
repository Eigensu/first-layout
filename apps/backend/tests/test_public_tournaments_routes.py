class TestListPublicTournaments:
    async def test_empty_when_no_tournaments(self, anon_client):
        resp = await anon_client.get("/api/tournaments")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_lists_non_archived_statuses(self, client, anon_client):
        for slug, status in [
            ("draft-cup", "draft"),
            ("live-cup", "live"),
            ("done-cup", "completed"),
        ]:
            resp = await client.post(
                "/api/admin/tournaments",
                json={"slug": slug, "name": slug, "status": status},
            )
            assert resp.status_code == 201

        resp = await anon_client.get("/api/tournaments")
        assert resp.status_code == 200
        slugs = {t["slug"] for t in resp.json()}
        assert slugs == {"draft-cup", "live-cup", "done-cup"}

    async def test_excludes_archived(self, client, anon_client):
        created = (
            await client.post(
                "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
            )
        ).json()
        await client.delete(f"/api/admin/tournaments/{created['id']}")  # archives

        resp = await anon_client.get("/api/tournaments")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_does_not_require_auth(self, client, anon_client):
        await client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        resp = await anon_client.get("/api/tournaments")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestGetTournamentBySlug:
    async def test_found(self, client, anon_client):
        await client.post(
            "/api/admin/tournaments",
            json={"slug": "dpcl", "name": "Delhi Premier Cricket League"},
        )
        resp = await anon_client.get("/api/tournaments/by-slug/dpcl")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Delhi Premier Cricket League"

    async def test_lookup_is_case_insensitive(self, client, anon_client):
        await client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        resp = await anon_client.get("/api/tournaments/by-slug/DPCL")
        assert resp.status_code == 200

    async def test_unknown_slug_404(self, anon_client):
        resp = await anon_client.get("/api/tournaments/by-slug/nonexistent")
        assert resp.status_code == 404

    async def test_archived_slug_404(self, client, anon_client):
        created = (
            await client.post(
                "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
            )
        ).json()
        await client.delete(f"/api/admin/tournaments/{created['id']}")  # archives

        resp = await anon_client.get("/api/tournaments/by-slug/dpcl")
        assert resp.status_code == 404

    async def test_response_excludes_admin_only_fields(self, client, anon_client):
        await client.post(
            "/api/admin/tournaments", json={"slug": "dpcl", "name": "DPCL"}
        )
        resp = await anon_client.get("/api/tournaments/by-slug/dpcl")
        body = resp.json()
        assert "id" not in body
        assert "created_at" not in body
