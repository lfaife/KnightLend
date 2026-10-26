"""Pricing math. The client only displays what this returns."""

from app.models.listing import Listing, Prices
from app.models.rental import Quote, QuoteLine

SERVICE_FEE = 1.00
NEAR_PURCHASE_RATIO = 0.6
UNITS = [("day", 1), ("week", 7), ("month", 30), ("semester", 112)]
UNIT_LABEL = {"day": "Day", "week": "Week", "month": "Month", "semester": "Semester (16 weeks)"}

# Protection hold limits by the item's estimated value.
HOLD_TIERS = [
    {"label": "Under $50", "min_value": 0, "max_value": 50, "min_hold": 5, "max_hold": 15},
    {"label": "$50 to $150", "min_value": 50, "max_value": 150, "min_hold": 25, "max_hold": 50},
    {"label": "$150 and up", "min_value": 150, "max_value": None, "min_hold": 75, "max_hold": 150},
]


def hold_tier(value: float) -> dict:
    for tier in HOLD_TIERS:
        if tier["max_value"] is None or value < tier["max_value"]:
            return tier
    return HOLD_TIERS[-1]


def suggest_hold(value: float) -> float:
    tier = hold_tier(value)
    lo, hi = tier["min_hold"], tier["max_hold"]
    if tier["max_value"] is None:
        t = min(value - 150, 150) / 150
    else:
        t = (value - tier["min_value"]) / (tier["max_value"] - tier["min_value"])
    return float(min(hi, max(lo, round((lo + t * (hi - lo)) / 5) * 5)))


def hold_in_range(value: float, hold: float) -> bool:
    tier = hold_tier(value)
    return tier["min_hold"] <= hold <= tier["max_hold"]


def best_plan(prices: Prices, days: int) -> list[QuoteLine]:
    """Cheapest mix of day/week/month/semester rates that covers `days`.

    Overshooting is allowed: a 6-day rental uses the weekly rate when that is cheaper.
    """
    units = [(name, n, getattr(prices, name)) for name, n in UNITS if getattr(prices, name)]
    cost = [0.0] + [float("inf")] * days
    choice: list[tuple[str, int] | None] = [None] * (days + 1)
    for d in range(1, days + 1):
        for name, n, price in units:
            c = cost[max(0, d - n)] + price
            if c < cost[d] - 1e-9:
                cost[d], choice[d] = c, (name, n)
    counts: dict[str, int] = {}
    d = days
    while d > 0:
        name, n = choice[d]  # type: ignore[misc]
        counts[name] = counts.get(name, 0) + 1
        d = max(0, d - n)
    lines = []
    for name, _n in reversed(UNITS):
        if name in counts:
            unit_price = getattr(prices, name)
            lines.append(
                QuoteLine(
                    label=UNIT_LABEL[name],
                    quantity=counts[name],
                    unit_price=unit_price,
                    amount=round(unit_price * counts[name], 2),
                )
            )
    return lines


def build_quote(listing: Listing, days: int, with_bundle: bool = False) -> Quote:
    lines = best_plan(listing.prices, days)
    rental_fee = round(sum(line.amount for line in lines), 2)
    bundle_fee = round(listing.bundle.extra_per_day * days, 2) if (with_bundle and listing.bundle) else 0.0
    total = round(rental_fee + bundle_fee + SERVICE_FEE, 2)
    ratio = round(total / listing.estimated_value, 3) if listing.estimated_value else 0
    return Quote(
        days=days,
        lines=lines,
        rental_fee=rental_fee,
        bundle_fee=bundle_fee,
        service_fee=SERVICE_FEE,
        total=total,
        hold_amount=listing.hold_amount,
        estimated_value=listing.estimated_value,
        value_ratio=ratio,
        near_purchase_price=ratio >= NEAR_PURCHASE_RATIO,
    )


def lender_earnings(quote: Quote) -> float:
    """Lenders keep the rental and bundle fees. The service fee covers the platform."""
    return round(quote.rental_fee + quote.bundle_fee, 2)
