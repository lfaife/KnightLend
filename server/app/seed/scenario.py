"""Rentals in every state, plus history, messages, reviews and notifications.

All dates are relative to the virtual clock's "today" so the demo always looks current.
"""

import random
from datetime import date, datetime, timedelta

from app.models import ConditionPhotoSet, Hold, Listing, Message, Notification, Rental, Review, User
from app.models.hold import CardInfo, HoldEvent
from app.models.rental import Claim, Meetup, Payment, TimelineEvent
from app.seed.images import condition_url
from app.services.agreement import build_agreement
from app.services.geo import spot
from app.services.payments import HOLD_DAYS, token_for
from app.services.pricing import build_quote

CARDS = {
    "visa": ("Visa", "4242", "credit", "success"),
    "mc": ("Mastercard", "4444", "credit", "success"),
    "debit": ("Visa", "5556", "debit", "success"),
    "refreshfail": ("Visa", "0341", "credit", "refreshfail"),
}


class Ctx:
    def __init__(self, now: datetime, today: date, users: dict[str, User], listings: dict[str, Listing]):
        self.now, self.today, self.users, self.listings = now, today, users, listings

    def at(self, days: float, hour: int = 15) -> datetime:
        """A datetime `days` from now, pinned to an afternoon hour (UTC) for readability."""
        d = self.now + timedelta(days=days)
        return d.replace(hour=hour, minute=0, second=0, microsecond=0)

    def day(self, days: int) -> date:
        return self.today + timedelta(days=days)


async def make_rental(ctx: Ctx, listing_slug: str, borrower: str, start: int, days: int, status: str,
                      created: int, note: str = "", with_bundle: bool = False) -> Rental:
    listing = ctx.listings[listing_slug]
    s, e = ctx.day(start), ctx.day(start + days)
    agreement = build_agreement(listing, s, e)
    rental = Rental(
        listing_id=listing.id,
        borrower_id=ctx.users[borrower].id,
        lender_id=listing.owner_id,
        start_date=s.isoformat(),
        end_date=e.isoformat(),
        with_bundle=with_bundle,
        quote=build_quote(listing, days, with_bundle),
        request_note=note,
        status=status,
        agreement=agreement,
        timeline=[TimelineEvent(at=ctx.at(created), kind="requested", text="Rental requested")],
        created_at=ctx.at(created),
        updated_at=ctx.now,
    )
    await rental.insert()
    return rental


def event(rental: Rental, at: datetime, kind: str, text: str) -> None:
    rental.timeline.append(TimelineEvent(at=at, kind=kind, text=text))


async def accept_and_pay(ctx: Ctx, rental: Rental, at_days: float, card: str = "visa",
                         hold_status: str = "active", expires_in: float | None = None) -> Hold:
    """Both sides accept, the hold is placed and the rental is charged."""
    at = ctx.at(at_days)
    rental.agreement.lender_accepted_at = at - timedelta(hours=2)
    rental.agreement.borrower_accepted_at = at - timedelta(minutes=10)
    brand, last4, funding, scenario = CARDS[card]
    hold = Hold(
        rental_id=rental.id,
        borrower_id=rental.borrower_id,
        amount=rental.quote.hold_amount,
        status="active",
        card=CardInfo(brand=brand, last4=last4, funding=funding, exp_month=8, exp_year=2029),
        payment_method_token=token_for(scenario, last4),
        authorization_id=f"pi_mock_seed{rental.id}",
        placed_at=at,
        expires_at=(ctx.now + timedelta(days=expires_in)) if expires_in is not None else at + timedelta(days=HOLD_DAYS),
        history=[
            HoldEvent(at=rental.created_at, event="created", from_status="pending", to_status="pending", note="Waiting for approval"),
            HoldEvent(at=at, event="authorize_ok", from_status="pending", to_status="active", note=f"{brand} ending {last4}"),
        ],
        created_at=rental.created_at,
    )
    # A hold older than 7 days on a rental that's still open has been refreshed along the way.
    if hold_status == "active" and rental.status in ("confirmed", "in_progress", "return_pending", "claim_open"):
        while hold.expires_at <= ctx.now:
            hold.history.append(HoldEvent(at=hold.expires_at, event="refresh_ok", from_status="active", to_status="active",
                                          note="Renewed for 7 more days. No charge."))
            event(rental, hold.expires_at, "hold_refreshed", f"Hold refreshed: ${hold.amount:,.0f} held for 7 more days. No charge.")
            hold.expires_at += timedelta(days=HOLD_DAYS)
            hold.refresh_count += 1
    await hold.insert()
    rental.hold_id = hold.id
    rental.payment = Payment(charge_id=f"ch_mock_seed{rental.id}", charged_amount=rental.quote.total, charged_at=at)
    event(rental, at - timedelta(hours=2), "approved", "Lender approved the request")
    event(rental, at, "hold_active", f"Protection hold placed: ${hold.amount:,.0f} held, not charged")
    return hold


