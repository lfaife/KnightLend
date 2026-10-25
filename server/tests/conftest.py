"""Test setup: in-memory mongomock database, demo mode on, scheduler off, uploads in a temp dir."""

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="knightlend-tests-")
os.environ.update(
    {
        "DB_MODE": "mock",
        "DEMO_MODE": "true",
        "SCHEDULER_ENABLED": "false",
        "SEED_ON_EMPTY": "false",
        "JWT_SECRET": "test-secret-not-for-production",
        "UPLOAD_DIR": os.path.join(_tmp, "uploads"),
        "SEED_IMAGE_DIR": os.path.join(_tmp, "seed_images"),
    }
)

import base64  # noqa: E402

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core.db import init_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.seed.core import run_seed  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
PASSWORD = "knightlend-demo"
VISA = {"number": "4242424242424242", "exp_month": 8, "exp_year": 29, "cvc": "123", "name": "Test Knight"}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def app():
    await init_db("mock")
    return create_app(use_lifespan=False)


@pytest_asyncio.fixture(loop_scope="session")
async def client(app):
    await run_seed()  # fresh, known data for every test
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def login(client: httpx.AsyncClient, who: str) -> dict:
    r = await client.post("/api/auth/login", json={"email": f"{who}@demo.knightlend.test", "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def today(client: httpx.AsyncClient):
    from datetime import date

    return date.fromisoformat((await client.get("/api/health")).json()["today"])


async def find_rental(client, headers, title_part: str, scope: str = "active") -> dict:
    rentals = (await client.get("/api/rentals", headers=headers, params={"scope": scope})).json()
    return next(r for r in rentals if title_part in r["listing"]["title"])


def png(name: str = "photo.png"):
    return ("files", (name, PNG, "image/png"))
