import logging

from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import ALL_MODELS

log = logging.getLogger("knightlend.db")


class DBState:
    mode: str = "not connected"
    client = None


state = DBState()


def _banner(lines: list[str]) -> None:
    bar = "=" * 72
    log.warning("\n%s\n%s\n%s", bar, "\n".join(f"  {line}" for line in lines), bar)


async def init_db(mode: str | None = None) -> str:
    """Connect to MongoDB, or fall back to an in-memory mongomock database."""
    mode = mode or settings.db_mode
    client = None
    database = None
    if mode in ("auto", "mongo"):
        try:
            client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=1500)
            await client.admin.command("ping")
            database = client.get_default_database(default=settings.db_name)
            state.mode = "mongodb"
        except Exception as exc:  # noqa: BLE001 - any connection problem triggers the fallback
            if mode == "mongo":
                raise
            _banner(
                [
                    f"MongoDB is not reachable at {settings.mongodb_uri} ({type(exc).__name__}).",
                    "FALLING BACK TO MONGOMOCK: an in-memory database.",
                    "Data is lost when the server stops. Start MongoDB with `docker compose up -d`",
                    "to keep data between restarts.",
                ]
            )
            client = None
    if client is None:
        client = AsyncMongoMockClient()
        database = client[settings.db_name]
        state.mode = "mongomock"
    state.client = client
    await init_beanie(database=database, document_models=ALL_MODELS)
    _banner([f"DATABASE MODE: {state.mode.upper()}", f"database: {database.name}"])
    return state.mode