def set_meetup(ctx: Ctx, rental: Rental, spot_id: str, start_days: int, time_of_day: str, by: str) -> None:
    s = spot(spot_id)
    rental.meetup = Meetup(spot_id=spot_id, spot_name=s["name"], lat=s["lat"], lng=s["lng"],
                           date=ctx.day(start_days).isoformat(), time_of_day=time_of_day,
                           accessibility_note=s["accessibility"], set_by=ctx.users[by].id, set_at=ctx.now - timedelta(days=1))


async def photos(ctx: Ctx, rental: Rental, slug: str, phase: str, who: str, role: str, at_days: float,
                 confirmed_by: str | None, note: str = "") -> ConditionPhotoSet:
    img = condition_url(slug, "pickup" if phase == "pickup" else "return")
    ps = ConditionPhotoSet(
        rental_id=rental.id, phase=phase, uploaded_by=ctx.users[who].id, uploader_role=role,
        photos=[img, f"/seed-images/{slug}-1.svg"], note=note,
        confirmed_by=ctx.users[confirmed_by].id if confirmed_by else None,
        confirmed_at=ctx.at(at_days, 16) if confirmed_by else None,
        created_at=ctx.at(at_days),
    )
    await ps.insert()
    return ps


async def say(ctx: Ctx, rental: Rental, who: str | None, days: float, body: str, hour: int = 15) -> None:
    sender = ctx.users[who].id if who else None
    await Message(rental_id=rental.id, sender_id=sender, body=body, created_at=ctx.at(days, hour),
                  read_by=[sender] if sender else []).insert()


async def review(ctx: Ctx, rental: Rental, author: str, subject: str, role: str, rating: int, text: str, days: float) -> None:
    await Review(rental_id=rental.id, listing_id=rental.listing_id, author_id=ctx.users[author].id,
                 subject_id=ctx.users[subject].id, subject_role=role, rating=rating, text=text,
                 created_at=ctx.at(days)).insert()


def release(hold: Hold, at: datetime, note: str = "Clean return") -> None:
    hold.history.append(HoldEvent(at=at, event="release", from_status=hold.status, to_status="released", note=note))
    hold.status, hold.released_at = "released", at


def capture(hold: Hold, at: datetime, amount: float, note: str) -> None:
    hold.history.append(HoldEvent(at=at, event="capture", from_status=hold.status, to_status="captured", note=note))
    hold.status, hold.captured_at, hold.captured_amount = "captured", at, amount


