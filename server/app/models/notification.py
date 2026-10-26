from datetime import datetime

from beanie import Document, PydanticObjectId


class Notification(Document):
    user_id: PydanticObjectId
    kind: str
    title: str
    body: str = ""
    rental_id: PydanticObjectId | None = None
    link: str | None = None
    read: bool = False
    created_at: datetime

    class Settings:
        name = "notifications"
