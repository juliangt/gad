# backend/src/gad/availability/matcher.py
"""Encuentra usuarios en 'modo disponible' a quienes notificar cuando aparece un plan."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.availability import Availability
from gad.models.plan import Plan


async def find_matching_availability(
    session: AsyncSession, plan: Plan
) -> list[Availability]:
    """Devuelve availabilities activas, no expiradas, cuyo radio cubre la
    ubicación del plan, y cuyo filtro de actividad incluye el plan (o es null)."""
    stmt = (
        select(Availability)
        .where(
            Availability.active.is_(True),
            Availability.expires_at > func.now(),
            Availability.user_id != plan.host_id,
            # El plan cae dentro del radio de la availability
            Availability.location_grid.ST_DWithin(plan.location_grid, Availability.radius_m),
        )
    )
    result = await session.execute(stmt)
    candidates = list(result.scalars().all())

    matched = []
    for av in candidates:
        if av.activity_filter is None or plan.activity_type.value in av.activity_filter:
            matched.append(av)
    return matched