async def seed_scenarios(ctx: Ctx) -> int:
    U = ctx.users
    count = 0

    # 1. Requested: Ellie asks Leo for the GoPro.
    r = await make_rental(ctx, "gopro-hero11", "ellie", 3, 3, "requested", -0.2,
                          note="Hi Leo! I need this for a FIL project shoot at the lake. I'll keep it in the case.")
    await Hold(rental_id=r.id, borrower_id=r.borrower_id, amount=r.quote.hold_amount, status="pending",
               created_at=r.created_at,
               history=[HoldEvent(at=r.created_at, event="created", from_status="pending", to_status="pending",
                                  note="Waiting for approval")]).insert()
    await say(ctx, r, "ellie", -0.2, "Hi Leo! I need this for a FIL project shoot at the lake. I'll keep it in the case.")
    await Notification(user_id=U["leo"].id, kind="request", title="New request: GoPro HERO11 Black Action Camera Kit",
                       body="Ellie Martinez wants it for 3 days.", rental_id=r.id, link=f"/rentals/{r.id}",
                       created_at=ctx.at(-0.2)).insert()
    count += 1

    # 2. Approved: Kurt approved the drill. Ellie still needs to accept the agreement and place the hold.
    r = await make_rental(ctx, "dewalt-drill", "ellie", 2, 2, "approved", -1, note="Putting up shelves in my dorm.")
    r.agreement.lender_accepted_at = ctx.at(-0.5)
    event(r, ctx.at(-0.5), "approved", "Lender approved the request")
    h = Hold(rental_id=r.id, borrower_id=r.borrower_id, amount=r.quote.hold_amount, status="pending", created_at=r.created_at,
             history=[HoldEvent(at=r.created_at, event="created", from_status="pending", to_status="pending",
                                note="Waiting for approval")])
    await h.insert()
    r.hold_id = h.id
    await r.save()
    await say(ctx, r, "kurt", -0.5, "Approved. Garage A works for me. I'll bring the bit set too if you add it.")
    await Notification(user_id=U["ellie"].id, kind="approved", title="Kurt approved your request",
                       body="Accept the agreement and place the protection hold to confirm.", rental_id=r.id,
                       link=f"/rentals/{r.id}", created_at=ctx.at(-0.5)).insert()
    count += 1

    # 3. Confirmed (hold active, waiting for pickup): Ellie and Priya's Copic markers.
    r = await make_rental(ctx, "copic-36", "ellie", 1, 5, "confirmed", -2)
    await accept_and_pay(ctx, r, -1, card="debit")
    set_meetup(ctx, r, "visual-arts", 1, "afternoon", "priya")
    await r.save()
    await say(ctx, r, "priya", -1, "Thanks Ellie! Courtyard tomorrow afternoon? I'll have the case.")
    await say(ctx, r, "ellie", -1, "Perfect, see you around 2.", 16)
    count += 1

    # 4. In progress, long rental: Ellie has Kurt's portable AC. Hold expires tomorrow, so the reminder job fires.
    r = await make_rental(ctx, "portable-ac", "ellie", -6, 30, "in_progress", -8)
    await accept_and_pay(ctx, r, -6.2, card="visa", expires_in=0.8)
    set_meetup(ctx, r, "garage-a", -6, "evening", "kurt")
    r.picked_up_at = ctx.at(-6, 22)
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    await photos(ctx, r, "portable-ac", "pickup", "ellie", "borrower", -6, "kurt", "Window kit and remote included.")
    await photos(ctx, r, "portable-ac", "pickup", "kurt", "lender", -6, "ellie")
    await r.save()
    await say(ctx, r, "kurt", -6, "It's in the trunk at Garage A whenever you're ready.", 21)
    await say(ctx, r, "ellie", -3, "Working great, my room finally feels normal.")
    count += 1

    # 5. In progress with a card that fails on refresh: Marcus has Leo's lights. Advance 2 days to see it fail.
    r = await make_rental(ctx, "neewer-lights", "marcus", -5, 10, "in_progress", -6)
    await accept_and_pay(ctx, r, -5.1, card="refreshfail", expires_in=1.6)
    set_meetup(ctx, r, "visual-arts", -5, "morning", "leo")
    r.picked_up_at = ctx.at(-5, 14)
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    await photos(ctx, r, "neewer-lights", "pickup", "leo", "lender", -5, "marcus")
    await r.save()
    await say(ctx, r, "marcus", -5, "Got them, thanks. Shooting interviews for senior design this week.", 15)
    count += 1

    # 6. Returned clean, hold released, both reviewed: Ellie borrowed Dana's BA II Plus.
    r = await make_rental(ctx, "ba-ii-plus", "ellie", -20, 3, "completed", -22)
    h = await accept_and_pay(ctx, r, -21)
    r.picked_up_at, r.returned_at = ctx.at(-20), ctx.at(-17)
    r.return_checklist = ["Item is clean", "All parts included", "Reset to factory settings"]
    release(h, ctx.at(-16))
    await h.save()
    await photos(ctx, r, "ba-ii-plus", "pickup", "ellie", "borrower", -20, "dana")
    await photos(ctx, r, "ba-ii-plus", "return", "ellie", "borrower", -17, "dana")
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    event(r, r.returned_at, "returned", "Item returned")
    event(r, ctx.at(-16), "hold_released", "Hold released: $10")
    r.borrower_reviewed = r.lender_reviewed = True
    await r.save()
    await review(ctx, r, "ellie", "dana", "lender", 5, "Calculator was spotless and Dana showed me the TVM shortcuts. Got me through my FIN exam.", -16)
    await review(ctx, r, "dana", "ellie", "borrower", 5, "On time and returned it reset. Easy rental.", -16)
    await Notification(user_id=U["ellie"].id, kind="hold_released", title="Your $10 hold has been released",
                       body="TI BA II Plus came back in the same condition.", rental_id=r.id, link=f"/rentals/{r.id}",
                       read=True, created_at=ctx.at(-16)).insert()
    count += 1

    # 7. Returned, waiting for Leo to check it: Jordan returned the DSLR today.
    r = await make_rental(ctx, "canon-t7", "jordan", -4, 4, "return_pending", -6, with_bundle=True)
    await accept_and_pay(ctx, r, -4.2)
    r.picked_up_at, r.returned_at = ctx.at(-4), ctx.at(0, 13)
    r.return_checklist = ["Item is clean", "All parts included", "Batteries charged"]
    await photos(ctx, r, "canon-t7", "pickup", "jordan", "borrower", -4, "leo")
    await photos(ctx, r, "canon-t7", "return", "jordan", "borrower", 0, None, "All three batteries charged. SD card formatted.")
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    event(r, r.returned_at, "returned", "Item returned. Lender is checking it.")
    await r.save()
    await say(ctx, r, "jordan", 0, "Dropped it off at the courtyard bench with you. Thanks again!", 13)
    await Notification(user_id=U["leo"].id, kind="returned", title="Jordan returned the Canon EOS Rebel T7",
                       body="Check it and confirm a clean return, or file a claim.", rental_id=r.id, link=f"/rentals/{r.id}",
                       created_at=ctx.at(0, 13)).insert()
    count += 1

    # 8. Damage claim open, waiting for Ellie's response: Rafael's audio kit.
    r = await make_rental(ctx, "rode-audio", "ellie", -6, 4, "claim_open", -8)
    await accept_and_pay(ctx, r, -6.3)
    r.picked_up_at, r.returned_at = ctx.at(-6), ctx.at(-2)
    await photos(ctx, r, "rode-audio", "pickup", "ellie", "borrower", -6, "rafael")
    await photos(ctx, r, "rode-audio", "return", "ellie", "borrower", -2, "rafael")
    claim_photos = await photos(ctx, r, "rode-audio", "claim", "rafael", "lender", -1, None,
                                "Receiver clip is cracked and one foam cover is torn.")
    r.claim = Claim(type="damage", amount=25, description="The receiver's belt clip is cracked and one foam windscreen is torn. Replacement parts cost $25.",
                    photo_set_id=claim_photos.id, filed_at=ctx.at(-1))
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    event(r, r.returned_at, "returned", "Item returned")
    event(r, ctx.at(-1), "claim_filed", "Lender filed a damage claim for $25")
    await r.save()
    await say(ctx, r, "rafael", -1, "Hey Ellie, the clip on the receiver came back cracked. I filed a claim for the part. Let me know if you saw it happen.")
    await Notification(user_id=U["ellie"].id, kind="claim", title="Rafael filed a $25 damage claim",
                       body="Your $40 hold is still held, not charged. Respond to the claim.", rental_id=r.id,
                       link=f"/rentals/{r.id}", created_at=ctx.at(-1)).insert()
    count += 1

    # 9. Hold captured after a late return: Jordan and Kurt's sander.
    r = await make_rental(ctx, "ryobi-sander", "jordan", -15, 3, "completed", -16)
    h = await accept_and_pay(ctx, r, -15.2)
    r.picked_up_at, r.returned_at = ctx.at(-15), ctx.at(-10)
    r.late, r.late_days = True, 2
    await photos(ctx, r, "ryobi-sander", "pickup", "kurt", "lender", -15, "jordan")
    await photos(ctx, r, "ryobi-sander", "return", "kurt", "lender", -10, None)
    r.claim = Claim(type="late", amount=10, description="Returned 2 days late. Asking for 2 extra days at $5 per day.",
                    filed_at=ctx.at(-9.5), status="resolved", borrower_response="accept", responded_at=ctx.at(-9),
                    decision="capture", decision_amount=10,
                    explanation="Jordan accepted the late-return claim. $10 of the $25 hold was charged and $15 was released.",
                    resolved_at=ctx.at(-9))
    capture(h, ctx.at(-9), 10, "Late return claim accepted")
    await h.save()
    r.payment.claim_charge_id, r.payment.claim_charged_amount = f"ch_mock_seedclaim{r.id}", 10
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    event(r, r.returned_at, "returned", "Item returned 2 days late")
    event(r, ctx.at(-9), "hold_captured", "Hold captured: $10. $15 released.")
    r.borrower_reviewed = r.lender_reviewed = True
    await r.save()
    await review(ctx, r, "kurt", "jordan", "borrower", 2, "Came back two days late and I had to chase him for it.", -9)
    await review(ctx, r, "jordan", "kurt", "lender", 4, "Sander worked well. My fault on the late return.", -9)
    count += 1

    # 10. Disputed claim under review, waiting for a moderator: Marcus and Dana's carpet cleaner.
    r = await make_rental(ctx, "carpet-cleaner", "marcus", -9, 2, "claim_open", -10)
    await accept_and_pay(ctx, r, -9.2)
    r.picked_up_at, r.returned_at = ctx.at(-9), ctx.at(-7)
    await photos(ctx, r, "carpet-cleaner", "pickup", "marcus", "borrower", -9, "dana", "Small crack on the tank handle already there.")
    await photos(ctx, r, "carpet-cleaner", "return", "marcus", "borrower", -7, "dana")
    cp = await photos(ctx, r, "carpet-cleaner", "claim", "dana", "lender", -6.5, None, "Tank handle is cracked.")
    r.claim = Claim(type="damage", amount=30, description="The clean water tank handle is cracked. A new tank is $30.",
                    photo_set_id=cp.id, filed_at=ctx.at(-6.5), status="under_review", borrower_response="dispute",
                    borrower_message="That crack is in my pickup photos and I mentioned it in the note at pickup.",
                    responded_at=ctx.at(-6))
    event(r, r.picked_up_at, "picked_up", "Item picked up")
    event(r, r.returned_at, "returned", "Item returned")
    event(r, ctx.at(-6.5), "claim_filed", "Lender filed a damage claim for $30")
    event(r, ctx.at(-6), "claim_disputed", "Borrower disputed the claim. A moderator will review it.")
    await r.save()
    await Notification(user_id=U["mod"].id, kind="dispute", title="Dispute needs review: carpet cleaner",
                       body="Marcus disputed Dana's $30 damage claim.", rental_id=r.id, link="/moderation",
                       created_at=ctx.at(-6)).insert()
    count += 1

    count += await seed_history(ctx)
    return count


