"""Protection hold state machine. Every change goes through `apply`, which rejects illegal moves.

    pending --authorize_ok--> active --refresh_ok--> active
    pending --authorize_fail--> failed --authorize_ok--> active (new card)
    active --refresh_fail--> failed
    active --release--> released      pending/failed --release--> released (nothing was held)
    active --capture--> captured
    released and captured are final.
"""

from datetime import date, datetime

from app.models.hold import CardInfo, Hold, HoldEvent
from app.services.payments import PaymentError, provider

EVENTS: dict[str, tuple[set[str], str]] = {
    "authorize_ok": ({"pending", "failed"}, "active"),
    "authorize_fail": ({"pending", "failed"}, "failed"),
    "refresh_ok": ({"active"}, "active"),
    "refresh_fail": ({"active"}, "failed"),
    "release": ({"pending", "active", "failed"}, "released"),
    "capture": ({"active"}, "captured"),
}



class IllegalHoldTransition(Exception):
    def __init__(self, status: str, event: str):
        self.status, self.event = status, event
        super().__init__(f"A {status} hold can't be changed with '{event}'.")


class HoldDeclined(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


def apply(hold: Hold, event: str, at: datetime, note: str = "") -> None:
    allowed_from, to = EVENTS[event]
    if hold.status not in allowed_from:
        raise IllegalHoldTransition(hold.status, event)
    hold.history.append(HoldEvent(at=at, event=event, from_status=hold.status, to_status=to, note=note))
    hold.status = to


async def place(hold: Hold, number: str, exp_month: int, exp_year: int, cvc: str, now: datetime, today: date) -> Hold:
    """Authorize the hold on a card. Raises HoldDeclined (and records it) when the card fails."""
    if hold.status not in EVENTS["authorize_ok"][0]:
        raise IllegalHoldTransition(hold.status, "authorize")
    try:
        pm = provider.tokenize(number, exp_month, exp_year, cvc, today)
        auth = await provider.authorize_hold(pm.token, hold.amount, now)
    except PaymentError as err:
        if err.code in ("card_declined", "expired_card"):
            hold.failure_code, hold.failure_message = err.code, err.message
            apply(hold, "authorize_fail", now, err.message)
            await hold.save()
        raise HoldDeclined(err.code, err.message) from err
    hold.card = CardInfo(brand=pm.brand, last4=pm.last4, funding=pm.funding, exp_month=pm.exp_month, exp_year=pm.exp_year)
    hold.payment_method_token = pm.token
    hold.authorization_id = auth.id
    hold.placed_at = hold.placed_at or now
    hold.expires_at = auth.expires_at
    hold.failure_code = hold.failure_message = None
    hold.reminder_sent_for = None
    apply(hold, "authorize_ok", now, f"{pm.brand} {pm.funding} ending {pm.last4}")
    await hold.save()
    return hold


async def refresh(hold: Hold, now: datetime) -> bool:
    if hold.status != "active":
        raise IllegalHoldTransition(hold.status, "refresh")
    try:
        auth = await provider.refresh_hold(hold.payment_method_token or "", hold.authorization_id or "", hold.amount, now)
    except PaymentError as err:
        hold.failure_code, hold.failure_message = err.code, err.message
        apply(hold, "refresh_fail", now, err.message)
        await hold.save()
        return False
    hold.authorization_id, hold.expires_at = auth.id, auth.expires_at
    hold.refresh_count += 1
    hold.reminder_sent_for = None
    apply(hold, "refresh_ok", now, "Renewed for 7 more days. No charge.")
    await hold.save()
    return True


async def release(hold: Hold, now: datetime, note: str) -> None:
    apply(hold, "release", now, note)
    if hold.authorization_id:
        await provider.release_hold(hold.authorization_id)
    hold.released_at = now
    await hold.save()


async def capture(hold: Hold, now: datetime, amount: float, note: str) -> str:
    if amount <= 0 or amount > hold.amount:
        raise ValueError(f"You can capture between $1 and the held ${hold.amount:,.0f}.")
    apply(hold, "capture", now, note)
    charge = await provider.capture_hold(hold.authorization_id or "", amount)
    hold.captured_amount, hold.captured_at = amount, now
    await hold.save()
    return charge.id


def released_amount(hold: Hold) -> float:
    if hold.status == "released":
        return hold.amount if hold.authorization_id else 0
    if hold.status == "captured":
        return round(hold.amount - hold.captured_amount, 2)
    return 0
