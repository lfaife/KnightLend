from datetime import timedelta
from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.core import clock
from app.core.security import get_current_user, require_active_member, require_moderator
from app.models.hold import Hold, HoldEvent
from app.models.listing import Listing
from app.models.message import Message
from app.models.photos import ConditionPhotoSet
from app.models.rental import Claim, Meetup, Payment, Rental
from app.models.review import Review
from app.models.user import User
from app.routers.listings import check_dates, get_listing_or_404
from app.schemas.rental import (
    CardIn,
    ClaimIn,
    ClaimResolveIn,
    ClaimResponseIn,
    DecisionIn,
    MeetupIn,
    MessageIn,
    MessageOut,
    RentalCreateIn,
    RentalDetail,
    RentalSummary,
    ReturnIn,
    ReviewIn,
)
from app.services import holds
from app.services import rentals as svc
from app.services.agreement import build_agreement
from app.services.geo import spot
from app.services.notify import notify
from app.services.payments import PaymentError, provider
from app.services.policies import REQUIRED_RETURN_ITEMS, RETURN_CHECKLIST
from app.services.pricing import build_quote
from app.services.privacy import redact
from app.services.uploads import save_images

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
        listing_id=listing.id,
        borrower_id=user.id,
        lender_id=listing.owner_id,
        start_date=body.start_date.isoformat(),
        end_date=body.end_date.isoformat(),
        with_bundle=body.with_bundle,
        quote=build_quote(listing, (body.end_date - body.start_date).days, body.with_bundle),
        request_note=note,
        agreement=build_agreement(listing, body.start_date, body.end_date),
        created_at=now,
        updated_at=now,
    )
    svc.add_event(rental, now, "requested", "Rental requested")
    await rental.insert()
    hold = Hold(
        rental_id=rental.id,
        borrower_id=user.id,
        amount=listing.hold_amount,
        created_at=now,
        history=[HoldEvent(at=now, event="created", from_status="pending", to_status="pending", note="Waiting for approval")],
    )
    await hold.insert()
    rental.hold_id = hold.id
    if not listing.requires_approval:
        # Lenders who turn approval off accept the standard agreement for every rental up front.
        rental.status = "approved"
        rental.agreement.lender_accepted_at = now
        svc.add_event(rental, now, "approved", "Approved automatically (this lender doesn't require approval)")
    await rental.save()
    if note:
        await Message(
            rental_id=rental.id, sender_id=user.id, body=note, redacted=redacted, read_by=[user.id], created_at=now
        ).insert()
    lender_title = "New request" if listing.requires_approval else "New rental (auto-approved)"
    await notify(
        listing.owner_id,
        "request",
        f"{lender_title}: {listing.title}",
        f"{user.name} wants it {svc.fmt_day(body.start_date)} to {svc.fmt_day(body.end_date)}.",
        rental.id,
    )
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
        out.append(
            await svc.summarize(
                r, user, listings[r.listing_id], other, holds.get(r.id), users[r.borrower_id], users[r.lender_id], today
            )
        )
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
    await notify(
        r.borrower_id,
        "approved",
        f"{lender.name.split()[0]} approved your request",
        f"Accept the agreement and place the protection hold to confirm {listing.title}.",
        r.id,
    )
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
    await notify(
        other,
        "cancelled",
        f"Rental cancelled: {listing.title}",
        f"The {who.lower()} cancelled. The protection hold was released.",
        r.id,
    )
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


