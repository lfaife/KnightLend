from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core import clock
from app.core.security import get_current_user, require_active_member
from app.models.hold import Hold, HoldEvent
from app.models.listing import Listing
from app.models.message import Message
from app.models.rental import Rental
from app.models.user import User
from app.routers.listings import check_dates, get_listing_or_404
from app.schemas.rental import RentalCreateIn, RentalDetail, RentalSummary
from app.services import rentals as svc
from app.services.agreement import build_agreement
from app.services.notify import notify
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
