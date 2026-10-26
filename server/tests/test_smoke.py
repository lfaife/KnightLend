"""End-to-end path through the API: login, search, request, approve, hold, photos, return, release, review."""

from datetime import timedelta

import pytest

from tests.conftest import VISA, login, png, today

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_health_and_docs(client):
    r = await client.get("/api/health")
    assert r.status_code == 200 and r.json()["database"] == "mongomock"
    spec = (await client.get("/openapi.json")).json()
    assert "/api/rentals/{rental_id}/hold" in spec["paths"]


async def test_full_rental_path(client):
    ellie, leo = await login(client, "ellie"), await login(client, "leo")

    # Search: nearby-first results with filters.
    page = (await client.get("/api/listings", params={"q": "gopro", "max_hold": 150})).json()
    assert page["total"] >= 1
    gopro = page["items"][0]
    assert "GoPro" in gopro["title"] and gopro["hold_amount"] == 125
    distances = [i["distance_miles"] for i in (await client.get("/api/listings")).json()["items"]]
    assert distances == sorted(distances)

    # Request (needs approval), with a phone number that gets hidden.
    start = await today(client) + timedelta(days=10)
    r = await client.post(
        "/api/rentals",
        headers=ellie,
        json={
            "listing_id": gopro["id"],
            "start_date": str(start),
            "end_date": str(start + timedelta(days=3)),
            "note": "Text me at 407-555-0100",
        },
    )
    assert r.status_code == 201, r.text
    rental = r.json()
    rid = rental["id"]
    assert rental["status"] == "requested" and rental["hold"]["status"] == "pending"
    assert "407" not in rental["request_note"]

    # Lender approves and accepts the agreement; borrower accepts too.
    r = await client.post(f"/api/rentals/{rid}/approve", headers=leo, json={"accept_agreement": True})
    assert r.json()["status"] == "approved"
    r = await client.post(f"/api/rentals/{rid}/agreement/accept", headers=ellie)
    assert "place_hold" in r.json()["actions"]

    # Place the hold: rental is charged, the hold is only held.
    r = await client.post(f"/api/rentals/{rid}/hold", headers=ellie, json=VISA)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "confirmed" and d["hold"]["status"] == "active"
    assert d["payment"]["charged_amount"] == d["quote"]["total"]
    assert d["hold"]["amount"] == 125 and d["hold"]["expires_at"]

    # Meetup and condition photos.
    r = await client.post(
        f"/api/rentals/{rid}/meetup", headers=ellie, json={"spot_id": "library", "date": str(start), "time_of_day": "afternoon"}
    )
    assert r.json()["meetup"]["spot_name"].startswith("John C. Hitt Library")
    r = await client.post(f"/api/rentals/{rid}/photos", headers=ellie, data={"phase": "pickup"}, files=[png()])
    assert r.status_code == 201
    set_id = r.json()["photo_sets"][-1]["id"]
    assert (await client.post(f"/api/rentals/{rid}/pickup", headers=ellie)).status_code == 409  # not confirmed yet
    await client.post(f"/api/rentals/{rid}/photos/{set_id}/confirm", headers=leo)

    # Pickup opens the day before the start date.
    await client.post("/api/demo/advance-time", json={"days": 9})
    r = await client.post(f"/api/rentals/{rid}/pickup", headers=leo)
    assert r.json()["status"] == "in_progress", r.text

    # Return: photos and checklist required.
    r = await client.post(f"/api/rentals/{rid}/return", headers=ellie, json={"checklist": ["Item is clean"]})
    assert r.status_code == 409
    await client.post(f"/api/rentals/{rid}/photos", headers=ellie, data={"phase": "return"}, files=[png()])
    r = await client.post(
        f"/api/rentals/{rid}/return",
        headers=ellie,
        json={"checklist": ["Item is clean", "All parts and accessories are included", "Return photos added"]},
    )
    assert r.json()["status"] == "return_pending"

    # Clean return releases the hold.
    r = await client.post(f"/api/rentals/{rid}/inspect", headers=leo)
    d = r.json()
    assert d["status"] == "completed" and d["hold"]["status"] == "released" and d["hold"]["released_amount"] == 125
    notes = (await client.get("/api/notifications", headers=ellie)).json()["items"]
    assert any(n["title"] == "Your $125 hold has been released" for n in notes)

    # Both sides review; ratings recompute.
    before = (await client.get(f"/api/users/{d['lender']['id']}")).json()["user"]["rating_count"]
    r = await client.post(f"/api/rentals/{rid}/reviews", headers=ellie, json={"rating": 5, "text": "Great camera, easy handoff."})
    assert r.status_code == 201 and r.json()["my_review_done"]
    r = await client.post(f"/api/rentals/{rid}/reviews", headers=leo, json={"rating": 4, "text": "On time and careful."})
    assert r.status_code == 201
    after = (await client.get(f"/api/users/{d['lender']['id']}")).json()["user"]["rating_count"]
    assert after == before + 1
    assert (
        await client.post(f"/api/rentals/{rid}/reviews", headers=ellie, json={"rating": 5, "text": "Twice?"})
    ).status_code == 409


async def test_messages_poll_and_redact(client):
    ellie, priya = await login(client, "ellie"), await login(client, "priya")
    copic = next(r for r in (await client.get("/api/rentals", headers=ellie)).json() if "Copic" in r["listing"]["title"])
    r = await client.post(f"/api/rentals/{copic['id']}/messages", headers=ellie, json={"body": "My email is me@example.com"})
    assert r.status_code == 201 and r.json()["redacted"] and "example.com" not in r.json()["body"]
    convos = (await client.get("/api/conversations", headers=priya)).json()
    assert next(c for c in convos if c["rental_id"] == copic["id"])["unread"] >= 1
    await client.get(f"/api/rentals/{copic['id']}/messages", headers=priya)
    convos = (await client.get("/api/conversations", headers=priya)).json()
    assert next(c for c in convos if c["rental_id"] == copic["id"])["unread"] == 0
