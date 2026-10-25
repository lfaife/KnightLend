from datetime import datetime

from beanie import Document


class SystemClock(Document):
    key: str = "global"
    offset_seconds: float = 0
    updated_at: datetime

    class Settings:
        name = "system_clock"