@router.post(
    "/{rental_id}/hold",
    response_model=RentalDetail,
    responses={402: {"description": "The card declined the hold"}, 409: {"description": "Not allowed in this state"}},
)
async def place_hold(rental_id: PydanticObjectId, body: CardIn, user: User = Depends(require_active_member)) -> RentalDetail:
    """Place the protection hold (and charge the rental), or put a failed hold on a new card."""
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "borrower", "Only the borrower places the protection hold.")
    hold = await _hold(r)
    now, today = await clock.now(), await clock.today()
    updating_card = r.status in svc.HOLD_NEEDED
    if not updating_card:
        svc.require(r.status == "approved", f"This rental is {svc.STATUS_LABEL[r.status].lower()}. The hold can't be placed now.")
        svc.require(
            bool(r.agreement.borrower_accepted_at and r.agreement.lender_accepted_at),
            "Both of you need to accept the agreement before the hold is placed.",
        )
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
        await notify(
            r.lender_id,
            "hold_active",
            "The borrower updated their card",
            f"The ${hold.amount:,.0f} protection hold for {listing.title} is active again.",
            r.id,
        )
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
    await notify(
        r.lender_id,
        "confirmed",
        f"Confirmed: {listing.title}",
        f"The ${hold.amount:,.0f} protection hold is in place. Pick a meetup spot.",
        r.id,
    )
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
    svc.require(
        today <= body.date <= start + timedelta(days=1), f"Pick a day between today and {svc.fmt_day(start + timedelta(days=1))}."
    )
    now = await clock.now()
    notes, _ = redact(body.notes.strip())
    r.meetup = Meetup(
        spot_id=place["id"],
        spot_name=place["name"],
        lat=place["lat"],
        lng=place["lng"],
        date=body.date.isoformat(),
        time_of_day=body.time_of_day,
        accessibility_note=place["accessibility"],
        notes=notes,
        set_by=user.id,
        set_at=now,
    )
    svc.add_event(r, now, "meetup", f"Meetup set: {place['name']}, {svc.fmt_day(body.date)} ({body.time_of_day})")
    await r.save()
    other = r.lender_id if role == "borrower" else r.borrower_id
    await notify(other, "meetup", "Meetup spot set", f"{place['name']}, {svc.fmt_day(body.date)}, {body.time_of_day}.", r.id)
    return await svc.detail(r, user)


# ---------- M5: condition photos, pickup, return, claims, reviews, messages ----------


async def _finish(r: Rental) -> None:
    from app.services.ratings import recompute_listing, recompute_user

    for uid in (r.borrower_id, r.lender_id):
        await recompute_user(uid)
    await recompute_listing(r.listing_id)


