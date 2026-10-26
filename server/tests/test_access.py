"""Accounts, restrictions, verification, uploads and demo-mode gating."""

from datetime import timedelta

import pytest

from app.core.config import settings
from tests.conftest import login, png, today

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_restricted_user_is_blocked(client):
    jordan, mod = await login(client, "jordan"), await login(client, "mod")
    jordan_id = (await client.get("/api/auth/me", headers=jordan)).json()["id"]
    overview = (await client.get("/api/moderation/overview", headers=mod)).json()
    assert any(f["user"]["id"] == jordan_id for f in overview["flagged"])  # flagged by bad reviews
    r = await client.post(f"/api/moderation/users/{jordan_id}/restrict", headers=mod, json={"reason": "Repeated late returns."})
    assert r.status_code == 200
    tripod = (await client.get("/api/listings", params={"q": "tripod"})).json()["items"][0]
    t = await today(client)
    r = await client.post(
        "/api/rentals",
        headers=jordan,
        json={"listing_id": tripod["id"], "start_date": str(t + timedelta(days=2)), "end_date": str(t + timedelta(days=4))},
    )
    assert r.status_code == 403 and "restricted" in r.json()["detail"]
    assert (await client.post("/api/listings/photos", headers=jordan, files=[png()])).status_code == 403
    assert (await client.get("/api/listings", params={"q": "TI-84"})).json()["total"] == 0  # their listings are hidden
    await client.post(f"/api/moderation/users/{jordan_id}/unrestrict", headers=mod)
    r = await client.post(
        "/api/rentals",
        headers=jordan,
        json={"listing_id": tripod["id"], "start_date": str(t + timedelta(days=2)), "end_date": str(t + timedelta(days=4))},
    )
    assert r.status_code == 201


async def test_moderation_is_moderator_only(client):
    ellie = await login(client, "ellie")
    assert (await client.get("/api/moderation/overview", headers=ellie)).status_code == 403


async def test_register_verify_and_list(client):
    r = await client.post(
        "/api/auth/register",
        json={"name": "New Knight", "email": "new.knight@example.org", "password": "longenough1", "affiliation": "student"},
    )
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.post("/api/listings/photos", headers=h, files=[png()])).status_code == 403  # not verified
    assert (await client.post("/api/verification/student/start", headers=h, json={"ucf_email": "x@gmail.com"})).status_code == 422
    code = (await client.post("/api/verification/student/start", headers=h, json={"ucf_email": "nk123@ucf.edu"})).json()[
        "simulated_code"
    ]
    assert (await client.post("/api/verification/student/confirm", headers=h, json={"code": code})).json()["verified"]
    urls = (await client.post("/api/listings/photos", headers=h, files=[png()])).json()["urls"]
    body = {
        "title": "Stethoscope for clinicals",
        "description": "Cleaned between rentals.",
        "category": "household_appliances",
        "condition": "good",
        "estimated_value": 95,
        "prices": {"day": 3},
        "hold_amount": 10,
        "max_rental_days": 14,
        "pickup_spot_id": "library",
        "photos": urls,
    }
    assert (await client.post("/api/listings", headers=h, json=body)).status_code == 422  # hold below the $50-$150 tier
    r = await client.post("/api/listings", headers=h, json={**body, "hold_amount": 35})
    assert r.status_code == 201 and r.json()["hold_amount"] == 35


async def test_upload_validation(client):
    ellie = await login(client, "ellie")
    copic = next(r for r in (await client.get("/api/rentals", headers=ellie)).json() if "Copic" in r["listing"]["title"])
    url = f"/api/rentals/{copic['id']}/photos"
    r = await client.post(url, headers=ellie, data={"phase": "pickup"}, files=[("files", ("x.png", b"not really", "image/png"))])
    assert r.status_code == 415
    r = await client.post(url, headers=ellie, data={"phase": "pickup"}, files=[("files", ("x.txt", b"hello", "text/plain"))])
    assert r.status_code == 415
    big = png()[1][1] + b"0" * (settings.max_upload_mb * 1024 * 1024 + 1)
    r = await client.post(url, headers=ellie, data={"phase": "pickup"}, files=[("files", ("big.png", big, "image/png"))])
    assert r.status_code == 413


async def test_demo_endpoints_need_demo_mode(client):
    settings.demo_mode = False
    try:
        assert (await client.post("/api/demo/advance-time", json={"days": 1})).status_code == 404
        assert (await client.get("/api/demo/users")).status_code == 404
    finally:
        settings.demo_mode = True


async def test_no_contact_details_in_public_payloads(client):
    listing = (await client.get("/api/listings")).json()["items"][0]
    detail = (await client.get(f"/api/listings/{listing['id']}")).text
    profile = (await client.get(f"/api/users/{listing['owner']['id']}")).text
    for payload in (detail, profile):
        assert "@demo.knightlend.test" not in payload and "email" not in payload.lower()
