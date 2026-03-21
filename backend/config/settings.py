from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    APP_NAME: str = "TransCom Stream"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'database.db').as_posix()}"

    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    DEFAULT_ADMIN_LOGIN: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_ADMIN_FIO: str = "Администратор Системы"

    MAX_AUDIO_SIZE_MB: int = 50
    MAX_VIDEO_SIZE_MB: int = 1000
    MAX_VOICE_MESSAGE_SIZE_MB: int = 50
    ALLOWED_AUDIO_FORMATS: List[str] = ["mp3", "wav", "ogg"]
    ALLOWED_VIDEO_FORMATS: List[str] = ["mp4", "webm"]
    STORAGE_PATH: str = str(BACKEND_DIR / "storage")

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        sqlite_prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
        for prefix in sqlite_prefixes:
            if value.startswith(prefix):
                raw_path = value.removeprefix(prefix)
                if raw_path == ":memory:":
                    return value
                database_path = Path(raw_path)
                if not database_path.is_absolute():
                    database_path = (BACKEND_DIR / raw_path).resolve()
                return f"{prefix}{database_path.as_posix()}"
        return value

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug_flag(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
                return False
        return value

    @field_validator("STORAGE_PATH", mode="before")
    @classmethod
    def normalize_storage_path(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        storage_path = Path(value)
        if not storage_path.is_absolute():
            storage_path = (BACKEND_DIR / storage_path).resolve()
        return str(storage_path)


settings = Settings()
