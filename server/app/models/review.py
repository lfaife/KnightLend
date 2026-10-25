from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId


class Review(Document):
    rental_id: PydanticObjectId
    listing_id: PydanticObjectId
    author_id: PydanticObjectId
    subject_id: PydanticObjectId
    subject_role: Literal["lender", "borrower"]
    rating: int
    text: str
    created_at: datetime

    class Settings:
        name = "reviews"
