from datetime import datetime

from beanie import Document, PydanticObjectId
from pydantic import Field


class Message(Document):
    rental_id: PydanticObjectId
    sender_id: PydanticObjectId | None = None  # None = system message
    body: str
    redacted: bool = False
    read_by: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime

    class Settings:
        name = "messages"
