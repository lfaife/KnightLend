from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

HoldStatus = Literal["pending", "active", "released", "captured", "failed"]


class CardInfo(BaseModel):
    brand: str
    last4: str
    funding: Literal["credit", "debit"]
    exp_month: int
    exp_year: int


class HoldEvent(BaseModel):
    at: datetime
    event: str
    from_status: HoldStatus
    to_status: HoldStatus
    note: str = ""


class Hold(Document):
    rental_id: PydanticObjectId
    borrower_id: PydanticObjectId
    amount: float
    status: HoldStatus = "pending"
    card: CardInfo | None = None
    payment_method_token: str | None = None
    authorization_id: str | None = None
    placed_at: datetime | None = None
    expires_at: datetime | None = None
    refresh_count: int = 0
    reminder_sent_for: datetime | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    captured_amount: float = 0
    released_at: datetime | None = None
    captured_at: datetime | None = None
    history: list[HoldEvent] = Field(default_factory=list)
    created_at: datetime

    class Settings:
        name = "holds"
