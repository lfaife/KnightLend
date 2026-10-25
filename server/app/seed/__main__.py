"""python -m app.seed : wipe the database and recreate all demo data."""

import asyncio
import logging

from app.core.db import init_db, state
from app.seed.core import run_seed


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    await init_db()
    counts = await run_seed()
    print(f"Seeded ({state.mode}): " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    if state.mode == "mongomock":
        print("Note: mongomock is in-memory. The server re-seeds itself on startup in this mode.")


if __name__ == "__main__":
    asyncio.run(main())
