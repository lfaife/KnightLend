import logging
from datetime import timedelta

from app.core import clock
from app.core.config import settings
from app.core.security import hash_password
from app.models import ALL_MODELS, Listing, SystemClock, User
from app.models.listing import Bundle, Pickup, Prices, Spec
from app.models.user import Verification
from app.seed.images import write_listing_images
from app.seed.listings import LISTINGS
from app.seed.scenario import Ctx, seed_scenarios
from app.seed.users import MODERATOR, USERS
from app.services.geo import AREAS, PICKUP_SPOTS
from app.services.pricing import hold_in_range
from app.services.ratings import recompute_listing, recompute_user

log = logging.getLogger("knightlend.seed")


def _place(place_id: str) -> dict:
    return next(p for p in [*PICKUP_SPOTS, *AREAS] if p["id"] == place_id)


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
        area = _place(spec["area"])
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


async def seed_listings(now, users: dict[str, User]) -> dict[str, Listing]:
    listings: dict[str, Listing] = {}
    for i, spec in enumerate(LISTINGS):
        if not hold_in_range(spec["value"], spec["hold"]):
            raise ValueError(f"Seed listing {spec['slug']} has a hold outside its value tier")
        place = _place(spec["pickup"])
        photos = write_listing_images(spec["slug"], spec["title"], spec["category"], spec["specs"])
        listing = Listing(
            owner_id=users[spec["owner"]].id,
            title=spec["title"],
            description=spec["description"],
            category=spec["category"],
            tags=spec["tags"],
            specs=[Spec(label=a, value=b) for a, b in spec["specs"]],
            condition=spec["condition"],
            condition_notes=spec.get("condition_notes", ""),
            estimated_value=spec["value"],
            prices=Prices(**spec["prices"]),
            bundle=Bundle(**spec["bundle"]) if spec.get("bundle") else None,
            hold_amount=spec["hold"],
            max_rental_days=spec["max_days"],
            usage_guide=spec["usage"],
            sanitized=spec["sanitized"],
            sanitized_note=spec.get("sanitized_note"),
            pickup=Pickup(area_name=place["name"], lat=place["lat"], lng=place["lng"],
                          spot_id=place["id"] if place in PICKUP_SPOTS else None),
            requires_approval=spec["approval"],
            photos=photos,
            created_at=now.replace(microsecond=0) - timedelta(days=90 - i),
            updated_at=now,
        )
        await listing.insert()
        listings[spec["slug"]] = listing
    return listings


async def run_seed() -> dict[str, int]:
    await wipe()
    now = await clock.now()
    today = await clock.today()
    users = await seed_users(now)
    listings = await seed_listings(now, users)
    rentals = await seed_scenarios(Ctx(now, today, users, listings))
    for u in users.values():
        await recompute_user(u.id)
    for listing in listings.values():
        await recompute_listing(listing.id)
    counts = {"users": len(users), "listings": len(listings), "rentals": rentals}
    log.warning("Seed complete: %s", counts)
    return counts
