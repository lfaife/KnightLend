"""Mock payment provider. Simulation only: no card data leaves this process and nothing is charged.

The interface is shaped like Stripe's manual-capture PaymentIntents so a real provider can be
swapped in later:
    authorize_hold  ~ PaymentIntent.create(capture_method="manual")
    refresh_hold    ~ cancel and re-authorize before the 7-day authorization window closes
    release_hold    ~ PaymentIntent.cancel
    capture_hold    ~ PaymentIntent.capture(amount_to_capture=...)
    charge_rental   ~ PaymentIntent.create(capture_method="automatic")

Test card numbers force outcomes (see TEST_CARDS). Any other number is rejected so nobody
types a real card into the demo.
"""

import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

HOLD_DAYS = 7

Scenario = Literal["success", "decline", "expired", "refreshfail"]
SCENARIOS = ("success", "decline", "expired", "refreshfail")


@dataclass(frozen=True)
class TestCard:
    number: str
    brand: str
    funding: Literal["credit", "debit"]
    scenario: Scenario
    description: str


TEST_CARDS = [
    TestCard("4242424242424242", "Visa", "credit", "success", "Visa credit. Every hold succeeds."),
    TestCard("5555555555554444", "Mastercard", "credit", "success", "Mastercard credit. Every hold succeeds."),
    TestCard("4000056655665556", "Visa", "debit", "success", "Visa debit. Succeeds and shows the debit card notice."),
    TestCard("4000000000000002", "Visa", "credit", "decline", "Your bank declines the hold."),
    TestCard("4000000000000069", "Visa", "credit", "expired", "Fails as an expired card."),
    TestCard("4000000000000341", "Visa", "credit", "refreshfail", "First hold works. The 7-day refresh fails."),
]
_BY_NUMBER = {c.number: c for c in TEST_CARDS}


class PaymentError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class PaymentMethod:
    token: str
    brand: str
    last4: str
    funding: Literal["credit", "debit"]
    exp_month: int
    exp_year: int


@dataclass
class Authorization:
    id: str
    amount: float
    expires_at: datetime


@dataclass
class Charge:
    id: str
    amount: float


def token_for(scenario: Scenario, last4: str) -> str:
    return f"pm_mock_{scenario}_{last4}"


def scenario_of(token: str) -> str:
    parts = token.split("_")
    return parts[2] if len(parts) == 4 and parts[2] in SCENARIOS else "success"


class MockPaymentProvider:
    def tokenize(self, number: str, exp_month: int, exp_year: int, cvc: str, today: date) -> PaymentMethod:
        digits = "".join(ch for ch in number if ch.isdigit())
        card = _BY_NUMBER.get(digits)
        if card is None:
            raise PaymentError(
                "invalid_number",
                "That isn't a test card. This demo only accepts the test card numbers shown on the form.",
            )
        if not (cvc.isdigit() and len(cvc) in (3, 4)):
            raise PaymentError("invalid_cvc", "Enter the 3-digit security code.")
        if not 1 <= exp_month <= 12:
            raise PaymentError("invalid_expiry", "Enter a valid expiry month.")
        year = exp_year + 2000 if exp_year < 100 else exp_year
        if (year, exp_month) < (today.year, today.month):
            raise PaymentError("expired_card", "This card has expired. Use a different card.")
        return PaymentMethod(
            token=token_for(card.scenario, digits[-4:]),
            brand=card.brand,
            last4=digits[-4:],
            funding=card.funding,
            exp_month=exp_month,
            exp_year=year,
        )

    def _check(self, token: str, refresh: bool = False) -> None:
        scenario = scenario_of(token)
        if scenario == "decline":
            raise PaymentError("card_declined", "Your bank declined the protection hold.")
        if scenario == "expired":
            raise PaymentError("expired_card", "Your bank says this card has expired.")
        if refresh and scenario == "refreshfail":
            raise PaymentError("card_declined", "Your bank declined the hold renewal.")

    async def authorize_hold(self, token: str, amount: float, now: datetime) -> Authorization:
        self._check(token)
        return Authorization(id=f"pi_mock_{secrets.token_hex(8)}", amount=amount, expires_at=now + timedelta(days=HOLD_DAYS))

    async def refresh_hold(self, token: str, authorization_id: str, amount: float, now: datetime) -> Authorization:
        self._check(token, refresh=True)
        return Authorization(id=f"pi_mock_{secrets.token_hex(8)}", amount=amount, expires_at=now + timedelta(days=HOLD_DAYS))

    async def release_hold(self, authorization_id: str) -> None:
        return None

    async def capture_hold(self, authorization_id: str, amount: float) -> Charge:
        return Charge(id=f"ch_mock_{secrets.token_hex(8)}", amount=amount)

    async def charge_rental(self, token: str, amount: float) -> Charge:
        self._check(token)
        return Charge(id=f"ch_mock_{secrets.token_hex(8)}", amount=amount)


provider = MockPaymentProvider()
