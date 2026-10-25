"""Mock verification. No email is sent and no school records are checked."""

import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import EmailStr, Field

from app.core import clock
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.common import APIModel
from app.schemas.user import UserMe, user_me
from app.services.uploads import save_images

router = APIRouter(prefix="/api/verification", tags=["verification"])

UCF_DOMAINS = ("ucf.edu", "knights.ucf.edu")


class StudentStartIn(APIModel):
    ucf_email: EmailStr


class CodeIn(APIModel):
    code: str = Field(min_length=6, max_length=6)


class AlumniStartIn(APIModel):
    grad_year: int = Field(ge=1968)
    degree: str = Field(min_length=2, max_length=80)


class StartOut(APIModel):
    message: str
    simulated_code: str | None = None
    user: UserMe


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


@router.post("/student/start", response_model=StartOut)
async def student_start(body: StudentStartIn, user: User = Depends(get_current_user)) -> StartOut:
    if user.verified:
        raise HTTPException(409, "You're already verified.")
    domain = body.ucf_email.lower().split("@")[1]
    if domain not in UCF_DOMAINS:
        raise HTTPException(422, "Use your UCF email (ending in @ucf.edu or @knights.ucf.edu).")
    code = f"{secrets.randbelow(1_000_000):06d}"
    v = user.verification
    v.status, v.method, v.code_hash = "pending", "ucf_email", _hash(code)
    v.code_expires_at = await clock.now() + timedelta(minutes=30)
    await user.save()
    # The UCF email itself is not stored. In this demo the code is shown instead of emailed.
    return StartOut(
        message="We sent a 6-digit code to your UCF email. (Simulated: the code is shown below.)",
        simulated_code=code,
        user=user_me(user),
    )


@router.post("/student/confirm", response_model=UserMe)
async def student_confirm(body: CodeIn, user: User = Depends(get_current_user)) -> UserMe:
    v = user.verification
    if v.method != "ucf_email" or v.status != "pending" or not v.code_hash:
        raise HTTPException(409, "Start by entering your UCF email.")
    if v.code_expires_at and v.code_expires_at < await clock.now():
        raise HTTPException(410, "That code expired. Request a new one.")
    if not secrets.compare_digest(_hash(body.code), v.code_hash):
        raise HTTPException(422, "That code doesn't match. Check it and try again.")
    v.status, v.code_hash, v.verified_at = "verified", None, await clock.now()
    user.affiliation = "student"
    await user.save()
    return user_me(user)


@router.post("/alumni/start", response_model=StartOut)
async def alumni_start(body: AlumniStartIn, user: User = Depends(get_current_user)) -> StartOut:
    if user.verified:
        raise HTTPException(409, "You're already verified.")
    if body.grad_year > (await clock.today()).year:
        raise HTTPException(422, "Alumni verification is for people who have graduated. Students verify with a UCF email.")
    v = user.verification
    v.status, v.method, v.grad_year, v.degree = "pending", "alumni", body.grad_year, body.degree.strip()
    user.grad_year = body.grad_year
    await user.save()
    return StartOut(
        message="Graduation year recorded. Step 2: upload a photo of your diploma or alumni card for a quick check.",
        user=user_me(user),
    )


@router.post("/alumni/proof", response_model=UserMe)
async def alumni_proof(file: UploadFile = File(...), user: User = Depends(get_current_user)) -> UserMe:
    v = user.verification
    if v.method != "alumni" or v.status != "pending":
        raise HTTPException(409, "Enter your graduation year first.")
    v.proof_url = (await save_images([file], f"verification/{user.id}"))[0]
    # Simulated review: approved right away.
    v.status, v.verified_at = "verified", await clock.now()
    user.affiliation = "alumni"
    await user.save()
    return user_me(user)
