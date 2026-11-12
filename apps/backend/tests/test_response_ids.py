"""Sponsor and carousel responses carry the document id as a str, whatever
beanie's model_dump() returns for it.

carousel_to_response passed model_dump()'s `id` straight to a schema that
wants `id: str`. beanie 1.26, which requirements.txt pins, stringifies a
PydanticObjectId in model_dump(); newer beanie (1.30) keeps the ObjectId
outside JSON mode, so there every carousel read failed validation with a 500.
The suite passed on the pinned version and could not see it. Sponsors built
their response the same way and survived only because SponsorResponse's
"_id" alias won over the ObjectId. These tests force the newer behaviour, so
they fail on either version if a converter leans on model_dump() for the id.
"""

import pytest

from app.models.carousel import CarouselImage
from app.models.sponsor import Sponsor, SponsorTier
from app.routes.carousel import carousel_to_response
from app.routes.sponsors import sponsor_to_response
from app.schemas.carousel import CarouselImageResponse
from app.schemas.sponsor import SponsorResponse


def _dump_ids_as_objectids(monkeypatch, model):
    """Make model.model_dump() keep `id` an ObjectId, as beanie 1.30 does."""
    real_dump = model.model_dump

    def model_dump(self, *args, **kwargs):
        dumped = real_dump(self, *args, **kwargs)
        if kwargs.get("mode", "python") == "python" and "id" in dumped:
            dumped["id"] = self.id
        return dumped

    monkeypatch.setattr(model, "model_dump", model_dump)


async def _slide():
    doc = CarouselImage(title="Opening night", display_order=0)
    await doc.insert()
    return doc


async def _sponsor():
    doc = Sponsor(
        name="Acme",
        logo="https://example.com/acme.png",
        tier=SponsorTier.GOLD,
        description="Acme sponsors the league",
        priority=1,
    )
    await doc.insert()
    return doc


@pytest.mark.parametrize(
    "model, make, to_response, schema",
    [
        pytest.param(
            CarouselImage,
            _slide,
            carousel_to_response,
            CarouselImageResponse,
            id="carousel",
        ),
        pytest.param(
            Sponsor, _sponsor, sponsor_to_response, SponsorResponse, id="sponsor"
        ),
    ],
)
async def test_the_response_id_is_the_documents_id_as_a_str(
    db, monkeypatch, model, make, to_response, schema
):
    doc = await make()
    _dump_ids_as_objectids(monkeypatch, model)
    assert not isinstance(doc.model_dump()["id"], str)

    converted = to_response(doc)
    response = schema(**converted)

    # No ObjectId left for the schema to pick up, under either key: sponsors
    # once passed only because their "_id" alias happened to win over it.
    assert {k: v for k, v in converted.items() if k in ("id", "_id")} in (
        {"id": str(doc.id)},
        {"_id": str(doc.id)},
    )
    assert response.id == str(doc.id)
    assert response.model_dump(mode="json", by_alias=True)["_id"] == str(doc.id)


async def test_the_public_reads_survive_it(anon_client, monkeypatch):
    slide = await _slide()
    sponsor = await _sponsor()
    _dump_ids_as_objectids(monkeypatch, CarouselImage)
    _dump_ids_as_objectids(monkeypatch, Sponsor)

    carousel = await anon_client.get("/api/v1/carousel/")
    sponsors = await anon_client.get("/api/v1/sponsors/")

    assert carousel.status_code == 200, carousel.text
    assert [image["_id"] for image in carousel.json()["images"]] == [str(slide.id)]
    assert sponsors.status_code == 200, sponsors.text
    assert [s["_id"] for s in sponsors.json()["sponsors"]] == [str(sponsor.id)]
