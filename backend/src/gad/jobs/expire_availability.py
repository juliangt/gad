# backend/src/gad/jobs/expire_availability.py
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.availability import Availability


async def expire_availability(session: AsyncSession) -> int:
    """Desactiva availabilities cuya expires_at ya pasó."""
    now = datetime.now(UTC)
    result = await session.execute(
        update(Availability)
        .where(Availability.active.is_(True), Availability.expires_at <= now)
        .values(active=False)
    )
    await session.commit()
    return result.rowcount or 0
