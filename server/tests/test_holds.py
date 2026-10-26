"""Protection hold rules: state machine, declines, refreshes, claims."""

from datetime import timedelta

import pytest

from app.models.hold import Hold
from app.services import holds
from tests.conftest import VISA, find_rental, login, png, today

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_state_machine_rejects_illegal_moves(client):
    hold = Hold(rental_id="6adda4d42eb989d060aba9f0", borrower_id="6adda4d42eb989d060aba9f0", amount=40, created_at=await _now())
    with pytest.raises(holds.IllegalHoldTransition):
        holds.apply(hold, "capture", await _now())  # can't capture a pending hold
    holds.apply(hold, "authorize_ok", await _now())
    holds.apply(hold, "release", await _now())
    for event in ("capture", "refresh_ok", "authorize_ok", "release"):
        with pytest.raises(holds.IllegalHoldTransition):
            holds.apply(hold, event, await _now())


async def test_illegal_transition_over_api_returns_409(client):
    ellie = await login(client, "ellie")
    copic = await find_rental(client, ellie, "Copic")  # hold already active
    r = await client.post(f"/api/rentals/{copic['id']}/hold", headers=ellie, json=VISA)
    assert r.status_code == 409
    assert "active hold" in r.json()["detail"]


async def test_declined_card_blocks_the_rental(client):
    ellie = await login(client, "ellie")
    drill = await find_rental(client, ellie, "DeWalt")
    rid = drill["id"]
    await client.post(f"/api/rentals/{rid}/agreement/accept", headers=ellie)
    r = await client.post(f"/api/rentals/{rid}/hold", headers=ellie, json={**VISA, "number": "4000000000000002"})
    assert r.status_code == 402
    d = (await client.get(f"/api/rentals/{rid}", headers=ellie)).json()
    assert d["status"] == "approved" and d["hold"]["status"] == "failed" and d["payment"] is None
    assert "set_meetup" not in d["actions"] and "place_hold" in d["actions"]
    # Not a test card at all: rejected before any bank call.
    r = await client.post(f"/api/rentals/{rid}/hold", headers=ellie, json={**VISA, "number": "5105105105105100"})
    assert r.status_code == 402 and "test card" in r.json()["detail"]
    # A working card fixes it.
    r = await client.post(f"/api/rentals/{rid}/hold", headers=ellie, json=VISA)
    assert r.json()["status"] == "confirmed" and r.json()["hold"]["status"] == "active"


async def test_failed_refresh_after_advancing_time(client):
    marcus, leo = await login(client, "marcus"), await login(client, "leo")
    lights = await find_rental(client, marcus, "Neewer")
    r = await client.post("/api/demo/advance-time", json={"days": 2})
    jobs = r.json()["jobs"]
    assert jobs["refreshes_failed"] >= 1 and jobs["reminders_sent"] >= 1
    d = (await client.get(f"/api/rentals/{lights['id']}", headers=marcus)).json()
    assert d["hold"]["status"] == "failed" and "update_card" in d["actions"]
    titles = [n["title"] for n in (await client.get("/api/notifications", headers=marcus)).json()["items"]]
    assert "Your hold couldn't be renewed. Update your card." in titles
    assert "Your hold renews tomorrow. No charge." in titles
    # The lender can't claim against a lapsed hold.
    leo_view = (await client.get(f"/api/rentals/{lights['id']}", headers=leo)).json()
    assert "file_claim" not in leo_view["actions"]
    # Updating the card renews the hold without a charge.
    paid_before = d["payment"]["charged_amount"]
    r = await client.post(f"/api/rentals/{lights['id']}/hold", headers=marcus, json={**VISA, "number": "5555555555554444"})
    assert r.json()["hold"]["status"] == "active" and r.json()["payment"]["charged_amount"] == paid_before


