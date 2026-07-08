# backend/tests/conftest.py
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
async def redis_client(redis_container) -> AsyncGenerator[Redis, None]:
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    client = Redis.from_url(f"redis://{host}:{port}/0")
    yield client
    await client.flushdb()
    await client.aclose()
