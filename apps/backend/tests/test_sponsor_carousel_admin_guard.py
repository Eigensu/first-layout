"""Sponsor and carousel writes are admin-only.

Every one of these endpoints said "Admin only" in its docstring but depended on
get_current_active_user, so any signed-in player could delete every sponsor or
reorder the home-page carousel. The public reads stay open.
"""

import pytest
import pytest_asyncio
from beanie import PydanticObjectId
from httpx import ASGITransport, AsyncClient

from app.models.carousel import CarouselImage
from app.models.sponsor import Sponsor, SponsorTier
from app.models.user import User
from app.utils.dependencies import get_current_active_user

SPONSOR = {
    "name": "Acme",
    "logo": "https://example.com/acme.png",
    "tier": "gold",
    "description": "Acme sponsors the league",
}


@pytest_asyncio.fixture
async def player_client(db):
    """Signed in, active, and not an admin."""
    from main import app

    player = User(
        id=PydanticObjectId(),
        username="player",
        email="player@example.com",
        hashed_password="not-a-real-hash",
        is_admin=False,
        is_active=True,
    )

    async def _player():
        return player

    app.dependency_overrides[get_current_active_user] = _player
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_active_user, None)


@pytest_asyncio.fixture
async def sponsor(db):
    doc = Sponsor(**{**SPONSOR, "tier": SponsorTier.GOLD}, priority=1)
    await doc.insert()
    return doc


@pytest_asyncio.fixture
async def slide(db):
    doc = CarouselImage(title="Opening night", display_order=0)
    await doc.insert()
    return doc


def _admin_requests(sponsor_id: str, slide_id: str):
    upload = {"file": ("logo.png", b"\x89PNG\r\n", "image/png")}
    return [
        ("GET", "/api/v1/sponsors/available-priorities", {}),
        ("POST", "/api/v1/sponsors/", {"json": SPONSOR}),
        ("POST", "/api/v1/sponsors", {"json": SPONSOR}),
        ("PUT", f"/api/v1/sponsors/{sponsor_id}", {"json": {"name": "Renamed"}}),
        ("DELETE", f"/api/v1/sponsors/{sponsor_id}", {}),
        ("POST", f"/api/v1/sponsors/{sponsor_id}/upload-logo", {"files": upload}),
        ("PATCH", f"/api/v1/sponsors/{sponsor_id}/toggle-featured", {}),
        ("PATCH", f"/api/v1/sponsors/{sponsor_id}/toggle-active", {}),
        ("POST", "/api/v1/carousel/", {"json": {"title": "New"}}),
        ("GET", f"/api/v1/carousel/{slide_id}", {}),
        ("PUT", f"/api/v1/carousel/{slide_id}", {"json": {"title": "Renamed"}}),
        ("DELETE", f"/api/v1/carousel/{slide_id}", {}),
        ("POST", f"/api/v1/carousel/{slide_id}/upload-image", {"files": upload}),
        ("PATCH", f"/api/v1/carousel/{slide_id}/toggle-active", {}),
        (
            "PATCH",
            "/api/v1/carousel/reorder",
            {"json": {"image_orders": [{"id": slide_id, "display_order": 5}]}},
        ),
    ]


ADMIN_ENDPOINT_COUNT = 15


async def test_every_admin_endpoint_is_listed(sponsor, slide):
    assert len(_admin_requests(str(sponsor.id), str(slide.id))) == ADMIN_ENDPOINT_COUNT


@pytest.mark.parametrize("index", range(ADMIN_ENDPOINT_COUNT))
async def test_a_player_is_refused(player_client, sponsor, slide, index):
    method, url, kwargs = _admin_requests(str(sponsor.id), str(slide.id))[index]

    response = await player_client.request(method, url, **kwargs)

    assert response.status_code == 403, (method, url, response.text)
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.parametrize("index", range(ADMIN_ENDPOINT_COUNT))
async def test_signed_out_is_refused(anon_client, sponsor, slide, index):
    method, url, kwargs = _admin_requests(str(sponsor.id), str(slide.id))[index]

    response = await anon_client.request(method, url, **kwargs)

    assert response.status_code == 401, (method, url, response.text)


async def test_a_refused_player_changed_nothing(player_client, sponsor, slide):
    for method, url, kwargs in _admin_requests(str(sponsor.id), str(slide.id)):
        await player_client.request(method, url, **kwargs)

    assert await Sponsor.find_all().count() == 1
    kept = await Sponsor.get(sponsor.id)
    assert kept.name == "Acme" and kept.active and not kept.featured
    kept_slide = await CarouselImage.get(slide.id)
    assert kept_slide.title == "Opening night" and kept_slide.display_order == 0


async def test_an_admin_still_gets_through(client, sponsor, slide):
    created = await client.post("/api/v1/sponsors", json=SPONSOR | {"name": "Beta"})
    assert created.status_code == 201, created.text

    toggled = await client.patch(f"/api/v1/carousel/{slide.id}/toggle-active")
    assert toggled.status_code == 200, toggled.text
    assert toggled.json()["active"] is False


async def test_public_reads_stay_open(anon_client, sponsor, slide):
    assert (await anon_client.get("/api/v1/sponsors/")).status_code == 200
    assert (await anon_client.get(f"/api/v1/sponsors/{sponsor.id}")).status_code == 200
    assert (await anon_client.get("/api/v1/carousel/")).status_code == 200
