# backend/src/gad/matching/service.py
from contextlib import suppress
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.matching.notifications import publish_new_application
from gad.matching.schemas import ApplicationIn
from gad.models.enums import ApplicationStatus, PlanStatus
from gad.models.plan import Plan, PlanApplication
from gad.models.user import User
from gad.users.service import is_blocked_pair


async def _load_plan(session: AsyncSession, plan_id: UUID) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Plan no encontrado")
    return plan


async def apply_to_plan(
    session: AsyncSession,
    applicant: User,
    plan_id: UUID,
    data: ApplicationIn,
) -> PlanApplication:
    plan = await _load_plan(session, plan_id)

    if plan.status != PlanStatus.open:
        raise ConflictError("El plan no está abierto a postulaciones")
    if plan.host_id == applicant.id:
        raise ValidationError("No podés postularte a tu propio plan")
    if await is_blocked_pair(session, applicant.id, plan.host_id):
        raise ConflictError("No podés postularte a este plan")

    existing = await session.execute(
        select(PlanApplication).where(
            PlanApplication.plan_id == plan_id,
            PlanApplication.applicant_id == applicant.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya te postulaste a este plan")

    application = PlanApplication(
        plan_id=plan_id,
        applicant_id=applicant.id,
        status=ApplicationStatus.pending,
        message=data.message,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)

    # Best-effort: si Redis no está disponible, la postulación igual se completa.
    with suppress(Exception):
        await publish_new_application(
            str(plan.host_id), str(plan_id), str(applicant.id)
        )
    return application
