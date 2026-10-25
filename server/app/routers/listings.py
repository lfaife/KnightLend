from datetime import date
from math import ceil
from typing import Literal

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core import clock
from app.core.security import get_current_user, get_optional_user
from app.models.listing import Category, Condition, Listing
from app.models.review import Review
from app.models.user import User
from app.schemas.common import OK
from app.schemas.listing import (
    BundleOut,
    HoldSuggestion,
    ListingCard,
    ListingDetail,
    ListingPage,
    PickupOut,
    PricesOut,
    QuoteCheck,
    QuoteOut,
    SpecOut,
)
from app.services import listings as svc
from app.services.geo import AREAS, PICKUP_SPOTS
from app.services.pricing import build_quote, hold_tier, suggest_hold

router = APIRouter(prefix="/api/listings", tags=["listings"])

DEFAULT_ORIGIN = PICKUP_SPOTS[0]  # Student Union


def _origin(origin: str | None, lat: float | None, lng: float | None) -> tuple[float, float, str]:
    if lat is not None and lng is not None:
        return lat, lng, "the spot you picked on the map"
    place = next((p for p in [*PICKUP_SPOTS, *AREAS] if p["id"] == origin), DEFAULT_ORIGIN)
    return place["lat"], place["lng"], place["name"]


async def get_listing_or_404(listing_id: PydanticObjectId) -> Listing:
    listing = await Listing.get(listing_id)
    if listing is None or listing.status == "removed":
        raise HTTPException(404, "That listing isn't available.")
    return listing


@router.get("", response_model=ListingPage)
async def search_listings(
    q: str | None = Query(None, max_length=80, description="Words to match in title, specs, tags"),
    category: Category | None = None,
    tag: str | None = Query(None, max_length=40),
    min_price: float | None = Query(None, ge=0, description="Minimum price per day"),
    max_price: float | None = Query(None, ge=0, description="Maximum price per day"),
    max_distance: float | None = Query(None, gt=0, le=50, description="Miles from the origin"),
    condition: list[Condition] | None = Query(None),
    available_from: date | None = None,
    available_to: date | None = None,
    max_hold: float | None = Query(None, ge=0),
    min_rating: float | None = Query(None, ge=0, le=5, description="Minimum lender rating"),
    sanitized: bool | None = None,
    no_approval: bool | None = Query(None, description="Only items that don't need lender approval"),
    owner_id: PydanticObjectId | None = None,
    origin: str | None = Query(None, description="Pickup spot or area id to measure distance from"),
    origin_lat: float | None = Query(None, ge=-90, le=90),
    origin_lng: float | None = Query(None, ge=-180, le=180),
    sort: Literal["nearby", "price", "rating", "newest"] = "nearby",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
) -> ListingPage:
    if available_from and available_to and available_to <= available_from:
        raise HTTPException(422, "The end date must be after the start date.")
    lat, lng, origin_label = _origin(origin, origin_lat, origin_lng)
    filters: dict = {"status": "active"}
    if category:
        filters["category"] = category
    if owner_id:
        filters["owner_id"] = owner_id
    listings = await Listing.find(filters).to_list()
    owners = {u.id: u for u in await User.find({"_id": {"$in": list({x.owner_id for x in listings})}}).to_list()}

    results: list[tuple[Listing, float, int]] = []
    for x in listings:
        owner = owners.get(x.owner_id)
        if owner is None or (owner.restricted and owner_id is None):
            continue
        score = svc.text_score(x, q) if q else 0
        if score is None:
            continue
        if tag and tag.lower() not in [t.lower() for t in x.tags]:
            continue
        if min_price is not None and x.prices.day < min_price:
            continue
        if max_price is not None and x.prices.day > max_price:
            continue
        if condition and x.condition not in condition:
            continue
        if max_hold is not None and x.hold_amount > max_hold:
            continue
        if min_rating is not None and owner.rating_avg < min_rating:
            continue
        if sanitized and not x.sanitized:
            continue
        if no_approval and x.requires_approval:
            continue
        distance = svc.distance_from(x, lat, lng)
        if max_distance is not None and distance > max_distance:
            continue
        if available_from and available_to:
            if svc.overlaps(await svc.booked_ranges(x.id), available_from, available_to):
                continue
        results.append((x, distance, score))

    # With a search, better matches come first and distance breaks ties ("nearby-first").
    keys = {
        "nearby": lambda t: (-t[2], t[1], t[0].prices.day),
        "price": lambda t: (t[0].prices.day, t[1]),
        "rating": lambda t: (-owners[t[0].owner_id].rating_avg, t[1]),
        "newest": lambda t: -t[0].created_at.timestamp(),
    }
    results.sort(key=keys[sort])
    total = len(results)
    chunk = results[(page - 1) * page_size : page * page_size]
    items = [svc.card(x, owners[x.owner_id], d) for x, d, _ in chunk]
    return ListingPage(
        items=items, total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)), origin_label=origin_label
    )


