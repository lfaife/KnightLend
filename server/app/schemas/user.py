from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.common import APIModel, IdStr


class UserPublic(APIModel):
    """What other people can see. Never includes email or contact details."""

    id: IdStr
    name: str
    affiliation: Literal["student", "alumni"]
    role: Literal["member", "moderator"]
    verified: bool
    major: str | None = None
    grad_year: int | None = None
    bio: str = ""
    avatar_url: str | None = None
    home_area: str
    home_area_kind: str
    rating_avg: float
    rating_count: int
    rentals_count: int
    lent_count: int
    borrowed_count: int
    restricted: bool
    created_at: datetime


class UserMe(UserPublic):
    verification_status: Literal["unverified", "pending", "verified"]
    verification_method: Literal["ucf_email", "alumni"] | None = None
    restricted_reason: str | None = None
    flagged: bool
    saved_listing_ids: list[IdStr]


class RegisterIn(APIModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    affiliation: Literal["student", "alumni"]
    major: str | None = Field(default=None, max_length=60)
    grad_year: int | None = Field(default=None, ge=1968, le=2035)


class LoginIn(APIModel):
    # Plain string: demo accounts use the reserved .test domain, which strict validation rejects.
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(APIModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserMe


class ProfileUpdateIn(APIModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    bio: str | None = Field(default=None, max_length=400)
    major: str | None = Field(default=None, max_length=60)
    home_area: str | None = Field(default=None, max_length=80)
    home_area_kind: Literal["on_campus", "apartment", "commuter"] | None = None


def user_public(u) -> UserPublic:
    return UserPublic(
        id=u.id,
        name=u.name,
        affiliation=u.affiliation,
        role=u.role,
        verified=u.verified,
        major=u.major,
        grad_year=u.grad_year,
        bio=u.bio,
        avatar_url=u.avatar_url,
        home_area=u.home_area,
        home_area_kind=u.home_area_kind,
        rating_avg=round(u.rating_avg, 2),
        rating_count=u.rating_count,
        rentals_count=u.rentals_count,
        lent_count=u.lent_count,
        borrowed_count=u.borrowed_count,
        restricted=u.restricted,
        created_at=u.created_at,
    )


def user_me(u) -> UserMe:
    return UserMe(
        **user_public(u).model_dump(),
        verification_status=u.verification.status,
        verification_method=u.verification.method,
        restricted_reason=u.restricted_reason,
        flagged=u.flagged,
        saved_listing_ids=u.saved_listing_ids,
    )
