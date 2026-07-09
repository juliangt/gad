# backend/tests/conftest.py
import os

# Setea env vars requeridas ANTES de importar gad.* para que el singleton
# settings = get_settings() no falle en entornos sin .env (ej. CI).
# Los tests que necesitan valores específicos (test_config, test_jwt) usan
# monkeypatch + get_settings.cache_clear() para override.
# Los tests de DB/Redis usan testcontainers con sus propios engines/clients.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-at-least-32-bytes-long")
# Deshabilita el rate limiting global: el limiter singleton intentaría conectar
# al REDIS_URL (inaccesible en tests). test_rate_limit.py usa su propio limiter.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

# Registra todos los modelos en Base.metadata
import gad.models  # noqa: F401
from gad.models.base import Base


@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgis/postgis:16-3.4", driver="asyncpg") as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as r:
        yield r


@pytest.fixture(scope="session")
def _redis_url(redis_container) -> str:
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    return f"redis://{host}:{port}/0"


@pytest_asyncio.fixture
async def db_engine(pg_container) -> AsyncGenerator:
    url = pg_container.get_connection_url()
    engine = create_async_engine(url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def redis_client(_redis_url) -> AsyncGenerator[Redis, None]:
    """Cliente Redis dedicado por test (para tests que manipulan Redis directo)."""
    client = Redis.from_url(_redis_url)
    yield client
    await client.flushdb()
    await client.aclose()


@pytest_asyncio.fixture(autouse=True)
async def _auth_redis(_redis_url) -> AsyncGenerator[None, None]:
    """Provee stores de Redis funcionales (TokenStore + PasswordResetStore) a
    los endpoints autenticados para todos los tests.

    Como get_current_user ahora valida jti revocado contra Redis y el reset de
    password persiste tokens en Redis, cualquier test que use esos endpoints
    necesita stores apuntando al Redis de testcontainers. Este fixture autouse
    los setea globalmente y limpia entre tests.
    """
    import gad.auth.dependencies as deps
    import gad.auth.password_reset as pr
    from gad.auth.password_reset import PasswordResetStore
    from gad.auth.token_store import TokenStore

    client = Redis.from_url(_redis_url)
    deps._token_store = TokenStore(client)
    pr._store = PasswordResetStore(client)
    try:
        yield
    finally:
        deps._token_store = None
        pr._store = None
        await client.flushdb()
        await client.aclose()
