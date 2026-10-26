from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


class ConditionPhotoSet(Document):
    rental_id: PydanticObjectId
    phase: Literal["pickup", "return", "claim"]
    uploaded_by: PydanticObjectId
    uploader_role: Literal["borrower", "lender"]
    photos: list[str] = Field(default_factory=list)
    note: str = ""
    confirmed_by: PydanticObjectId | None = None
    confirmed_at: datetime | None = None
    created_at: datetime

    class Settings:
        name = "condition_photos"
