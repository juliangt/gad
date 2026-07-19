import asyncio
import time
from uuid import uuid4
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import Column, String, DateTime, JSON, MetaData
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True)
    user_id = Column(String)
    type = Column(String)
    payload = Column(JSON)
    created_at = Column(DateTime)

async def setup_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine

async def create_notification(
    session: AsyncSession,
    user_id: str,
    type_: str,
    payload: dict | None = None,
):
    notif = Notification(
        id=str(uuid4()),
        user_id=user_id,
        type=type_,
        payload=payload,
        created_at=datetime.now(UTC),
    )
    session.add(notif)
    await session.commit()
    await session.refresh(notif)
    return notif

async def create_notifications_bulk(
    session: AsyncSession,
    user_ids: list[str],
    type_: str,
    payload: dict | None = None,
):
    if not user_ids:
        return
    now = datetime.now(UTC)
    notifs = [
        Notification(
            id=str(uuid4()),
            user_id=uid,
            type=type_,
            payload=payload,
            created_at=now,
        )
        for uid in user_ids
    ]
    session.add_all(notifs)
    await session.commit()

async def run_benchmark():
    engine = await setup_db()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    num_users = 100
    user_ids = [str(uuid4()) for _ in range(num_users)]

    # Baseline: One by one
    async with async_session() as session:
        start_time = time.time()
        for uid in user_ids:
            await create_notification(session, uid, "match", {"match_id": "123", "plan_id": "456"})
        baseline_time = time.time() - start_time
        print(f"Baseline (1 by 1) for {num_users} users: {baseline_time:.4f} seconds")

    # Optimized: Bulk
    async with async_session() as session:
        start_time = time.time()
        await create_notifications_bulk(session, user_ids, "match", {"match_id": "123", "plan_id": "456"})
        optimized_time = time.time() - start_time
        print(f"Optimized (bulk) for {num_users} users: {optimized_time:.4f} seconds")

    print(f"Improvement: {baseline_time / optimized_time:.2f}x faster")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
