from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from app.core.security import require_moderator
from app.models.listing import Listing
from app.models.rental import Rental
from app.models.report import Report
from app.models.review import Review
from app.models.user import User
from app.schemas.common import OK, APIModel, IdStr
from app.schemas.user import UserPublic, user_public
from app.services.notify import notify

router = APIRouter(prefix="/api/moderation", tags=["moderation"], dependencies=[Depends(require_moderator)])


class FlaggedUser(APIModel):
    user: UserPublic
    flag_reason: str | None
    restricted: bool
    restricted_reason: str | None
    low_reviews: list[str]
    open_reports: int


class ReportRow(APIModel):
    id: IdStr
    reporter_name: str
    target_type: str
    target_id: IdStr
    target_label: str
    reason: str
    details: str
    created_at: datetime


class DisputeRow(APIModel):
    rental_id: IdStr
    listing_title: str
    borrower_name: str
    lender_name: str
    claim_type: str
    amount: float
    filed_at: datetime


class Overview(APIModel):
    flagged: list[FlaggedUser]
    reports: list[ReportRow]
    disputes: list[DisputeRow]


class RestrictIn(APIModel):
    reason: str = Field(min_length=5, max_length=300)


class ResolveReportIn(APIModel):
    status: str = Field(pattern="^(resolved|dismissed)$")
    note: str = Field(default="", max_length=300)


@router.get("/overview", response_model=Overview)
async def overview() -> Overview:
    users = {u.id: u for u in await User.find_all().to_list()}
    listings = {x.id: x for x in await Listing.find_all().to_list()}
    reports = await Report.find(Report.status == "open").sort(-Report.created_at).to_list()

    def owner_of(r: Report):
        return r.target_id if r.target_type == "user" else (listings[r.target_id].owner_id if r.target_id in listings else None)

    flagged = []
    for u in users.values():
        if not (u.flagged or u.restricted):
            continue
        low = await Review.find(Review.subject_id == u.id, Review.rating <= 2).sort(-Review.created_at).limit(3).to_list()
        flagged.append(
            FlaggedUser(
                user=user_public(u),
                flag_reason=u.flag_reason,
                restricted=u.restricted,
                restricted_reason=u.restricted_reason,
                low_reviews=[f"{r.rating}★ {r.text}" for r in low],
                open_reports=sum(1 for r in reports if owner_of(r) == u.id),
            )
        )
    rows = []
    for r in reports:
        if r.target_type == "user":
            label = users[r.target_id].name if r.target_id in users else "Former member"
        else:
            label = listings[r.target_id].title if r.target_id in listings else "Removed listing"
        rows.append(
            ReportRow(
                id=r.id,
                reporter_name=users[r.reporter_id].name if r.reporter_id in users else "Member",
                target_type=r.target_type,
                target_id=r.target_id,
                target_label=label,
                reason=r.reason,
                details=r.details,
                created_at=r.created_at,
            )
        )
    disputes = []
    for r in await Rental.find(Rental.status == "claim_open").to_list():
        if r.claim and r.claim.status == "under_review":
            disputes.append(
                DisputeRow(
                    rental_id=r.id,
                    listing_title=listings[r.listing_id].title,
                    borrower_name=users[r.borrower_id].name,
                    lender_name=users[r.lender_id].name,
                    claim_type=r.claim.type,
                    amount=r.claim.amount,
                    filed_at=r.claim.filed_at,
                )
            )
    return Overview(flagged=flagged, reports=rows, disputes=disputes)


@router.post("/users/{user_id}/restrict", response_model=OK)
async def restrict(user_id: PydanticObjectId, body: RestrictIn, mod: User = Depends(require_moderator)) -> OK:
    u = await User.get(user_id)
    if u is None:
        raise HTTPException(404, "Member not found.")
    if u.role == "moderator":
        raise HTTPException(409, "Moderators can't be restricted here.")
    u.restricted, u.restricted_reason = True, body.reason.strip()
    await u.save()
    await notify(
        u.id,
        "restricted",
        "Your account is restricted",
        f"You can't list or request items for now. Reason: {u.restricted_reason}",
        link="/profile",
    )
    return OK(message=f"{u.name} is restricted")


@router.post("/users/{user_id}/unrestrict", response_model=OK)
async def unrestrict(user_id: PydanticObjectId) -> OK:
    u = await User.get(user_id)
    if u is None:
        raise HTTPException(404, "Member not found.")
    u.restricted, u.restricted_reason = False, None
    u.flagged, u.flag_reason = False, None
    await u.save()
    await notify(
        u.id, "unrestricted", "Your account is back in good standing", "You can list and request items again.", link="/profile"
    )
    return OK(message=f"{u.name} can list and request again")


@router.post("/users/{user_id}/clear-flag", response_model=OK)
async def clear_flag(user_id: PydanticObjectId) -> OK:
    u = await User.get(user_id)
    if u is None:
        raise HTTPException(404, "Member not found.")
    u.flagged, u.flag_reason = False, None
    await u.save()
    return OK(message="Flag cleared")


@router.post("/reports/{report_id}/resolve", response_model=OK)
async def resolve_report(report_id: PydanticObjectId, body: ResolveReportIn, mod: User = Depends(require_moderator)) -> OK:
    r = await Report.get(report_id)
    if r is None:
        raise HTTPException(404, "Report not found.")
    if r.status != "open":
        raise HTTPException(409, "This report is already closed.")
    r.status, r.resolution_note, r.resolved_by = body.status, body.note.strip(), mod.id
    await r.save()
    return OK(message=f"Report {body.status}")
