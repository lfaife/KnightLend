from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator

from app.models.rental import ClaimType, RentalStatus, TimeOfDay
from app.schemas.common import APIModel, IdStr
from app.schemas.listing import QuoteOut
from app.schemas.user import UserPublic

HoldStatus = Literal["pending", "active", "released", "captured", "failed"]


class RentalCreateIn(APIModel):
    listing_id: IdStr
    start_date: date
    end_date: date
    with_bundle: bool = False
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def _dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("The return date has to be after the pickup date.")
        return self


class ListingMini(APIModel):
    id: IdStr
    title: str
    photo: str | None
    category: str
    pickup_area: str
    estimated_value: float


class HoldEventOut(APIModel):
    at: datetime
    event: str
    from_status: HoldStatus
    to_status: HoldStatus
    note: str


class CardOut(APIModel):
    brand: str
    last4: str
    funding: Literal["credit", "debit"]


class HoldOut(APIModel):
    id: IdStr
    amount: float
    status: HoldStatus
    card: CardOut | None = None  # only shown to the borrower
    placed_at: datetime | None = None
    expires_at: datetime | None = None
    refresh_count: int
    next_refresh_at: datetime | None = None
    failure_message: str | None = None
    captured_amount: float
    released_amount: float
    released_at: datetime | None = None
    captured_at: datetime | None = None
    history: list[HoldEventOut]


class AgreementOut(APIModel):
    version: str
    terms: list[str]
    borrower_accepted_at: datetime | None
    lender_accepted_at: datetime | None


class MeetupOut(APIModel):
    spot_id: str
    spot_name: str
    lat: float
    lng: float
    date: str
    time_of_day: TimeOfDay
    accessibility_note: str
    notes: str
    set_by: IdStr
    set_at: datetime


class PaymentOut(APIModel):
    charged_amount: float
    charged_at: datetime
    refunded_amount: float
    claim_charged_amount: float


class ClaimOut(APIModel):
    type: ClaimType
    amount: float
    description: str
    photo_set_id: IdStr | None
    filed_at: datetime
    status: Literal["open", "under_review", "resolved"]
    borrower_response: Literal["accept", "dispute"] | None
    borrower_message: str
    responded_at: datetime | None
    decision: Literal["release", "capture"] | None
    decision_amount: float
    explanation: str
    resolved_at: datetime | None


class PhotoSetOut(APIModel):
    id: IdStr
    phase: Literal["pickup", "return", "claim"]
    uploaded_by: IdStr
    uploader_role: Literal["borrower", "lender"]
    uploader_name: str
    photos: list[str]
    note: str
    confirmed_by: IdStr | None
    confirmed_at: datetime | None
    created_at: datetime


class TimelineOut(APIModel):
    at: datetime
    kind: str
    text: str


class RentalSummary(APIModel):
    id: IdStr
    status: RentalStatus
    status_label: str
    my_role: Literal["borrower", "lender", "moderator"]
    listing: ListingMini
    other_party: UserPublic
    start_date: str
    end_date: str
    days: int
    total: float
    lender_earnings: float
    hold_amount: float
    hold_status: HoldStatus | None
    hold_expires_at: datetime | None
    late: bool
    late_days: int
    needs_action: bool
    next_step: str
    unread_messages: int
    created_at: datetime
    updated_at: datetime


class RentalDetail(APIModel):
    id: IdStr
    status: RentalStatus
    status_label: str
    my_role: Literal["borrower", "lender", "moderator"]
    listing: ListingMini
    borrower: UserPublic
    lender: UserPublic
    start_date: str
    end_date: str
    with_bundle: bool
    bundle_name: str | None
    quote: QuoteOut
    lender_earnings: float
    request_note: str
    decision_note: str
    agreement: AgreementOut
    hold: HoldOut | None
    payment: PaymentOut | None
    meetup: MeetupOut | None
    picked_up_at: datetime | None
    returned_at: datetime | None
    return_checklist: list[str]
    late: bool
    late_days: int
    claim: ClaimOut | None
    photo_sets: list[PhotoSetOut]
    timeline: list[TimelineOut]
    actions: list[str]
    next_step: str
    can_review: bool
    my_review_done: bool
    cancellation_refund_preview: float | None
    created_at: datetime
    updated_at: datetime


class DecisionIn(APIModel):
    note: str = Field(default="", max_length=300)
    accept_agreement: bool = False


class CardIn(APIModel):
    number: str = Field(min_length=12, max_length=23)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=24, le=2099)
    cvc: str = Field(min_length=3, max_length=4)
    name: str = Field(min_length=2, max_length=60)


class MeetupIn(APIModel):
    spot_id: str
    date: date
    time_of_day: TimeOfDay
    notes: str = Field(default="", max_length=300)


class ReturnIn(APIModel):
    checklist: list[str] = Field(min_length=1, max_length=10)


class ClaimIn(APIModel):
    type: ClaimType
    amount: float = Field(gt=0)
    description: str = Field(min_length=10, max_length=800)


class ClaimResponseIn(APIModel):
    response: Literal["accept", "dispute"]
    message: str = Field(default="", max_length=800)


class ClaimResolveIn(APIModel):
    decision: Literal["release", "capture"]
    amount: float = Field(default=0, ge=0)
    explanation: str = Field(min_length=10, max_length=800)


class ReviewIn(APIModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(min_length=5, max_length=800)


class MessageIn(APIModel):
    body: str = Field(min_length=1, max_length=1000)


class MessageOut(APIModel):
    id: IdStr
    rental_id: IdStr
    sender_id: IdStr | None
    sender_name: str
    mine: bool
    body: str
    redacted: bool
    created_at: datetime


class Conversation(APIModel):
    rental_id: IdStr
    listing_title: str
    listing_photo: str | None
    other_party: UserPublic
    status: RentalStatus
    status_label: str
    last_message: str | None
    last_at: datetime | None
    unread: int
