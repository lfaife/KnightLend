import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.db import init_db, state
from app.models import User
from app.routers import auth, demo, listings, meta, rentals

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("knightlend")


async def startup() -> None:
    await init_db()
    if settings.seed_on_empty and await User.count() == 0:
        from app.seed.core import run_seed

        log.warning("Database is empty (%s mode), seeding demo data now.", state.mode)
        await run_seed()
    if not settings.demo_mode:
        log.info("DEMO_MODE is off: demo endpoints are disabled.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup()
    yield


def create_app(use_lifespan: bool = True) -> FastAPI:
    app = FastAPI(
        title="KnightLend API",
        version="1.0.0",
        description="Peer-to-peer rentals for the UCF community. Payments, verification and locations are simulated.",
        lifespan=lifespan if use_lifespan else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (meta.router, auth.router, listings.router, rentals.router, demo.router):
        app.include_router(router)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.seed_image_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    app.mount("/seed-images", StaticFiles(directory=settings.seed_image_dir), name="seed-images")
    return app


app = create_app()
