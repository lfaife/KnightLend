"""Demo-only controls. The router answers 404 unless DEMO_MODE=true."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from app.core import clock
from app.core.security import create_token, require_demo_mode
from app.models.user import User
from app.schemas.common import APIModel, IdStr
from app.schemas.user import TokenOut, user_me
from app.seed.users import DEMO_ACCOUNTS
from app.services.jobs import JobReport, run_jobs

router = APIRouter(prefix="/api/demo", tags=["demo"], dependencies=[Depends(require_demo_mode)])


class DemoUser(APIModel):
    id: IdStr
    label: str
    name: str
    role: str
    affiliation: str


class LoginAsIn(APIModel):
    user_id: IdStr


@router.get("/users", response_model=list[DemoUser])
async def demo_users() -> list[DemoUser]:
    out = []
    for email, label in DEMO_ACCOUNTS.items():
        u = await User.find_one(User.email == email)
        if u:
            out.append(DemoUser(id=u.id, label=label, name=u.name, role=u.role, affiliation=u.affiliation))
    return out


@router.post("/login-as", response_model=TokenOut)
async def login_as(body: LoginAsIn) -> TokenOut:
    user = await User.get(body.user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return TokenOut(access_token=create_token(user.id), user=user_me(user))


class AdvanceIn(APIModel):
    days: float = Field(gt=0, le=60)


class ClockOut(APIModel):
    now: str
    today: str
    offset_days: float
    jobs: JobReport | None = None


async def _clock_out(jobs: JobReport | None = None) -> ClockOut:
    c = await clock.get_clock()
    return ClockOut(
        now=(await clock.now()).isoformat(),
        today=(await clock.today()).isoformat(),
        offset_days=round(c.offset_seconds / 86400, 2),
        jobs=jobs,
    )


@router.get("/clock", response_model=ClockOut)
async def get_clock() -> ClockOut:
    return await _clock_out()


@router.post("/advance-time", response_model=ClockOut)
async def advance_time(body: AdvanceIn) -> ClockOut:
    """Move the virtual clock forward one day at a time, running jobs after each day,
    so reminders arrive before refreshes just as they would in real time."""
    total = JobReport()
    remaining = body.days
    while remaining > 0:
        step = min(1.0, remaining)
        await clock.advance(step)
        report = await run_jobs()
        for k, v in report.model_dump().items():
            setattr(total, k, getattr(total, k) + v)
        remaining -= step
    return await _clock_out(total)


@router.post("/run-jobs", response_model=ClockOut)
async def run_jobs_now() -> ClockOut:
    return await _clock_out(await run_jobs())


@router.post("/reset", response_model=ClockOut)
async def reset_demo() -> ClockOut:
    """Wipe and re-seed all demo data and reset the clock."""
    from app.seed.core import run_seed

    await run_seed()
    return await _clock_out()
