"""Rental rules: who can do what, in which state. The client only renders `actions`."""

from datetime import date, datetime, timedelta

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core import clock
from app.models.hold import Hold
from app.models.listing import Listing
from app.models.message import Message
from app.models.photos import ConditionPhotoSet
from app.models.rental import Rental, TimelineEvent
from app.models.user import User
from app.schemas.listing import QuoteOut
from app.schemas.rental import (
    AgreementOut,
    CardOut,
    ClaimOut,
    HoldEventOut,
    HoldOut,
    ListingMini,
    MeetupOut,
    PaymentOut,
    PhotoSetOut,
    RentalDetail,
    RentalSummary,
    TimelineOut,
)
from app.schemas.user import user_public
from app.services.holds import released_amount
from app.services.pricing import lender_earnings

STATUS_LABEL = {
    "requested": "Requested",
    "approved": "Approved",
    "rejected": "Declined",
    "cancelled": "Cancelled",
    "confirmed": "Ready for pickup",
    "in_progress": "In progress",
    "return_pending": "Returned, being checked",
    "claim_open": "Claim open",
    "completed": "Completed",
}
# States where the item is out (or about to be) and the hold must stay valid.
HOLD_NEEDED = ("confirmed", "in_progress", "return_pending", "claim_open")
TIME_START_HOUR = {"morning": 8, "afternoon": 12, "evening": 17}


class RentalConflict(HTTPException):
    def __init__(self, message: str):
        super().__init__(409, message)


def role_of(r: Rental, user: User) -> str | None:
    if user.id == r.borrower_id:
        return "borrower"
    if user.id == r.lender_id:
        return "lender"
    if user.role == "moderator":
        return "moderator"
    return None


async def load_for(rental_id: PydanticObjectId, user: User) -> tuple[Rental, str]:
    r = await Rental.get(rental_id)
    if r is None:
        raise HTTPException(404, "Rental not found.")
    role = role_of(r, user)
    if role is None:
        raise HTTPException(404, "Rental not found.")
    return r, role


def require(cond: bool, message: str) -> None:
    if not cond:
        raise RentalConflict(message)


def add_event(r: Rental, at: datetime, kind: str, text: str) -> None:
    r.timeline.append(TimelineEvent(at=at, kind=kind, text=text))
    r.updated_at = at


def d(iso: str) -> date:
    return date.fromisoformat(iso)


def fmt_day(day: date) -> str:
    return f"{day:%a, %b} {day.day}"


def pickup_datetime_local(r: Rental) -> datetime:
    day = d(r.meetup.date) if r.meetup else d(r.start_date)
    hour = TIME_START_HOUR[r.meetup.time_of_day] if r.meetup else 9
    return datetime(day.year, day.month, day.day, hour)


def refund_preview(r: Rental, now_local: datetime) -> float:
    """Rental-fee refund if the borrower cancels now (the hold is always released)."""
    if r.status != "confirmed" or r.payment is None:
        return 0.0
    if pickup_datetime_local(r) - now_local > timedelta(hours=24):
        return r.payment.charged_amount
    return round(r.payment.charged_amount / 2, 2)


def actions_for(r: Rental, hold: Hold | None, role: str, sets: list[ConditionPhotoSet], user_id, today: date) -> list[str]:
    a: list[str] = []
    s = r.status
    mine_accepted = r.agreement.borrower_accepted_at if role == "borrower" else r.agreement.lender_accepted_at
    hold_status = hold.status if hold else None
    if role in ("borrower", "lender") and s not in ("rejected",):
        a.append("message")
    if s == "requested":
        a += ["approve", "reject"] if role == "lender" else ["cancel"] if role == "borrower" else []
    if s == "approved":
        if role in ("borrower", "lender") and not mine_accepted:
            a.append("accept_agreement")
        both = r.agreement.borrower_accepted_at and r.agreement.lender_accepted_at
        if role == "borrower" and both and hold_status in ("pending", "failed"):
            a.append("place_hold")
        if role in ("borrower", "lender"):
            a.append("cancel")
    if s in HOLD_NEEDED and role == "borrower" and hold_status == "failed":
        a.append("update_card")
    if s == "confirmed" and role in ("borrower", "lender"):
        a += ["set_meetup", "upload_pickup_photos", "cancel"]
        confirmed_pickup = any(p.phase == "pickup" and p.confirmed_by for p in sets)
        if confirmed_pickup and hold_status == "active" and today >= d(r.start_date) - timedelta(days=1):
            a.append("mark_picked_up")
    if role in ("borrower", "lender"):
        if any(p.uploaded_by != user_id and not p.confirmed_by and p.phase in ("pickup", "return") for p in sets):
            a.append("confirm_photos")
    if s == "in_progress":
        if role == "borrower":
            a.append("upload_return_photos")
            if any(p.phase == "return" and p.uploader_role == "borrower" for p in sets):
                a.append("mark_returned")
        if role == "lender" and r.late and hold_status == "active":
            a.append("file_claim")
    if s == "return_pending" and role == "lender":
        a += ["upload_return_photos", "confirm_clean_return"]
        if hold_status == "active":
            a.append("file_claim")
    if s == "claim_open" and r.claim:
        if role == "borrower" and r.claim.status == "open":
            a.append("respond_claim")
        if role == "moderator" and r.claim.status == "under_review":
            a.append("resolve_claim")
    if s == "completed" and role in ("borrower", "lender"):
        done = r.borrower_reviewed if role == "borrower" else r.lender_reviewed
        if not done:
            a.append("review")
    return a


