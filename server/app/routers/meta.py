from fastapi import APIRouter

from app.core import clock
from app.core.config import settings
from app.core.db import state
from app.schemas.common import APIModel
from app.services import policies
from app.services.geo import AREAS, CAMPUS_CENTER, PICKUP_SPOTS
from app.services.payments import TEST_CARDS
from app.services.pricing import HOLD_TIERS, SERVICE_FEE

router = APIRouter(prefix="/api", tags=["meta"])


class Health(APIModel):
    status: str
    database: str
    demo_mode: bool
    now: str
    today: str


class Option(APIModel):
    id: str
    label: str


class Shortcut(APIModel):
    id: str
    label: str
    hint: str
    category: str | None = None
    tag: str | None = None


class Place(APIModel):
    id: str
    name: str
    lat: float
    lng: float
    accessibility: str | None = None
    hours: str | None = None
    kind: str | None = None


class HoldTier(APIModel):
    label: str
    min_value: float
    max_value: float | None
    min_hold: float
    max_hold: float


class TestCardOut(APIModel):
    number: str
    brand: str
    funding: str
    description: str


class Meta(APIModel):
    categories: list[Option]
    conditions: list[Option]
    shortcuts: list[Shortcut]
    pickup_spots: list[Place]
    areas: list[Place]
    campus_center: tuple[float, float]
    hold_tiers: list[HoldTier]
    cancellation_rules: list[str]
    times_of_day: list[Option]
    return_checklist: list[str]
    service_fee: float
    test_cards: list[TestCardOut]


@router.get("/health", response_model=Health)
async def health() -> Health:
    return Health(
        status="ok",
        database=state.mode,
        demo_mode=settings.demo_mode,
        now=(await clock.now()).isoformat(),
        today=(await clock.today()).isoformat(),
    )


@router.get("/meta", response_model=Meta)
async def meta() -> Meta:
    """Reference data for forms and filters. Test card numbers are public on purpose: payments are simulated."""
    return Meta(
        categories=[Option(**c) for c in policies.CATEGORIES],
        conditions=[Option(**c) for c in policies.CONDITIONS],
        shortcuts=[Shortcut(**s) for s in policies.SHORTCUTS],
        pickup_spots=[Place(**p) for p in PICKUP_SPOTS],
        areas=[Place(**a) for a in AREAS],
        campus_center=CAMPUS_CENTER,
        hold_tiers=[HoldTier(**t) for t in HOLD_TIERS],
        cancellation_rules=policies.CANCELLATION_RULES,
        times_of_day=[Option(**t) for t in policies.TIMES_OF_DAY],
        return_checklist=policies.RETURN_CHECKLIST,
        service_fee=SERVICE_FEE,
        test_cards=[
            TestCardOut(number=c.number, brand=c.brand, funding=c.funding, description=c.description) for c in TEST_CARDS
        ],
    )