@router.post("/{rental_id}/photos", response_model=RentalDetail, status_code=201)
async def upload_photos(
    rental_id: PydanticObjectId,
    phase: Literal["pickup", "return", "claim"] = Form(...),
    note: str = Form("", max_length=300),
    files: list[UploadFile] = File(..., description="1 to 6 JPG, PNG, WebP or GIF photos, 5 MB each"),
    user: User = Depends(get_current_user),
) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender"), "Only the borrower and lender add condition photos.")
    allowed = {
        "pickup": r.status == "confirmed",
        "return": (role == "borrower" and r.status == "in_progress") or (role == "lender" and r.status == "return_pending"),
        "claim": role == "lender" and (r.status == "return_pending" or (r.status == "in_progress" and r.late)),
    }[phase]
    svc.require(allowed, f"You can't add {phase} photos at this stage of the rental.")
    urls = await save_images(files, f"rentals/{r.id}")
    now = await clock.now()
    clean_note, _ = redact(note.strip())
    ps = ConditionPhotoSet(
        rental_id=r.id, phase=phase, uploaded_by=user.id, uploader_role=role, photos=urls, note=clean_note, created_at=now
    )
    await ps.insert()
    svc.add_event(r, now, "photos", f"{role.title()} added {len(urls)} {phase} photo{'s' if len(urls) > 1 else ''}")
    await r.save()
    if phase != "claim":
        other = r.lender_id if role == "borrower" else r.borrower_id
        await notify(other, "photos", f"New {phase} photos to confirm", "Check they match what you see, then confirm.", r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/photos/{set_id}/confirm", response_model=RentalDetail)
async def confirm_photos(
    rental_id: PydanticObjectId, set_id: PydanticObjectId, user: User = Depends(get_current_user)
) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    ps = await ConditionPhotoSet.get(set_id)
    if ps is None or ps.rental_id != r.id:
        raise HTTPException(404, "Photo set not found.")
    svc.require(role in ("borrower", "lender") and ps.uploaded_by != user.id, "The other person confirms these photos.")
    svc.require(ps.confirmed_by is None, "These photos are already confirmed.")
    svc.require(ps.phase in ("pickup", "return"), "Claim photos are reviewed in the claim.")
    now = await clock.now()
    ps.confirmed_by, ps.confirmed_at = user.id, now
    await ps.save()
    svc.add_event(r, now, "photos_confirmed", f"{role.title()} confirmed the {ps.phase} photos")
    await r.save()
    return await svc.detail(r, user)


@router.post("/{rental_id}/pickup", response_model=RentalDetail)
async def mark_picked_up(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    hold = await _hold(r)
    sets = await ConditionPhotoSet.find(ConditionPhotoSet.rental_id == r.id).to_list()
    svc.require(
        "mark_picked_up" in svc.actions_for(r, hold, role, sets, user.id, await clock.today()),
        "Add pickup photos and have the other person confirm them first. Pickup opens the day before the start date.",
    )
    now = await clock.now()
    r.status, r.picked_up_at = "in_progress", now
    svc.add_event(r, now, "picked_up", "Item picked up")
    await r.save()
    other = r.lender_id if role == "borrower" else r.borrower_id
    await notify(other, "picked_up", "Pickup confirmed", f"Return due {svc.fmt_day(svc.d(r.end_date))}.", r.id)
    return await svc.detail(r, user)


@router.post("/{rental_id}/return", response_model=RentalDetail)
async def mark_returned(rental_id: PydanticObjectId, body: ReturnIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "borrower" and r.status == "in_progress", "The borrower marks the item returned while they have it.")
    unknown = [c for c in body.checklist if c not in RETURN_CHECKLIST]
    if unknown:
        raise HTTPException(422, "Use the checklist items shown on the return screen.")
    missing = [c for c in REQUIRED_RETURN_ITEMS if c not in body.checklist]
    svc.require(not missing, "Finish the checklist first: " + ", ".join(missing).lower() + ".")
    has_photos = await ConditionPhotoSet.find(
        ConditionPhotoSet.rental_id == r.id, ConditionPhotoSet.phase == "return", ConditionPhotoSet.uploaded_by == user.id
    ).count()
    svc.require(has_photos > 0, "Add return photos before you mark it returned.")
    now = await clock.now()
    r.status, r.returned_at, r.return_checklist = "return_pending", now, body.checklist
    svc.add_event(
        r, now, "returned", "Item returned" + (f" {r.late_days} day(s) late" if r.late else "") + ". Lender is checking it."
    )
    await r.save()
    borrower, _, listing = await _names(r)
    await notify(
        r.lender_id,
        "returned",
        f"{borrower.name.split()[0]} returned the {listing.title}",
        "Check it and confirm a clean return, or file a claim within 24 hours.",
        r.id,
    )
    return await svc.detail(r, user)


@router.post("/{rental_id}/inspect", response_model=RentalDetail)
async def confirm_clean_return(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "lender" and r.status == "return_pending", "The lender confirms the return after the item comes back.")
    hold = await _hold(r)
    now = await clock.now()
    await holds.release(hold, now, "Clean return confirmed by the lender")
    # Confirming a clean return also confirms the borrower's return photos.
    for ps in await ConditionPhotoSet.find(ConditionPhotoSet.rental_id == r.id, ConditionPhotoSet.phase == "return").to_list():
        if ps.uploaded_by != user.id and ps.confirmed_by is None:
            ps.confirmed_by, ps.confirmed_at = user.id, now
            await ps.save()
    r.status = "completed"
    svc.add_event(r, now, "hold_released", f"Clean return. Hold released: ${hold.amount:,.0f}")
    await r.save()
    await _finish(r)
    _, _, listing = await _names(r)
    await notify(
        r.borrower_id,
        "hold_released",
        f"Your ${hold.amount:,.0f} hold has been released",
        f"{listing.title} came back in the same condition. It can take up to 3 days to show on your card.",
        r.id,
    )
    return await svc.detail(r, user)


@router.post("/{rental_id}/claim", response_model=RentalDetail)
async def file_claim(rental_id: PydanticObjectId, body: ClaimIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role == "lender", "Only the lender files a claim.")
    svc.require(
        r.status == "return_pending" or (r.status == "in_progress" and r.late),
        "Claims are filed after the item comes back, or once a rental is late.",
    )
    if r.status == "in_progress":
        svc.require(
            body.type in ("late", "not_returned"), "While the item is still out, you can only claim for late or no return."
        )
    hold = await _hold(r)
    svc.require(
        hold.status == "active", "There's no active hold to claim against. The borrower has been asked to update their card."
    )
    if body.amount > hold.amount:
        raise HTTPException(422, f"You can claim up to the held amount, ${hold.amount:,.0f}.")
    photo_set = (
        await ConditionPhotoSet.find(
            ConditionPhotoSet.rental_id == r.id, ConditionPhotoSet.phase == "claim", ConditionPhotoSet.uploaded_by == user.id
        )
        .sort(-ConditionPhotoSet.created_at)
        .first_or_none()
    )
    svc.require(body.type != "damage" or photo_set is not None, "Add photos of the damage before you file the claim.")
    now = await clock.now()
    description, _ = redact(body.description.strip())
    r.claim = Claim(
        type=body.type,
        amount=round(body.amount, 2),
        description=description,
        photo_set_id=photo_set.id if photo_set else None,
        filed_at=now,
    )
    r.status = "claim_open"
    label = {"damage": "damage", "late": "late-return", "not_returned": "non-return"}[body.type]
    svc.add_event(r, now, "claim_filed", f"Lender filed a {label} claim for ${body.amount:,.2f}")
    await r.save()
    await notify(
        r.borrower_id,
        "claim",
        f"A ${body.amount:,.0f} {label} claim was filed",
        f"Your ${hold.amount:,.0f} hold is still held, not charged. Respond to the claim.",
        r.id,
    )
    return await svc.detail(r, user)


async def _settle_claim(r: Rental, decision: str, amount: float, explanation: str, by: User | None, now) -> None:
    hold = await _hold(r)
    c = r.claim
    c.status, c.decision, c.explanation, c.resolved_at = "resolved", decision, explanation, now
    c.resolved_by = by.id if by else None
    _, _, listing = await _names(r)
    if decision == "capture":
        charge_id = await holds.capture(hold, now, amount, f"{c.type.replace('_', ' ').title()} claim")
        c.decision_amount = amount
        r.payment.claim_charge_id, r.payment.claim_charged_amount = charge_id, amount
        rest = hold.amount - amount
        svc.add_event(r, now, "hold_captured", f"Hold captured: ${amount:,.2f}." + (f" ${rest:,.2f} released." if rest else ""))
        await notify(r.borrower_id, "hold_captured", f"Hold captured: ${amount:,.0f}", explanation, r.id)
        await notify(r.lender_id, "hold_captured", f"Claim approved: ${amount:,.0f} paid to you", explanation, r.id)
    else:
        await holds.release(hold, now, "Claim closed without a charge")
        svc.add_event(r, now, "hold_released", f"Claim closed. Hold released: ${hold.amount:,.0f}")
        await notify(r.borrower_id, "hold_released", f"Your ${hold.amount:,.0f} hold has been released", explanation, r.id)
        await notify(r.lender_id, "claim_closed", f"Claim closed: {listing.title}", explanation, r.id)
    r.status = "completed"
    await r.save()
    await _finish(r)


@router.post("/{rental_id}/claim/respond", response_model=RentalDetail)
async def respond_claim(
    rental_id: PydanticObjectId, body: ClaimResponseIn, user: User = Depends(get_current_user)
) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(
        role == "borrower" and r.status == "claim_open" and r.claim and r.claim.status == "open",
        "Only the borrower responds, once, to an open claim.",
    )
    now = await clock.now()
    message, _ = redact(body.message.strip())
    r.claim.borrower_response, r.claim.borrower_message, r.claim.responded_at = body.response, message, now
    if body.response == "accept":
        hold = await _hold(r)
        rest = hold.amount - r.claim.amount
        explanation = f"You accepted the claim. ${r.claim.amount:,.2f} of your ${hold.amount:,.0f} hold was charged" + (
            f" and ${rest:,.2f} was released." if rest else "."
        )
        svc.add_event(r, now, "claim_accepted", "Borrower accepted the claim")
        await _settle_claim(r, "capture", r.claim.amount, explanation, None, now)
    else:
        r.claim.status = "under_review"
        svc.add_event(r, now, "claim_disputed", "Borrower disputed the claim. A moderator will review it.")
        await r.save()
        for mod in await User.find(User.role == "moderator").to_list():
            await notify(mod.id, "dispute", "A dispute needs review", "Compare the condition photos and both statements.", r.id)
        await notify(
            r.lender_id, "dispute", "The borrower disputed your claim", "A moderator will review the photos and decide.", r.id
        )
    return await svc.detail(r, user)


@router.post("/{rental_id}/claim/resolve", response_model=RentalDetail)
async def resolve_claim(
    rental_id: PydanticObjectId, body: ClaimResolveIn, user: User = Depends(require_moderator)
) -> RentalDetail:
    r, _ = await svc.load_for(rental_id, user)
    svc.require(
        r.status == "claim_open" and r.claim and r.claim.status == "under_review",
        "Only disputed claims are resolved by a moderator.",
    )
    hold = await _hold(r)
    if body.decision == "capture" and not 0 < body.amount <= min(r.claim.amount, hold.amount):
        raise HTTPException(422, f"Capture between $1 and the ${min(r.claim.amount, hold.amount):,.2f} claimed.")
    await _settle_claim(r, body.decision, body.amount, body.explanation.strip(), user, await clock.now())
    return await svc.detail(r, user)


@router.post("/{rental_id}/reviews", response_model=RentalDetail, status_code=201)
async def leave_review(rental_id: PydanticObjectId, body: ReviewIn, user: User = Depends(get_current_user)) -> RentalDetail:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender") and r.status == "completed", "Reviews open after the rental is completed.")
    done = r.borrower_reviewed if role == "borrower" else r.lender_reviewed
    svc.require(not done, "You already reviewed this rental.")
    now = await clock.now()
    text, _ = redact(body.text.strip())
    subject = r.lender_id if role == "borrower" else r.borrower_id
    await Review(
        rental_id=r.id,
        listing_id=r.listing_id,
        author_id=user.id,
        subject_id=subject,
        subject_role="lender" if role == "borrower" else "borrower",
        rating=body.rating,
        text=text,
        created_at=now,
    ).insert()
    if role == "borrower":
        r.borrower_reviewed = True
    else:
        r.lender_reviewed = True
    svc.add_event(r, now, "review", f"{role.title()} left a {body.rating}-star review")
    await r.save()
    await _finish(r)
    await notify(subject, "review", f"You got a {body.rating}-star review", text[:120], r.id)
    return await svc.detail(r, user)


@router.get("/{rental_id}/messages", response_model=list[MessageOut])
async def list_messages(rental_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[MessageOut]:
    r, role = await svc.load_for(rental_id, user)
    msgs = await Message.find(Message.rental_id == r.id).sort(+Message.created_at).to_list()
    names = {u.id: u.name for u in await User.find({"_id": {"$in": [r.borrower_id, r.lender_id]}}).to_list()}
    unread = [m for m in msgs if m.sender_id != user.id and user.id not in m.read_by]
    for m in unread:
        if role != "moderator":
            m.read_by.append(user.id)
            await m.save()
    return [
        MessageOut(
            id=m.id,
            rental_id=m.rental_id,
            sender_id=m.sender_id,
            sender_name=names.get(m.sender_id, "KnightLend") if m.sender_id else "KnightLend",
            mine=m.sender_id == user.id,
            body=m.body,
            redacted=m.redacted,
            created_at=m.created_at,
        )
        for m in msgs
    ]


@router.post("/{rental_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(rental_id: PydanticObjectId, body: MessageIn, user: User = Depends(get_current_user)) -> MessageOut:
    r, role = await svc.load_for(rental_id, user)
    svc.require(role in ("borrower", "lender"), "Only the borrower and lender message in this conversation.")
    text, redacted = redact(body.body.strip())
    if not text:
        raise HTTPException(422, "Write a message first.")
    m = Message(rental_id=r.id, sender_id=user.id, body=text, redacted=redacted, read_by=[user.id], created_at=await clock.now())
    await m.insert()
    other = r.lender_id if role == "borrower" else r.borrower_id
    await notify(other, "message", f"New message from {user.name.split()[0]}", text[:120], r.id, link=f"/messages?rental={r.id}")
    return MessageOut(
        id=m.id,
        rental_id=r.id,
        sender_id=user.id,
        sender_name=user.name,
        mine=True,
        body=m.body,
        redacted=redacted,
        created_at=m.created_at,
    )