@router.get("/hold-suggestion", response_model=HoldSuggestion)
async def hold_suggestion(value: float = Query(gt=0, le=10000)) -> HoldSuggestion:
    tier = hold_tier(value)
    return HoldSuggestion(
        estimated_value=value,
        suggested=suggest_hold(value),
        min_hold=tier["min_hold"],
        max_hold=tier["max_hold"],
        tier_label=tier["label"],
    )


@router.get("/saved", response_model=list[ListingCard])
async def saved_listings(user: User = Depends(get_current_user)) -> list[ListingCard]:
    listings = await Listing.find({"_id": {"$in": user.saved_listing_ids}, "status": {"$ne": "removed"}}).to_list()
    owners = {u.id: u for u in await User.find({"_id": {"$in": [x.owner_id for x in listings]}}).to_list()}
    return [svc.card(x, owners[x.owner_id], svc.distance_from(x, user.home_lat, user.home_lng)) for x in listings]


@router.get("/{listing_id}", response_model=ListingDetail)
async def listing_detail(listing_id: PydanticObjectId, user: User | None = Depends(get_optional_user)) -> ListingDetail:
    x = await get_listing_or_404(listing_id)
    owner = await User.get(x.owner_id)
    if owner is None:
        raise HTTPException(404, "That listing isn't available.")
    owner_reviews = (
        await Review.find(Review.subject_id == owner.id, Review.subject_role == "lender")
        .sort(-Review.created_at)
        .limit(4)
        .to_list()
    )
    listing_reviews = (
        await Review.find(Review.listing_id == x.id, Review.subject_role == "lender").sort(-Review.created_at).limit(4).to_list()
    )
    lat, lng = (user.home_lat, user.home_lng) if user else (DEFAULT_ORIGIN["lat"], DEFAULT_ORIGIN["lng"])
    return ListingDetail(
        id=x.id,
        title=x.title,
        description=x.description,
        category=x.category,
        tags=x.tags,
        specs=[SpecOut(**s.model_dump()) for s in x.specs],
        condition=x.condition,
        condition_notes=x.condition_notes,
        estimated_value=x.estimated_value,
        prices=PricesOut(**x.prices.model_dump()),
        bundle=BundleOut(**x.bundle.model_dump()) if x.bundle else None,
        hold_amount=x.hold_amount,
        max_rental_days=x.max_rental_days,
        usage_guide=x.usage_guide,
        sanitized=x.sanitized,
        sanitized_note=x.sanitized_note,
        pickup=PickupOut(**x.pickup.model_dump()),
        requires_approval=x.requires_approval,
        photos=x.photos,
        status=x.status,
        rating_avg=x.rating_avg,
        rating_count=x.rating_count,
        rentals_count=x.rentals_count,
        owner=svc.owner_snippet(owner),
        owner_reviews=await svc.reviews_out(owner_reviews),
        listing_reviews=await svc.reviews_out(listing_reviews),
        booked=await svc.booked_ranges(x.id),
        distance_miles=round(svc.distance_from(x, lat, lng), 1),
        is_owner=bool(user and user.id == x.owner_id),
        saved=bool(user and x.id in user.saved_listing_ids),
        created_at=x.created_at,
    )


async def check_dates(x: Listing, start: date, end: date, with_bundle: bool) -> QuoteCheck:
    today = await clock.today()
    problems: list[str] = []
    days = (end - start).days
    if start < today:
        problems.append("Pick a start date from today on.")
    if days < 1:
        problems.append("The return date has to be after the pickup date.")
    elif days > x.max_rental_days:
        problems.append(f"The lender allows up to {x.max_rental_days} days for this item.")
    if days >= 1 and svc.overlaps(await svc.booked_ranges(x.id), start, end):
        problems.append("Someone already has it booked for part of those dates.")
    if with_bundle and not x.bundle:
        problems.append("This item doesn't have a bundle.")
    quote = build_quote(x, days, with_bundle) if days >= 1 else None
    warnings: list[str] = []
    if quote and quote.near_purchase_price:
        warnings.append(
            f"This rental costs {round(quote.value_ratio * 100)}% of the item's value (${x.estimated_value:,.0f}). "
            "If you'll need it again, buying might be cheaper."
        )
    return QuoteCheck(
        start=start,
        end=end,
        quote=QuoteOut(**quote.model_dump()) if quote else None,
        available=not problems,
        problems=problems,
        warnings=warnings,
    )


@router.get("/{listing_id}/quote", response_model=QuoteCheck)
async def quote(listing_id: PydanticObjectId, start: date, end: date, bundle: bool = False) -> QuoteCheck:
    return await check_dates(await get_listing_or_404(listing_id), start, end, bundle)


@router.post("/{listing_id}/save", response_model=OK)
async def save_listing(listing_id: PydanticObjectId, user: User = Depends(get_current_user)) -> OK:
    await get_listing_or_404(listing_id)
    if listing_id not in user.saved_listing_ids:
        user.saved_listing_ids.append(listing_id)
        await user.save()
    return OK(message="Saved")


@router.delete("/{listing_id}/save", response_model=OK)
async def unsave_listing(listing_id: PydanticObjectId, user: User = Depends(get_current_user)) -> OK:
    user.saved_listing_ids = [i for i in user.saved_listing_ids if i != listing_id]
    await user.save()
    return OK(message="Removed from saved")
