import json
from pathlib import Path
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    APP_NAME: str = "TransCom Stream"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

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
    ALLOWED_AUDIO_FORMATS: List[str] = ["mp3", "wav", "ogg", "webm"]
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

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def normalize_cors_origins(cls, value):
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return []
            if cleaned.startswith("["):
                try:
                    parsed = json.loads(cleaned)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in cleaned.split(",") if item.strip()]
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

    @model_validator(mode="after")
    def validate_production_security(self):
        insecure_secret_keys = {
            "your-secret-key-change-in-production",
            "your-secret-key-min-32-characters-long",
            "changeme",
            "secret",
        }
        weak_admin_passwords = {
            "admin123",
            "admin",
            "password",
            "changeme",
            "change-me-now",
        }

        if not self.DEBUG:
            if len(self.SECRET_KEY.strip()) < 32 or self.SECRET_KEY.strip().lower() in insecure_secret_keys:
                raise ValueError("SECRET_KEY must be strong and at least 32 characters long when DEBUG is disabled")
            if (
                len(self.DEFAULT_ADMIN_PASSWORD.strip()) < 10
                or self.DEFAULT_ADMIN_PASSWORD.strip().lower() in weak_admin_passwords
            ):
                raise ValueError(
                    "DEFAULT_ADMIN_PASSWORD must be strong and not use the default placeholder when DEBUG is disabled"
                )

        return self


settings = Settings()
