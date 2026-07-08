# backend/src/gad/jobs/expire_plans.py
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.db import async_session_maker
from gad.models.enums import PlanStatus
from gad.models.plan import Plan


async def expire_plans(
    session_maker: async_sessionmaker[AsyncSession] | None = None,
) -> int:
    """Marca como expired todos los planes abiertos cuya expires_at ya pasó.

    Retorna la cantidad de planes expirados.
    """
    now = datetime.now(UTC)
    maker = session_maker or async_session_maker
    async with maker() as session:
        result = await session.execute(
            update(Plan)
            .where(Plan.status == PlanStatus.open, Plan.expires_at <= now)
            .values(status=PlanStatus.expired)
        )
        await session.commit()
        return result.rowcount or 0
