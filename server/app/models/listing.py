from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

Category = Literal[
    "calculators_electronics",
    "art_supplies",
    "tools",
    "cameras_media",
    "household_appliances",
    "clothing_events",
]
Condition = Literal["new", "like_new", "good", "fair"]


class Spec(BaseModel):
    label: str
    value: str


class Prices(BaseModel):
    day: float
    week: float | None = None
    month: float | None = None
    semester: float | None = None


class Bundle(BaseModel):
    name: str
    includes: list[str]
    extra_per_day: float


class Pickup(BaseModel):
    area_name: str
    lat: float
    lng: float
    spot_id: str | None = None


class Listing(Document):
    owner_id: PydanticObjectId
    title: str
    description: str
    category: Category
    tags: list[str] = Field(default_factory=list)
    specs: list[Spec] = Field(default_factory=list)
    condition: Condition
    condition_notes: str = ""
    estimated_value: float
    prices: Prices
    bundle: Bundle | None = None
    hold_amount: float
    max_rental_days: int = 14
    usage_guide: list[str] = Field(default_factory=list)
    sanitized: bool = False
    sanitized_note: str | None = None
    pickup: Pickup
    requires_approval: bool = True
    photos: list[str] = Field(default_factory=list)
    status: Literal["active", "paused", "removed"] = "active"
    rating_avg: float = 0
    rating_count: int = 0
    rentals_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "listings"
