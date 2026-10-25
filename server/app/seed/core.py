import logging

from app.core import clock
from app.core.config import settings
from app.core.security import hash_password
from app.models import ALL_MODELS, SystemClock, User
from app.models.user import Verification
from app.seed.users import MODERATOR, USERS
from app.services.geo import AREAS

log = logging.getLogger("knightlend.seed")


def _area(area_id: str) -> dict:
    return next(a for a in AREAS if a["id"] == area_id)


async def wipe() -> None:
    for model in ALL_MODELS:
        if model is SystemClock:
            continue
        await model.get_motor_collection().delete_many({})
    await clock.reset()


async def seed_users(now) -> dict[str, User]:
    pw = hash_password(settings.demo_password)  # hashed once, shared by every demo account
    users: dict[str, User] = {}
    for spec in [*USERS, MODERATOR]:
        area = _area(spec["area"])
        user = User(
            email=spec["email"],
            password_hash=pw,
            name=spec["name"],
            affiliation=spec["affiliation"],
            role="moderator" if spec["key"] == "mod" else "member",
            major=spec["major"],
            grad_year=spec["grad_year"],
            bio=spec["bio"],
            home_area=area["name"],
            home_area_kind=area["kind"],
            home_lat=area["lat"],
            home_lng=area["lng"],
            verification=Verification(
                status="verified" if spec["verified"] else "unverified",
                method=("ucf_email" if spec["affiliation"] == "student" else "alumni") if spec["verified"] else None,
                grad_year=spec["grad_year"] if spec["affiliation"] == "alumni" else None,
                verified_at=now if spec["verified"] else None,
            ),
            created_at=now,
        )
        await user.insert()
        users[spec["key"]] = user
    return users


async def run_seed() -> dict[str, int]:
    await wipe()
    now = await clock.now()
    users = await seed_users(now)
    counts = {"users": len(users)}
    log.warning("Seed complete: %s", counts)
    return counts
