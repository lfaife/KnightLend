from datetime import timedelta
from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core import clock
from app.core.security import get_current_user, require_active_member
from app.models.hold import Hold, HoldEvent
from app.models.listing import Listing
from app.models.message import Message
from app.models.rental import Meetup, Payment, Rental
from app.models.user import User
from app.routers.listings import check_dates, get_listing_or_404
from app.schemas.rental import CardIn, DecisionIn, MeetupIn, RentalCreateIn, RentalDetail, RentalSummary
from app.services import holds
from app.services import rentals as svc
from app.services.agreement import build_agreement
from app.services.geo import spot
from app.services.notify import notify
from app.services.payments import PaymentError, provider
from app.services.pricing import build_quote
from app.services.privacy import redact

router = APIRouter(prefix="/api/rentals", tags=["rentals"])


@router.post("", response_model=RentalDetail, status_code=201)
async def request_rental(body: RentalCreateIn, user: User = Depends(require_active_member)) -> RentalDetail:
    listing = await get_listing_or_404(body.listing_id)
    if listing.owner_id == user.id:
        raise HTTPException(409, "You can't rent your own item.")
    if listing.status != "active":
        raise HTTPException(409, "This item is paused by its lender.")
    check = await check_dates(listing, body.start_date, body.end_date, body.with_bundle)
    if not check.available:
        raise HTTPException(409, " ".join(check.problems))
    now = await clock.now()
    note, redacted = redact(body.note.strip())
    rental = Rental(
        listing_id=listing.id, borrower_id=user.id, lender_id=listing.owner_id,
        start_date=body.start_date.isoformat(), end_date=body.end_date.isoformat(), with_bundle=body.with_bundle,
        quote=build_quote(listing, (body.end_date - body.start_date).days, body.with_bundle),
        request_note=note, agreement=build_agreement(listing, body.start_date, body.end_date),
        created_at=now, updated_at=now,
    )
    svc.add_event(rental, now, "requested", "Rental requested")
    await rental.insert()
    hold = Hold(rental_id=rental.id, borrower_id=user.id, amount=listing.hold_amount, created_at=now,
                history=[HoldEvent(at=now, event="created", from_status="pending", to_status="pending",
                                   note="Waiting for approval")])
    await hold.insert()
    rental.hold_id = hold.id
    if not listing.requires_approval:
        # Lenders who turn approval off accept the standard agreement for every rental up front.
        rental.status = "approved"
        rental.agreement.lender_accepted_at = now
        svc.add_event(rental, now, "approved", "Approved automatically (this lender doesn't require approval)")
    await rental.save()
    if note:
        await Message(rental_id=rental.id, sender_id=user.id, body=note, redacted=redacted, read_by=[user.id],
                      created_at=now).insert()
    lender_title = "New request" if listing.requires_approval else "New rental (auto-approved)"
    await notify(listing.owner_id, "request", f"{lender_title}: {listing.title}",
                 f"{user.name} wants it {svc.fmt_day(body.start_date)} to {svc.fmt_day(body.end_date)}.", rental.id)
    return await svc.detail(rental, user)


@router.get("", response_model=list[RentalSummary])
async def my_rentals(
    role: Literal["borrower", "lender", "all"] = "all",
    scope: Literal["active", "history", "all"] = Query("all", description="active = not finished yet"),
    user: User = Depends(get_current_user),
) -> list[RentalSummary]:
    clauses = []
    if role in ("borrower", "all"):
        clauses.append({"borrower_id": user.id})
    if role in ("lender", "all"):
        clauses.append({"lender_id": user.id})
    query: dict = {"$or": clauses}
    finished = ["completed", "rejected", "cancelled"]
    if scope == "active":
        query["status"] = {"$nin": finished}
    elif scope == "history":
        query["status"] = {"$in": finished}
    rentals = await Rental.find(query).sort(-Rental.updated_at).to_list()
    listing_ids = list({r.listing_id for r in rentals})
    user_ids = list({r.borrower_id for r in rentals} | {r.lender_id for r in rentals})
    listings = {x.id: x for x in await Listing.find({"_id": {"$in": listing_ids}}).to_list()}
    users = {u.id: u for u in await User.find({"_id": {"$in": user_ids}}).to_list()}
    holds = {h.rental_id: h for h in await Hold.find({"rental_id": {"$in": [r.id for r in rentals]}}).to_list()}
    today = await clock.today()
    out = []
    for r in rentals:
        other = users[r.lender_id] if r.borrower_id == user.id else users[r.borrower_id]
        out.append(await svc.summarize(r, user, listings[r.listing_id], other, holds.get(r.id),
                                       users[r.borrower_id], users[r.lender_id], today))
    return out


