from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from app.core import clock
from app.core.security import get_current_user
from app.models.listing import Listing
from app.models.report import Report, ReportReason
from app.models.user import User
from app.schemas.common import APIModel, IdStr
from app.services.notify import notify

router = APIRouter(prefix="/api/reports", tags=["reports"])

FLAG_AFTER_REPORTS = 2


class ReportIn(APIModel):
    target_type: str = Field(pattern="^(user|listing)$")
    target_id: IdStr
    reason: ReportReason
    details: str = Field(default="", max_length=800)


class ReportOut(APIModel):
    id: IdStr
    message: str


@router.post("", response_model=ReportOut, status_code=201)
async def file_report(body: ReportIn, user: User = Depends(get_current_user)) -> ReportOut:
    if body.target_type == "user":
        target_user = await User.get(body.target_id)
        if target_user is None:
            raise HTTPException(404, "Member not found.")
        if target_user.id == user.id:
            raise HTTPException(422, "You can't report yourself.")
    else:
        listing = await Listing.get(body.target_id)
        if listing is None:
            raise HTTPException(404, "Listing not found.")
        target_user = await User.get(listing.owner_id)
    report = Report(
        reporter_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
        details=body.details.strip(),
        created_at=await clock.now(),
    )
    await report.insert()
    if target_user:
        listing_ids = [x.id for x in await Listing.find(Listing.owner_id == target_user.id).to_list()]
        open_reports = await Report.find(
            {"status": "open", "$or": [{"target_id": target_user.id}, {"target_id": {"$in": listing_ids}}]}
        ).count()
        if open_reports >= FLAG_AFTER_REPORTS and not target_user.flagged:
            target_user.flagged, target_user.flag_reason = True, f"{open_reports} open reports"
            await target_user.save()
    for mod in await User.find(User.role == "moderator").to_list():
        await notify(mod.id, "report", "New report to review", body.reason.replace("_", " ").capitalize(), link="/moderation")
    return ReportOut(
        id=report.id, message="Thanks. A moderator will review this. We don't tell the other person who reported them."
    )
