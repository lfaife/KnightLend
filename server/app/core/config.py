from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017/knightlend"
    # auto: try MongoDB, fall back to mongomock. mongo: MongoDB only. mock: in-memory only.
    db_mode: Literal["auto", "mongo", "mock"] = "auto"
    db_name: str = "knightlend"

    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7

    demo_mode: bool = False
    demo_password: str = "knightlend-demo"
    # In mongomock mode the database lives in memory, so seed it when the app starts empty.
    seed_on_empty: bool = True

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 60

    upload_dir: Path = SERVER_DIR / "uploads"
    seed_image_dir: Path = SERVER_DIR / "seed_images"
    max_upload_mb: int = 5
    max_files_per_upload: int = 6

    timezone: str = "America/New_York"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
