"""Virtual clock. Every time-based rule reads now() from here, never datetime.now().

The offset lives in the SystemClock document so it survives restarts (in MongoDB mode)
and can be moved forward from the demo bar.
"""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.models.clock import SystemClock

LOCAL_TZ = ZoneInfo(settings.timezone)


def real_utcnow() -> datetime:
    # Stored as naive UTC so values compare cleanly with what MongoDB returns.
    return datetime.now(UTC).replace(tzinfo=None)


async def get_clock() -> SystemClock:
    clock = await SystemClock.find_one(SystemClock.key == "global")
    if clock is None:
        clock = SystemClock(key="global", offset_seconds=0, updated_at=real_utcnow())
        await clock.insert()
    return clock


async def now() -> datetime:
    clock = await get_clock()
    return real_utcnow() + timedelta(seconds=clock.offset_seconds)


def local_date(dt: datetime) -> date:
    return dt.replace(tzinfo=UTC).astimezone(LOCAL_TZ).date()


async def today() -> date:
    return local_date(await now())


async def local_now() -> datetime:
    """Current virtual time in campus local time, naive."""
    return (await now()).replace(tzinfo=UTC).astimezone(LOCAL_TZ).replace(tzinfo=None)


async def advance(days: float) -> datetime:
    clock = await get_clock()
    clock.offset_seconds += days * 86400
    clock.updated_at = real_utcnow()
    await clock.save()
    return await now()


async def reset() -> None:
    clock = await get_clock()
    clock.offset_seconds = 0
    clock.updated_at = real_utcnow()
    await clock.save()