@router.get("/{rental_id}", response_model=RentalDetail)
async def rental_detail(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RentalDetail:
    r, _ = await svc.load_for(rental_id, user)
    return await svc.detail(r, user)


# ---------- M4: decisions, agreement, protection hold, meetup ----------


async def _hold(r: Rental) -> Hold:
    hold = await Hold.get(r.hold_id) if r.hold_id else await Hold.find_one(Hold.rental_id == r.id)
    if hold is None:
        raise HTTPException(409, "This rental has no protection hold.")
    return hold


async def _names(r: Rental) -> tuple[User, User, Listing]:
    return await User.get(r.borrower_id), await User.get(r.lender_id), await Listing.get(r.listing_id)


@router.post("/{rental_id}/approve", response_model=RentalDetail)
async def approve(rental_id: PydanticObjectId, body: DecisionIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "lender", "Only the lender can approve this request.")
    svc.require(r.status == "requested", f"This rental is {svc.STATUS_LABEL[r.status].lower()}, so it can't be approved.")
    now = await clock.now()
    r.status = "approved"
    r.decision_note = body.note.strip()
    if body.accept_agreement:
        r.agreement.lender_accepted_at = now
    svc.add_event(r, now, "approved", "Lender approved the request")
    await r.save()
    borrower, lender, listing = await _names(r)
    await notify(r.borrower_id, "approved", f"{lender.name.split()[0]} approved your request",
                 f"Accept the agreement and place the protection hold to confirm {listing.title}.", r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/reject", response_model=RentalDetail)
async def reject(rental_id: PydanticObjectId, body: DecisionIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "lender", "Only the lender can decline this request.")
    svc.require(r.status == "requested", "Only new requests can be declined.")
    now = await clock.now()
    r.status = "rejected"
    r.decision_note = body.note.strip() or "The lender can't lend it for those dates."
    svc.add_event(r, now, "rejected", "Lender declined the request")
    await holds.release(await _hold(r), now, "Request declined. Nothing was held.")
    await r.save()
    _, _, listing = await _names(r)
    await notify(r.borrower_id, "rejected", f"Request declined: {listing.title}", r.decision_note, r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/cancel", response_model=RentalDetail)
async def cancel(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender"), "Only the people in this rental can cancel it.")
    svc.require(r.status in ("requested", "approved", "confirmed"), "Rentals can only be cancelled before pickup.")
    svc.require(not (role == "lender" and r.status == "requested"), "Decline the request instead.")
    now = await clock.now()
    hold = await _hold(r)
    refund = 0.0
    if r.status == "confirmed" and r.payment:
        # Lender cancellations always refund in full. Borrowers follow the 24-hour rule.
        refund = r.payment.charged_amount if role == "lender" else svc.refund_preview(r, await clock.local_now())
        r.payment.refunded_amount = refund
    if hold.status in holds.EVENTS["release"][0]:
        await holds.release(hold, now, "Rental cancelled")
    who = "Borrower" if role == "borrower" else "Lender"
    r.status = "cancelled"
    svc.add_event(r, now, "cancelled", f"{who} cancelled" + (f". Refunded ${refund:,.2f}." if refund else "."))
    await r.save()
    _, _, listing = await _names(r)
    other = r.lender_id if role == "borrower" else r.borrower_id
    await notify(other, "cancelled", f"Rental cancelled: {listing.title}",
                 f"The {who.lower()} cancelled. The protection hold was released.", r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/agreement/accept", response_model=RentalDetail)
async def accept_agreement(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender"), "Only the borrower and lender sign the agreement.")
    svc.require(r.status == "approved", "The agreement is accepted after approval and before the hold is placed.")
    now = await clock.now()
    if role == "borrower":
        svc.require(r.agreement.borrower_accepted_at is None, "You already accepted this agreement.")
        r.agreement.borrower_accepted_at = now
    else:
        svc.require(r.agreement.lender_accepted_at is None, "You already accepted this agreement.")
        r.agreement.lender_accepted_at = now
    svc.add_event(r, now, "agreement", f"{'Borrower' if role == 'borrower' else 'Lender'} accepted the rental agreement")
    await r.save()
    return await svc.detail(r, user)


@router.post("/{rental_id}/hold", response_model=RentalDetail,
             responses={402: {"description": "The card declined the hold"}, 409: {"description": "Not allowed in this state"}})
async def place_hold(rental_id: PydanticObjectId, body: CardIn, user: User = Depends(require_active_member)) -> RentalDetail:
    """Place the protection hold (and charge the rental), or put a failed hold on a new card."""
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "borrower", "Only the borrower places the protection hold.")
    hold = await _hold(r)
    now, today = await clock.now(), await clock.today()
    updating_card = r.status in svc.HOLD_NEEDED
    if not updating_card:
        svc.require(r.status == "approved", f"This rental is {svc.STATUS_LABEL[r.status].lower()}. The hold can't be placed now.")
        svc.require(bool(r.agreement.borrower_accepted_at and r.agreement.lender_accepted_at),
                    "Both of you need to accept the agreement before the hold is placed.")
    try:
        await holds.place(hold, body.number, body.exp_month, body.exp_year, body.cvc, now, today)
    except holds.HoldDeclined as err:
        svc.add_event(r, now, "hold_declined", f"Card declined the hold: {err.message}")
        await r.save()
        raise HTTPException(402, f"{err.message} Nothing was charged. Try a different card.") from err
    _, lender, listing = await _names(r)
    if updating_card:
        svc.add_event(r, now, "hold_active", f"Hold renewed on a new card: ${hold.amount:,.0f} held, not charged")
        await r.save()
        await notify(r.lender_id, "hold_active", "The borrower updated their card",
                     f"The ${hold.amount:,.0f} protection hold for {listing.title} is active again.", r.id)
        return await svc.detail(r, user)
    try:
        charge = await provider.charge_rental(hold.payment_method_token or "", r.quote.total)
    except PaymentError as err:
        await holds.release(hold, now, "Rental charge failed")
        raise HTTPException(402, f"{err.message} The hold was released and nothing was charged.") from err
    r.payment = Payment(charge_id=charge.id, charged_amount=r.quote.total, charged_at=now)
    r.status = "confirmed"
    svc.add_event(r, now, "hold_active", f"Protection hold placed: ${hold.amount:,.0f} held, not charged")
    svc.add_event(r, now, "charged", f"Rental charged: ${r.quote.total:,.2f}")
    await r.save()
    await notify(r.lender_id, "confirmed", f"Confirmed: {listing.title}",
                 f"The ${hold.amount:,.0f} protection hold is in place. Pick a meetup spot.", r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/meetup", response_model=RentalDetail)
async def set_meetup(rental_id: PydanticObjectId, body: MeetupIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender"), "Only the borrower and lender set the meetup.")
    svc.require(r.status == "confirmed", "Set the meetup after the rental is confirmed and before pickup.")
    place = spot(body.spot_id)
    if place is None:
        raise HTTPException(422, "Pick one of the suggested public spots.")
    today = await clock.today()
    start = svc.d(r.start_date)
    svc.require(today <= body.date <= start + timedelta(days=1),
                f"Pick a day between today and {svc.fmt_day(start + timedelta(days=1))}.")
    now = await clock.now()
    notes, _ = redact(body.notes.strip())
    r.meetup = Meetup(spot_id=place["id"], spot_name=place["name"], lat=place["lat"], lng=place["lng"],
                      date=body.date.isoformat(), time_of_day=body.time_of_day, accessibility_note=place["accessibility"],
                      notes=notes, set_by=user.id, set_at=now)
    svc.add_event(r, now, "meetup", f"Meetup set: {place['name']}, {svc.fmt_day(body.date)} ({body.time_of_day})")
    await r.save()
    other = r.lender_id if role == "borrower" else r.borrower_id
    await notify(other, "meetup", "Meetup spot set", f"{place['name']}, {svc.fmt_day(body.date)}, {body.time_of_day}.", r.id)
    return await svc.detail(r, user)