GOOD_LENDER = [
    "Exactly as described and super easy pickup.", "Clean, charged and ready to go.", "Great communication, would rent again.",
    "Saved me from buying one for a single project.", "Showed me how to use it at pickup. Very helpful.",
]
GOOD_BORROWER = [
    "Returned on time and in the same condition.", "Easy to coordinate with. Took good care of it.",
    "Friendly and on time.", "Returned it cleaner than I lent it.",
]


async def seed_history(ctx: Ctx) -> int:
    """Past clean rentals so ratings and counts come from real reviews."""
    rng = random.Random(42)
    members = [k for k in ctx.users if k != "mod"]
    slugs = list(ctx.listings)
    owner_of = {slug: next(k for k, u in ctx.users.items() if u.id == listing.owner_id) for slug, listing in ctx.listings.items()}
    made = 0
    for i in range(46):
        slug = slugs[i % len(slugs)]
        borrower = rng.choice([m for m in members if m != owner_of[slug]])
        if i in (5, 17):  # two rough rentals for Jordan, so the moderator view has a flagged account
            borrower = "jordan"
        start = -200 + i * 4
        days = rng.choice([2, 3, 4, 7])
        r = await make_rental(ctx, slug, borrower, start, days, "completed", start - 2)
        h = await accept_and_pay(ctx, r, start - 1)
        r.picked_up_at, r.returned_at = ctx.at(start), ctx.at(start + days)
        release(h, ctx.at(start + days + 1))
        await h.save()
        r.borrower_reviewed = r.lender_reviewed = True
        event(r, r.returned_at, "returned", "Item returned")
        event(r, ctx.at(start + days + 1), "hold_released", f"Hold released: ${h.amount:,.0f}")
        await r.save()
        lender_rating = rng.choice([5, 5, 5, 4, 5, 4])
        borrower_rating = rng.choice([5, 5, 4, 5])
        borrower_text = rng.choice(GOOD_BORROWER)
        if i in (5, 17):
            borrower_rating, borrower_text = 2, "Item came back with sticky keys and he stopped answering messages for a day."
        await review(ctx, r, borrower, owner_of[slug], "lender", lender_rating, rng.choice(GOOD_LENDER), start + days + 1)
        await review(ctx, r, owner_of[slug], borrower, "borrower", borrower_rating, borrower_text, start + days + 1)
        made += 1
    return made