def next_step(r: Rental, hold: Hold | None, role: str, borrower: User, lender: User, today: date) -> str:
    b, lname = borrower.name.split()[0], lender.name.split()[0]
    end = fmt_day(d(r.end_date))
    s = r.status
    if hold and hold.status == "failed" and s in HOLD_NEEDED:
        return ("Your protection hold couldn't be renewed. Update your card to keep this rental in good standing."
                if role == "borrower" else f"{b}'s hold needs a card update. We've asked them to fix it.")
    if s == "requested":
        return f"Waiting for {lname} to respond." if role == "borrower" else "Approve or decline this request."
    if s == "approved":
        if role == "lender" and not r.agreement.lender_accepted_at:
            return "Accept the rental agreement to confirm your approval."
        if role == "borrower":
            if not r.agreement.borrower_accepted_at:
                return "Read and accept the agreement, then place the protection hold."
            if hold and hold.status == "failed":
                return "Your card declined the hold. Try a different card to confirm the rental."
            return "Place the protection hold to confirm. It's held, not charged."
        return f"Waiting for {b} to accept the agreement and place the protection hold."
    if s == "confirmed":
        if not r.meetup:
            return "Pick a public meetup spot and time."
        return f"Meet at {r.meetup.spot_name} on {fmt_day(d(r.meetup.date))} ({r.meetup.time_of_day}). " \
               "Add pickup photos together, then mark it picked up."
    if s == "in_progress":
        if r.late:
            days = f"{r.late_days} day{'s' if r.late_days != 1 else ''}"
            return f"This rental is {days} late. Return it as soon as you can." if role == "borrower" \
                else f"{b} is {days} late. Message them, or file a late-return claim."
        return f"Return it by {end}. Add return photos and finish the checklist." if role == "borrower" \
            else f"{b} has it until {end}."
    if s == "return_pending":
        return "Check the item. Confirm a clean return or file a claim." if role == "lender" \
            else f"{lname} is checking the item. Your hold is still held, not charged."
    if s == "claim_open" and r.claim:
        if r.claim.status == "open":
            return "Respond to the claim: accept it or tell your side." if role == "borrower" \
                else f"Waiting for {b} to respond to your claim."
        return "A moderator is reviewing the photos and both statements." if role != "moderator" \
            else "Review the evidence and decide."
    if s == "completed":
        done = r.borrower_reviewed if role == "borrower" else r.lender_reviewed
        return "All done. Thanks for keeping it safe." if done or role == "moderator" else "Leave a review to finish up."
    if s == "rejected":
        return r.decision_note or "The lender declined this request."
    return "This rental was cancelled."


def listing_mini(x: Listing) -> ListingMini:
    return ListingMini(id=x.id, title=x.title, photo=x.photos[0] if x.photos else None, category=x.category,
                       pickup_area=x.pickup.area_name, estimated_value=x.estimated_value)


def hold_out(hold: Hold, role: str) -> HoldOut:
    next_refresh = hold.expires_at if hold.status == "active" else None
    return HoldOut(
        id=hold.id, amount=hold.amount, status=hold.status,
        card=CardOut(brand=hold.card.brand, last4=hold.card.last4, funding=hold.card.funding)
        if (hold.card and role == "borrower") else None,
        placed_at=hold.placed_at, expires_at=hold.expires_at, refresh_count=hold.refresh_count,
        next_refresh_at=next_refresh, failure_message=hold.failure_message,
        captured_amount=hold.captured_amount, released_amount=released_amount(hold),
        released_at=hold.released_at, captured_at=hold.captured_at,
        history=[HoldEventOut(**e.model_dump()) for e in hold.history],
    )


