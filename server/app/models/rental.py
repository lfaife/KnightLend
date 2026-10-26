from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

RentalStatus = Literal[
    "requested",  # waiting for the lender
    "approved",  # agreement + protection hold still needed
    "rejected",
    "cancelled",
    "confirmed",  # hold active and rental paid, waiting for pickup
    "in_progress",  # borrower has the item
    "return_pending",  # borrower returned it, lender is checking
    "claim_open",  # lender filed a claim
    "completed",
]
ClaimType = Literal["damage", "late", "not_returned"]
TimeOfDay = Literal["morning", "afternoon", "evening"]


class QuoteLine(BaseModel):
    label: str
    quantity: int
    unit_price: float
    amount: float


class Quote(BaseModel):
    days: int
    lines: list[QuoteLine]
    rental_fee: float
    bundle_fee: float
    service_fee: float
    total: float
    hold_amount: float
    estimated_value: float
    value_ratio: float
    near_purchase_price: bool


class Agreement(BaseModel):
    version: str
    terms: list[str]
    borrower_accepted_at: datetime | None = None
    lender_accepted_at: datetime | None = None


class Meetup(BaseModel):
    spot_id: str
    spot_name: str
    lat: float
    lng: float
    date: str
    time_of_day: TimeOfDay
    accessibility_note: str = ""
    notes: str = ""
    set_by: PydanticObjectId
    set_at: datetime


class Payment(BaseModel):
    charge_id: str
    charged_amount: float
    charged_at: datetime
    refunded_amount: float = 0
    claim_charge_id: str | None = None
    claim_charged_amount: float = 0


class Claim(BaseModel):
    type: ClaimType
    amount: float
    description: str
    photo_set_id: PydanticObjectId | None = None
    filed_at: datetime
    status: Literal["open", "under_review", "resolved"] = "open"
    borrower_response: Literal["accept", "dispute"] | None = None
    borrower_message: str = ""
    responded_at: datetime | None = None
    decision: Literal["release", "capture"] | None = None
    decision_amount: float = 0
    explanation: str = ""
    resolved_at: datetime | None = None
    resolved_by: PydanticObjectId | None = None


class TimelineEvent(BaseModel):
    at: datetime
    kind: str
    text: str


class Rental(Document):
    listing_id: PydanticObjectId
    borrower_id: PydanticObjectId
    lender_id: PydanticObjectId
    start_date: str  # ISO date, local time
    end_date: str  # return due date
    with_bundle: bool = False
    quote: Quote
    request_note: str = ""
    status: RentalStatus = "requested"
    decision_note: str = ""
    agreement: Agreement
    hold_id: PydanticObjectId | None = None
    payment: Payment | None = None
    meetup: Meetup | None = None
    picked_up_at: datetime | None = None
    returned_at: datetime | None = None
    return_checklist: list[str] = Field(default_factory=list)
    late: bool = False
    late_days: int = 0
    claim: Claim | None = None
    borrower_reviewed: bool = False
    lender_reviewed: bool = False
    timeline: list[TimelineEvent] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "rentals"
