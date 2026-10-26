"""Time-based work: hold reminders and refreshes, failed refreshes, late returns, stale requests.

`run_jobs` is called by APScheduler every minute and by POST /api/demo/advance-time.
Everything reads the virtual clock.
"""

import logging
from datetime import date, timedelta

from app.core import clock
from app.models.hold import Hold
from app.models.listing import Listing
from app.models.rental import Rental
from app.models.user import User
from app.schemas.common import APIModel
from app.services import holds
from app.services.notify import notify
from app.services.rentals import HOLD_NEEDED, add_event

log = logging.getLogger("knightlend.jobs")


class JobReport(APIModel):
    reminders_sent: int = 0
    holds_refreshed: int = 0
    refreshes_failed: int = 0
    rentals_marked_late: int = 0
    requests_expired: int = 0


async def run_jobs() -> JobReport:
    now = await clock.now()
    today = await clock.today()
    report = JobReport()

    for hold in await Hold.find(Hold.status == "active").to_list():
        rental = await Rental.get(hold.rental_id)
        if rental is None or rental.status not in HOLD_NEEDED or hold.expires_at is None:
            continue
        listing = await Listing.get(rental.listing_id)
        title = listing.title if listing else "your rental"
        if hold.expires_at <= now:
            if await holds.refresh(hold, now):
                report.holds_refreshed += 1
                add_event(rental, now, "hold_refreshed", f"Hold refreshed: ${hold.amount:,.0f} held for 7 more days. No charge.")
                await notify(
                    rental.borrower_id,
                    "hold_refreshed",
                    "Hold refreshed. No charge.",
                    f"Your ${hold.amount:,.0f} hold for {title} is active for 7 more days.",
                    rental.id,
                )
            else:
                report.refreshes_failed += 1
                add_event(rental, now, "hold_failed", "Hold refresh failed. The borrower needs to update their card.")
                await notify(
                    rental.borrower_id,
                    "hold_failed",
                    "Your hold couldn't be renewed. Update your card.",
                    f"Your bank declined the renewal for {title}. Nothing was charged. Add a different card to "
                    "keep this rental in good standing.",
                    rental.id,
                )
                borrower = await User.get(rental.borrower_id)
                await notify(
                    rental.lender_id,
                    "hold_failed",
                    "A borrower's protection hold needs a new card",
                    f"{borrower.name if borrower else 'The borrower'}'s hold for {title} couldn't be renewed. "
                    "We've asked them to update their card.",
                    rental.id,
                )
            await rental.save()
        elif hold.expires_at - now <= timedelta(days=1) and hold.reminder_sent_for != hold.expires_at:
            hold.reminder_sent_for = hold.expires_at
            await hold.save()
            report.reminders_sent += 1
            await notify(
                rental.borrower_id,
                "hold_reminder",
                "Your hold renews tomorrow. No charge.",
                f"We'll refresh the ${hold.amount:,.0f} protection hold for {title} so it stays active.",
                rental.id,
            )

    for rental in await Rental.find(Rental.status == "in_progress").to_list():
        due = date.fromisoformat(rental.end_date)
        if today <= due:
            continue
        late_days = (today - due).days
        newly_late = not rental.late
        rental.late, rental.late_days = True, late_days
        if newly_late:
            report.rentals_marked_late += 1
            add_event(rental, now, "late", "Return date passed. The rental is late.")
            await notify(
                rental.borrower_id,
                "late",
                "Your rental is late",
                "The return date has passed. Return it as soon as you can to avoid a late-return claim.",
                rental.id,
            )
            await notify(
                rental.lender_id,
                "late",
                "A rental is late",
                "The return date passed. Message the borrower, or file a late-return claim.",
                rental.id,
            )
        await rental.save()

    for rental in await Rental.find({"status": {"$in": ["requested", "approved"]}}).to_list():
        if date.fromisoformat(rental.start_date) >= today:
            continue
        rental.status = "cancelled"
        rental.decision_note = "The pickup date passed before the rental was confirmed."
        add_event(rental, now, "expired", "Request expired: the pickup date passed before it was confirmed.")
        hold = await Hold.get(rental.hold_id) if rental.hold_id else None
        if hold and hold.status in holds.EVENTS["release"][0]:
            await holds.release(hold, now, "Request expired")
        await rental.save()
        report.requests_expired += 1
        await notify(
            rental.borrower_id,
            "expired",
            "Your request expired",
            "The pickup date passed before it was confirmed. Nothing was charged.",
            rental.id,
        )

    if any(report.model_dump().values()):
        log.info("Jobs ran: %s", report.model_dump())
    return report
