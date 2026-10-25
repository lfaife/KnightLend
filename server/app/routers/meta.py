from fastapi import APIRouter

from app.core import clock
from app.core.config import settings
from app.core.db import state
from app.schemas.common import APIModel

router = APIRouter(prefix="/api", tags=["meta"])


class Health(APIModel):
    status: str
    database: str
    demo_mode: bool
    now: str


@router.get("/health", response_model=Health)
async def health() -> Health:
    return Health(status="ok", database=state.mode, demo_mode=settings.demo_mode, now=(await clock.now()).isoformat())
