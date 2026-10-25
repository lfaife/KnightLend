from datetime import datetime
from typing import Literal

from beanie import Document, PydanticObjectId

ReportReason = Literal["no_show", "damaged_item", "unsafe_behavior", "scam", "misleading_listing", "other"]


class Report(Document):
    reporter_id: PydanticObjectId
    target_type: Literal["user", "listing"]
    target_id: PydanticObjectId
    reason: ReportReason
    details: str = ""
    status: Literal["open", "resolved", "dismissed"] = "open"
    resolution_note: str = ""
    resolved_by: PydanticObjectId | None = None
    created_at: datetime

    class Settings:
        name = "reports"