async def test_successful_refresh_and_late_detection(client):
    ellie = await login(client, "ellie")
    ac = await find_rental(client, ellie, "Midea")
    await client.post("/api/demo/advance-time", json={"days": 1})
    d = (await client.get(f"/api/rentals/{ac['id']}", headers=ellie)).json()
    assert d["hold"]["status"] == "active" and d["hold"]["refresh_count"] >= 1
    r = await client.post("/api/demo/advance-time", json={"days": 25})
    assert r.json()["jobs"]["rentals_marked_late"] >= 1
    d = (await client.get(f"/api/rentals/{ac['id']}", headers=ellie)).json()
    assert d["late"] and d["late_days"] >= 1


async def test_claim_dispute_and_capture(client):
    ellie, mod = await login(client, "ellie"), await login(client, "mod")
    rode = await find_rental(client, ellie, "Rode")
    r = await client.post(
        f"/api/rentals/{rode['id']}/claim/respond",
        headers=ellie,
        json={"response": "dispute", "message": "It was already cracked."},
    )
    assert r.json()["claim"]["status"] == "under_review" and r.json()["hold"]["status"] == "active"
    assert (
        await client.post(
            f"/api/rentals/{rode['id']}/claim/resolve",
            headers=ellie,
            json={"decision": "release", "explanation": "I decide myself"},
        )
    ).status_code == 403
    r = await client.post(
        f"/api/rentals/{rode['id']}/claim/resolve",
        headers=mod,
        json={"decision": "capture", "amount": 15, "explanation": "Pickup photos show the clip intact."},
    )
    d = r.json()
    assert d["hold"]["status"] == "captured" and d["hold"]["captured_amount"] == 15 and d["hold"]["released_amount"] == 25


async def test_claim_capped_at_hold_and_needs_photos(client):
    leo = await login(client, "leo")
    dslr = await find_rental(client, leo, "Canon")
    body = {"type": "damage", "amount": 40, "description": "Lens hood is cracked."}
    assert (await client.post(f"/api/rentals/{dslr['id']}/claim", headers=leo, json=body)).status_code == 409
    await client.post(f"/api/rentals/{dslr['id']}/photos", headers=leo, data={"phase": "claim"}, files=[png()])
    assert (await client.post(f"/api/rentals/{dslr['id']}/claim", headers=leo, json={**body, "amount": 500})).status_code == 422
    assert (await client.post(f"/api/rentals/{dslr['id']}/claim", headers=leo, json=body)).json()["status"] == "claim_open"


async def test_cancel_releases_hold_with_refund_rules(client):
    ellie = await login(client, "ellie")
    copic = await find_rental(client, ellie, "Copic")  # pickup tomorrow, so within 24h: half refund
    r = await client.post(f"/api/rentals/{copic['id']}/cancel", headers=ellie)
    d = r.json()
    assert d["status"] == "cancelled" and d["hold"]["status"] == "released"
    assert d["payment"]["refunded_amount"] in (d["payment"]["charged_amount"], round(d["payment"]["charged_amount"] / 2, 2))


async def _now():
    from app.core import clock

    return await clock.now()


async def test_quote_math(client):
    from app.models.listing import Prices
    from app.services.pricing import best_plan, suggest_hold

    lines = best_plan(Prices(day=3, week=10, month=25, semester=45), 9)
    assert sum(line.amount for line in lines) == 16  # week + 2 days
    assert sum(line.amount for line in best_plan(Prices(day=3, week=10), 6)) == 10  # a week beats 6 days
    assert suggest_hold(40) <= 15 and 25 <= suggest_hold(120) <= 50 and suggest_hold(400) == 150
    t = await today(client)
    gopro = (await client.get("/api/listings", params={"q": "gopro"})).json()["items"][0]
    q = (
        await client.get(
            f"/api/listings/{gopro['id']}/quote", params={"start": str(t - timedelta(days=1)), "end": str(t + timedelta(days=2))}
        )
    ).json()
    assert not q["available"] and q["problems"]
