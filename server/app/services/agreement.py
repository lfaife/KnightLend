"""The plain-language rental agreement both sides accept."""

from datetime import date

from app.models.listing import Listing
from app.models.rental import Agreement

VERSION = "2026-10"


def _fmt(d: date) -> str:
    return f"{d:%a, %b} {d.day}"


def build_agreement(listing: Listing, start: date, end: date) -> Agreement:
    hold = f"${listing.hold_amount:,.0f}"
    value = f"${listing.estimated_value:,.0f}"
    terms = [
        f"The {hold} protection hold is a temporary hold on the borrower's card. It is not a charge.",
        f"The rental runs {_fmt(start)} to {_fmt(end)}. Return the {listing.title} by {_fmt(end)}.",
        "After a clean return (same condition, on time), the hold is released within 3 days.",
        f"If the item comes back damaged, late, or not at all, the lender can file a claim. If the claim is "
        f"approved, up to {hold} (the held amount) can be charged to the borrower's card.",
        f"If the item is destroyed or never returned, the borrower may owe its full replacement value ({value}), "
        "even when that is more than the hold.",
        "Both sides can add before-pickup and after-return condition photos. "
        "Those photos count as evidence in any claim.",
        "Holds last 7 days. For longer rentals the hold refreshes automatically, with a reminder the day before. "
        "A refresh never charges the borrower.",
        "Cancel more than 24 hours before pickup for a full refund of the rental fee. Within 24 hours, half the "
        "rental fee is refunded. The hold is released as soon as a rental is cancelled.",
        "Keep all messages in KnightLend. They are the permanent record of the rental.",
    ]
    return Agreement(version=VERSION, terms=terms)