async def unread_count(r: Rental, user_id) -> int:
    return await Message.find({"rental_id": r.id, "sender_id": {"$ne": user_id}, "read_by": {"$ne": user_id}}).count()


async def summarize(r: Rental, user: User, listing: Listing, other: User, hold: Hold | None,
                    borrower: User, lender: User, today: date) -> RentalSummary:
    role = role_of(r, user) or "moderator"
    sets = await ConditionPhotoSet.find(ConditionPhotoSet.rental_id == r.id).to_list()
    acts = actions_for(r, hold, role, sets, user.id, today)
    important = {"approve", "accept_agreement", "place_hold", "update_card", "confirm_photos", "mark_returned",
                 "confirm_clean_return", "respond_claim", "resolve_claim", "review", "set_meetup"}
    return RentalSummary(
        id=r.id, status=r.status, status_label=STATUS_LABEL[r.status], my_role=role, listing=listing_mini(listing),
        other_party=user_public(other), start_date=r.start_date, end_date=r.end_date, days=r.quote.days,
        total=r.quote.total, lender_earnings=lender_earnings(r.quote), hold_amount=r.quote.hold_amount,
        hold_status=hold.status if hold else None, hold_expires_at=hold.expires_at if hold else None,
        late=r.late, late_days=r.late_days,
        needs_action=bool(important.intersection(acts)) and not (r.status == "confirmed" and r.meetup and acts == []),
        next_step=next_step(r, hold, role, borrower, lender, today), unread_messages=await unread_count(r, user.id),
        created_at=r.created_at, updated_at=r.updated_at,
    )


async def detail(r: Rental, user: User) -> RentalDetail:
    role = role_of(r, user) or "moderator"
    listing = await Listing.get(r.listing_id)
    borrower, lender = await User.get(r.borrower_id), await User.get(r.lender_id)
    hold = await Hold.get(r.hold_id) if r.hold_id else await Hold.find_one(Hold.rental_id == r.id)
    sets = await ConditionPhotoSet.find(ConditionPhotoSet.rental_id == r.id).sort(+ConditionPhotoSet.created_at).to_list()
    names = {borrower.id: borrower.name, lender.id: lender.name}
    today = await clock.today()
    now_local = await clock.local_now()
    acts = actions_for(r, hold, role, sets, user.id, today)
    my_done = (r.borrower_reviewed if role == "borrower" else r.lender_reviewed) if role != "moderator" else True
    return RentalDetail(
        id=r.id, status=r.status, status_label=STATUS_LABEL[r.status], my_role=role, listing=listing_mini(listing),
        borrower=user_public(borrower), lender=user_public(lender), start_date=r.start_date, end_date=r.end_date,
        with_bundle=r.with_bundle, bundle_name=listing.bundle.name if (r.with_bundle and listing.bundle) else None,
        quote=QuoteOut(**r.quote.model_dump()), lender_earnings=lender_earnings(r.quote),
        request_note=r.request_note, decision_note=r.decision_note,
        agreement=AgreementOut(**r.agreement.model_dump()),
        hold=hold_out(hold, role) if hold else None,
        payment=PaymentOut(**r.payment.model_dump()) if r.payment else None,
        meetup=MeetupOut(**r.meetup.model_dump()) if r.meetup else None,
        picked_up_at=r.picked_up_at, returned_at=r.returned_at, return_checklist=r.return_checklist,
        late=r.late, late_days=r.late_days,
        claim=ClaimOut(**r.claim.model_dump()) if r.claim else None,
        photo_sets=[PhotoSetOut(**p.model_dump(include=set(PhotoSetOut.model_fields) - {"uploader_name"}),
                                uploader_name=names.get(p.uploaded_by, "Member")) for p in sets],
        timeline=[TimelineOut(**t.model_dump()) for t in sorted(r.timeline, key=lambda t: t.at)],
        actions=acts, next_step=next_step(r, hold, role, borrower, lender, today),
        can_review="review" in acts, my_review_done=my_done,
        cancellation_refund_preview=refund_preview(r, now_local) if "cancel" in acts else None,
        created_at=r.created_at, updated_at=r.updated_at,
    )
