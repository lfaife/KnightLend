from datetime import date, timedelta

from fastapi import APIRouter, Depends

from app.core import clock
from app.core.security import get_current_user
from app.models.hold import Hold
from app.models.listing import Listing
from app.models.rental import Rental
from app.models.user import User
from app.schemas.common import APIModel, IdStr
from app.services.holds import released_amount
from app.services.pricing import lender_earnings
from app.services.rentals import HOLD_NEEDED

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class MoneySide(APIModel):
    charged: float = 0  # borrower: rental fees + claim captures; lender: what borrowers paid for your items
    held: float = 0
    pending_holds: float = 0
    released: float = 0
    captured: float = 0
    earned: float = 0  # lender only: rental and bundle fees you keep, plus captured claims


class Reminder(APIModel):
    rental_id: IdStr
    kind: str
    text: str


class DashboardOut(APIModel):
    borrowing: MoneySide
    lending: MoneySide
    reminders: list[Reminder]
    counts: dict[str, int]


@router.get("", response_model=DashboardOut)
async def dashboard(user: User = Depends(get_current_user)) -> DashboardOut:
    rentals = await Rental.find({"$or": [{"borrower_id": user.id}, {"lender_id": user.id}]}).to_list()
    holds = {h.rental_id: h for h in await Hold.find({"rental_id": {"$in": [r.id for r in rentals]}}).to_list()}
    titles = {x.id: x.title for x in await Listing.find({"_id": {"$in": [r.listing_id for r in rentals]}}).to_list()}
    now, today = await clock.now(), await clock.today()
    b, lend = MoneySide(), MoneySide()
    reminders: list[Reminder] = []
    counts = {"active_borrowing": 0, "active_lending": 0, "requests_to_review": 0, "needs_action": 0}
    for r in rentals:
        h = holds.get(r.id)
        side = b if r.borrower_id == user.id else lend
        paid = (r.payment.charged_amount - r.payment.refunded_amount) if r.payment else 0
        if h:
            if h.status == "active":
                side.held += h.amount
            elif h.status == "pending" and r.status in ("requested", "approved"):
                side.pending_holds += h.amount
            side.released += released_amount(h)
            side.captured += h.captured_amount
        if side is b:
            b.charged += paid + (r.payment.claim_charged_amount if r.payment else 0)
        else:
            lend.charged += paid
            if r.payment and r.status not in ("cancelled",):
                share = paid / r.payment.charged_amount if r.payment.charged_amount else 0
                lend.earned += lender_earnings(r.quote) * share
            lend.earned += r.payment.claim_charged_amount if r.payment else 0
        title = titles.get(r.listing_id, "your rental")
        is_borrower = r.borrower_id == user.id
        if r.status not in ("completed", "rejected", "cancelled"):
            counts["active_borrowing" if is_borrower else "active_lending"] += 1
        if r.status == "requested" and not is_borrower:
            counts["requests_to_review"] += 1
            reminders.append(Reminder(rental_id=r.id, kind="request", text=f"New request for {title}. Approve or decline."))
        if r.status == "in_progress":
            due = date.fromisoformat(r.end_date)
            if r.late:
                reminders.append(Reminder(rental_id=r.id, kind="late", text=f"{title} is {r.late_days} day(s) late."))
            elif due - today <= timedelta(days=1):
                when = "today" if due == today else "tomorrow"
                text = f"Return {title} {when}." if is_borrower else f"{title} is due back {when}."
                reminders.append(Reminder(rental_id=r.id, kind="return_due", text=text))
        if h and r.status in HOLD_NEEDED:
            if h.status == "failed" and is_borrower:
                reminders.append(Reminder(rental_id=r.id, kind="hold_failed", text=f"Your hold for {title} needs a new card."))
            elif h.status == "active" and h.expires_at and h.expires_at - now <= timedelta(days=1) and is_borrower:
                reminders.append(
                    Reminder(rental_id=r.id, kind="hold_renews", text=f"Your hold for {title} renews tomorrow. No charge.")
                )
        if r.status == "approved" and is_borrower and h and h.status in ("pending", "failed"):
            reminders.append(Reminder(rental_id=r.id, kind="place_hold", text=f"Place the protection hold to confirm {title}."))
        if r.status == "return_pending" and not is_borrower:
            reminders.append(Reminder(rental_id=r.id, kind="inspect", text=f"Check the returned {title}."))
        if r.status == "claim_open" and r.claim and r.claim.status == "open" and is_borrower:
            reminders.append(Reminder(rental_id=r.id, kind="claim", text=f"Respond to the claim on {title}."))
    counts["needs_action"] = len(reminders)
    for side in (b, lend):
        for k in ("charged", "held", "pending_holds", "released", "captured", "earned"):
            setattr(side, k, round(getattr(side, k), 2))
    return DashboardOut(borrowing=b, lending=lend, reminders=reminders, counts=counts)
