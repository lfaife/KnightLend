from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.models.listing import Category, Condition
from app.schemas.common import APIModel, IdStr


class OwnerSnippet(APIModel):
    id: IdStr
    name: str
    affiliation: Literal["student", "alumni"]
    verified: bool
    rating_avg: float
    rating_count: int
    rentals_count: int
    lent_count: int
    avatar_url: str | None = None


class PricesOut(APIModel):
    day: float
    week: float | None = None
    month: float | None = None
    semester: float | None = None


class BundleOut(APIModel):
    name: str
    includes: list[str]
    extra_per_day: float


class PickupOut(APIModel):
    area_name: str
    lat: float
    lng: float
    spot_id: str | None = None


class SpecOut(APIModel):
    label: str
    value: str


class ListingCard(APIModel):
    id: IdStr
    title: str
    category: Category
    photo: str | None
    prices: PricesOut
    condition: Condition
    hold_amount: float
    distance_miles: float
    pickup: PickupOut
    sanitized: bool
    requires_approval: bool
    rating_avg: float
    rating_count: int
    owner: OwnerSnippet
    tags: list[str]


class ListingPage(APIModel):
    items: list[ListingCard]
    total: int
    page: int
    page_size: int
    pages: int
    origin_label: str


class ReviewOut(APIModel):
    id: IdStr
    rating: int
    text: str
    author_name: str
    author_id: IdStr
    subject_role: Literal["lender", "borrower"]
    listing_title: str | None = None
    created_at: datetime


class BookedRange(APIModel):
    start: str
    end: str


class ListingDetail(APIModel):
    id: IdStr
    title: str
    description: str
    category: Category
    tags: list[str]
    specs: list[SpecOut]
    condition: Condition
    condition_notes: str
    estimated_value: float
    prices: PricesOut
    bundle: BundleOut | None
    hold_amount: float
    max_rental_days: int
    usage_guide: list[str]
    sanitized: bool
    sanitized_note: str | None
    pickup: PickupOut
    requires_approval: bool
    photos: list[str]
    status: str
    rating_avg: float
    rating_count: int
    rentals_count: int
    owner: OwnerSnippet
    owner_reviews: list[ReviewOut]
    listing_reviews: list[ReviewOut]
    booked: list[BookedRange]
    distance_miles: float
    is_owner: bool
    saved: bool
    created_at: datetime


class QuoteLineOut(APIModel):
    label: str
    quantity: int
    unit_price: float
    amount: float


class QuoteOut(APIModel):
    days: int
    lines: list[QuoteLineOut]
    rental_fee: float
    bundle_fee: float
    service_fee: float
    total: float
    hold_amount: float
    estimated_value: float
    value_ratio: float
    near_purchase_price: bool


class QuoteCheck(APIModel):
    start: date
    end: date
    quote: QuoteOut | None
    available: bool
    problems: list[str]
    warnings: list[str]


class ListingIn(APIModel):
    title: str = Field(min_length=4, max_length=90)
    description: str = Field(min_length=10, max_length=1000)
    category: Category
    tags: list[str] = Field(default_factory=list, max_length=8)
    specs: list[SpecOut] = Field(default_factory=list, max_length=12)
    condition: Condition
    condition_notes: str = Field(default="", max_length=300)
    estimated_value: float = Field(gt=0, le=10000)
    prices: PricesOut
    bundle: BundleOut | None = None
    hold_amount: float = Field(gt=0)
    max_rental_days: int = Field(ge=1, le=120)
    usage_guide: list[str] = Field(default_factory=list, max_length=10)
    sanitized: bool = False
    sanitized_note: str | None = Field(default=None, max_length=200)
    pickup_spot_id: str
    requires_approval: bool = True
    photos: list[str] = Field(default_factory=list, max_length=8)
    status: Literal["active", "paused"] = "active"

    @field_validator("prices")
    @classmethod
    def _prices(cls, v: PricesOut) -> PricesOut:
        for name in ("day", "week", "month", "semester"):
            p = getattr(v, name)
            if p is not None and not (0 < p <= 2000):
                raise ValueError(f"{name} price must be between $0 and $2,000")
        return v

    @field_validator("photos")
    @classmethod
    def _photos(cls, v: list[str]) -> list[str]:
        for url in v:
            if not (url.startswith("/uploads/") or url.startswith("/seed-images/")):
                raise ValueError("Photos must be uploaded through KnightLend")
        return v


class HoldSuggestion(APIModel):
    estimated_value: float
    suggested: float
    min_hold: float
    max_hold: float
    tier_label: str


class MyListing(APIModel):
    card: ListingCard
    status: str
    open_rentals: int
    rentals_count: int


class PhotoUploadOut(APIModel):
    urls: list[str]
