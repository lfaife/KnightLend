from datetime import datetime
from typing import Literal

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field

Affiliation = Literal["student", "alumni"]
Role = Literal["member", "moderator"]
HomeKind = Literal["on_campus", "apartment", "commuter"]


class Verification(BaseModel):
    status: Literal["unverified", "pending", "verified"] = "unverified"
    method: Literal["ucf_email", "alumni"] | None = None
    code_hash: str | None = None
    code_expires_at: datetime | None = None
    grad_year: int | None = None
    degree: str | None = None
    proof_url: str | None = None
    verified_at: datetime | None = None


class User(Document):
    email: Indexed(str, unique=True)  # login only, never shown in the UI
    password_hash: str
    name: str
    affiliation: Affiliation
    role: Role = "member"
    major: str | None = None
    grad_year: int | None = None
    bio: str = ""
    avatar_url: str | None = None
    home_area: str = "On campus"
    home_area_kind: HomeKind = "on_campus"
    home_lat: float = 28.6024
    home_lng: float = -81.2001
    verification: Verification = Field(default_factory=Verification)
    rating_avg: float = 0
    rating_count: int = 0
    rentals_count: int = 0
    lent_count: int = 0
    borrowed_count: int = 0
    flagged: bool = False
    flag_reason: str | None = None
    restricted: bool = False
    restricted_reason: str | None = None
    saved_listing_ids: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime

    @property
    def verified(self) -> bool:
        return self.verification.status == "verified"

    class Settings:
        name = "users"
