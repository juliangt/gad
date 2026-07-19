# backend/src/gad/matching/service.py
from contextlib import suppress
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.matching.notifications import (
    publish_application_decided,
    publish_match_created,
    publish_new_application,
)
from gad.matching.schemas import ApplicationIn
from gad.models.enums import (
    ApplicationStatus,
    MatchRole,
    MatchStatus,
    NotificationType,
    PlanStatus,
)
from gad.models.match import Match, MatchParticipant
from gad.models.plan import Plan, PlanApplication
from gad.models.user import User
from gad.notifications.service import create_notification, create_notifications_bulk
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
        await publish_new_application(str(plan.host_id), str(plan_id), str(applicant.id))
    # Notificación in-app para el host
    with suppress(Exception):
        await create_notification(
            session,
            plan.host_id,
            NotificationType.new_application,
            {"plan_id": str(plan_id), "applicant_id": str(applicant.id)},
        )
    return application


async def _load_application(session: AsyncSession, application_id: UUID) -> PlanApplication:
    result = await session.execute(
        select(PlanApplication).where(PlanApplication.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise NotFoundError("Postulación no encontrada")
    return application


async def accept_application(
    session: AsyncSession, host: User, application_id: UUID
) -> Match | None:
    application = await _load_application(session, application_id)
    plan = await _load_plan(session, application.plan_id)

    if plan.host_id != host.id:
        raise NotFoundError("Postulación no encontrada")
    if plan.status != PlanStatus.open:
        raise ConflictError("El plan no está abierto")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")
    if plan.current_participants >= plan.max_participants:
        raise ConflictError("El plan está completo")

    application.status = ApplicationStatus.accepted
    application.decided_at = datetime.now(UTC)
    plan.current_participants += 1

    match = None
    if plan.current_participants >= plan.max_participants:
        plan.status = PlanStatus.matched
        match = Match(
            plan_id=plan.id,
            status=MatchStatus.active,
            started_at=datetime.now(UTC),
            location_sharing_active=False,
        )
        session.add(match)
        await session.flush()  # para tener match.id

        # Host
        session.add(
            MatchParticipant(
                match_id=match.id,
                user_id=host.id,
                role=MatchRole.host,
                joined_at=datetime.now(UTC),
            )
        )
        # Participantes aceptados (incluyendo el actual)
        accepted_apps = await session.execute(
            select(PlanApplication).where(
                PlanApplication.plan_id == plan.id,
                PlanApplication.status == ApplicationStatus.accepted,
            )
        )
        participant_ids = [host.id]
        for app in accepted_apps.scalars():
            session.add(
                MatchParticipant(
                    match_id=match.id,
                    user_id=app.applicant_id,
                    role=MatchRole.participant,
                    joined_at=datetime.now(UTC),
                )
            )
            participant_ids.append(app.applicant_id)

    await session.commit()

    # Notificaciones best-effort (Redis puede no estar disponible)
    with suppress(Exception):
        await publish_application_decided(
            str(application.applicant_id), str(plan.id), accepted=True
        )
    if match is not None:
        with suppress(Exception):
            await publish_match_created(
                str(match.id), str(plan.id), [str(u) for u in participant_ids]
            )
        # Notificación in-app de match para todos los participantes
        with suppress(Exception):
            await create_notifications_bulk(
                session,
                participant_ids,
                NotificationType.match,
                {"match_id": str(match.id), "plan_id": str(plan.id)},
            )
        await session.refresh(match)
    return match


async def reject_application(session: AsyncSession, host: User, application_id: UUID) -> None:
    application = await _load_application(session, application_id)
    plan = await _load_plan(session, application.plan_id)

    if plan.host_id != host.id:
        raise NotFoundError("Postulación no encontrada")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")

    application.status = ApplicationStatus.rejected
    application.decided_at = datetime.now(UTC)
    await session.commit()

    with suppress(Exception):
        await publish_application_decided(
            str(application.applicant_id), str(plan.id), accepted=False
        )


async def withdraw_application(
    session: AsyncSession, applicant: User, application_id: UUID
) -> None:
    application = await _load_application(session, application_id)
    if application.applicant_id != applicant.id:
        raise NotFoundError("Postulación no encontrada")
    if application.status != ApplicationStatus.pending:
        raise ConflictError("La postulación ya fue decidida")

    application.status = ApplicationStatus.withdrawn
    await session.commit()


async def list_applications_for_plan(
    session: AsyncSession, host: User, plan_id: UUID
) -> list[PlanApplication]:
    plan = await _load_plan(session, plan_id)
    if plan.host_id != host.id:
        raise NotFoundError("Plan no encontrado")
    result = await session.execute(
        select(PlanApplication)
        .where(PlanApplication.plan_id == plan_id)
        .order_by(PlanApplication.created_at.desc())
    )
    return list(result.scalars().all())


async def list_my_applications(
    session: AsyncSession,
    user: User,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list[PlanApplication]:
    stmt = (
        select(PlanApplication)
        .where(PlanApplication.applicant_id == user.id)
        .order_by(PlanApplication.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(PlanApplication.created_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_my_matches(
    session: AsyncSession,
    user: User,
    *,
    limit: int = 50,
    before: datetime | None = None,
) -> list[Match]:
    stmt = (
        select(Match)
        .join(MatchParticipant, MatchParticipant.match_id == Match.id)
        .where(MatchParticipant.user_id == user.id)
        .order_by(Match.started_at.desc())
        .limit(limit)
    )
    if before is not None:
        stmt = stmt.where(Match.started_at < before)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


async def get_match(session: AsyncSession, match_id: UUID) -> Match:
    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise NotFoundError("Match no encontrado")
    return match


async def complete_match(session: AsyncSession, user: User, match_id: UUID) -> Match:
    match = await get_match(session, match_id)
    # Verificar participación
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Match no encontrado")

    match.status = MatchStatus.completed
    match.ended_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(match)
    return match


async def cancel_match(session: AsyncSession, user: User, match_id: UUID) -> Match:
    match = await get_match(session, match_id)
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Match no encontrado")

    match.status = MatchStatus.cancelled
    if match.ended_at is None:
        match.ended_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(match)
    return match
