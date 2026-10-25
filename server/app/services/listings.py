"""Search, availability and the shapes the listing routes return."""

import re
from datetime import date

from beanie import PydanticObjectId

from app.models.listing import Listing
from app.models.rental import Rental
from app.models.review import Review
from app.models.user import User
from app.schemas.listing import (
    BookedRange,
    ListingCard,
    OwnerSnippet,
    PickupOut,
    PricesOut,
    ReviewOut,
)
from app.services.geo import haversine_miles

CONDITION_RANK = {"new": 4, "like_new": 3, "good": 2, "fair": 1}
CATEGORY_LABEL = {
    "calculators_electronics": "electronics",
    "art_supplies": "art supplies",
    "tools": "tools",
    "cameras_media": "cameras media film video",
    "household_appliances": "household appliances apartment",
    "clothing_events": "clothing events formal",
}
# Rentals in these states keep the item off the shelf for their dates.
BLOCKING = ("approved", "confirmed", "in_progress")


def owner_snippet(u: User) -> OwnerSnippet:
    return OwnerSnippet(id=u.id, name=u.name, affiliation=u.affiliation, verified=u.verified,
                        rating_avg=round(u.rating_avg, 2), rating_count=u.rating_count,
                        rentals_count=u.rentals_count, lent_count=u.lent_count, avatar_url=u.avatar_url)


def card(listing: Listing, owner: User, distance: float) -> ListingCard:
    return ListingCard(
        id=listing.id, title=listing.title, category=listing.category,
        photo=listing.photos[0] if listing.photos else None,
        prices=PricesOut(**listing.prices.model_dump()), condition=listing.condition,
        hold_amount=listing.hold_amount, distance_miles=round(distance, 1),
        pickup=PickupOut(**listing.pickup.model_dump()), sanitized=listing.sanitized,
        requires_approval=listing.requires_approval, rating_avg=listing.rating_avg,
        rating_count=listing.rating_count, owner=owner_snippet(owner), tags=listing.tags,
    )


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def text_score(listing: Listing, q: str) -> int | None:
    """None if any search word is missing, otherwise a relevance score where title hits count most.

    Words must match the start of a word, so "calc" finds "calculator". Short words only match
    whole words outside the title, so "ba" doesn't match "battery".
    """
    title = _words(listing.title)
    body = _words(" ".join([listing.description, " ".join(listing.tags), CATEGORY_LABEL[listing.category],
                            " ".join(f"{s.label} {s.value}" for s in listing.specs)]))
    score = 0
    for token in _words(q):
        if token in title:
            score += 4
        elif any(w.startswith(token) for w in title):
            score += 3
        elif token in body:
            score += 1
        elif not (len(token) >= 4 and any(w.startswith(token) for w in body)):
            return None
    return score


async def booked_ranges(listing_id: PydanticObjectId) -> list[BookedRange]:
    rentals = await Rental.find({"listing_id": listing_id, "status": {"$in": list(BLOCKING)}}).to_list()
    return sorted((BookedRange(start=r.start_date, end=r.end_date) for r in rentals), key=lambda b: b.start)


def overlaps(ranges: list[BookedRange], start: date, end: date) -> bool:
    s, e = start.isoformat(), end.isoformat()
    return any(r.start < e and s < r.end for r in ranges)


async def reviews_out(reviews: list[Review]) -> list[ReviewOut]:
    authors = {u.id: u for u in await User.find({"_id": {"$in": [r.author_id for r in reviews]}}).to_list()}
    listings = {x.id: x for x in await Listing.find({"_id": {"$in": [r.listing_id for r in reviews]}}).to_list()}
    return [
        ReviewOut(id=r.id, rating=r.rating, text=r.text, author_id=r.author_id,
                  author_name=authors[r.author_id].name if r.author_id in authors else "Former member",
                  subject_role=r.subject_role,
                  listing_title=listings[r.listing_id].title if r.listing_id in listings else None,
                  created_at=r.created_at)
        for r in reviews
    ]


def distance_from(listing: Listing, lat: float, lng: float) -> float:
    return haversine_miles(lat, lng, listing.pickup.lat, listing.pickup.lng)
