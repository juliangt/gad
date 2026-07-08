# backend/tests/test_config.py
import pytest

from gad.config import Settings


def _set_required_env(monkeypatch, **overrides):
    base = {
        "DATABASE_URL": "postgresql+asyncpg://u:p@db:5432/gad",
        "REDIS_URL": "redis://redis:6379/0",
        "JWT_SECRET": "test-secret-12345678901234567890",
    }
    base.update(overrides)
    for k, v in base.items():
        monkeypatch.setenv(k, v)
    return base


def test_settings_load_from_env(monkeypatch):
    _set_required_env(
        monkeypatch,
        GOOGLE_CLIENT_ID="google-id",
        GOOGLE_CLIENT_SECRET="google-secret",
    )

    s = Settings()

    assert s.database_url == "postgresql+asyncpg://u:p@db:5432/gad"
    assert s.redis_url == "redis://redis:6379/0"
    assert s.jwt_secret == "test-secret-12345678901234567890"
    assert s.google_client_id == "google-id"
    assert s.access_token_expire_minutes == 15
    assert s.refresh_token_expire_days == 7
    assert s.cors_origins == ["http://localhost:5173"]


def test_settings_cors_parses_csv(monkeypatch):
    _set_required_env(monkeypatch, CORS_ORIGINS="https://a.com,https://b.com")

    s = Settings()

    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_settings_jwt_secret_min_length(monkeypatch):
    _set_required_env(monkeypatch, JWT_SECRET="short")

    with pytest.raises(ValueError):
        Settings()
