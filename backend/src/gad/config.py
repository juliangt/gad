# backend/src/gad/config.py
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "GAD"
    environment: Literal["dev", "test", "prod"] = "dev"
    # Se acepta str (CSV desde .env) o list[str]; el validator lo normaliza a list.
    cors_origins: list[str] | str = ["http://localhost:5173"]

    # Database
    database_url: str

    # Redis
    redis_url: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    password_reset_token_expire_minutes: int = 30

    # OAuth Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # Rate limit
    rate_limit_enabled: bool = True
    default_rate_limit: str = "300/minute"
    forwarded_allow_ips: str = "*"

    # Trusted hosts
    trusted_hosts: list[str] | str = ["*"]

    # Body / uploads
    max_request_body_size: int = 10 * 1024 * 1024  # 10 MB
    max_avatar_bytes: int = 5 * 1024 * 1024  # 5 MB

    # WebSocket
    ws_max_message_rate: int = 5  # mensajes por segundo por conexión

    # Security headers
    csp_policy: str = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("trusted_hosts", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, v):
        if isinstance(v, str):
            return [h.strip() for h in v.split(",") if h.strip()]
        return v

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("JWT_SECRET debe tener al menos 16 caracteres")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
