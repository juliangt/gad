# backend/src/gad/matching/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.matching.schemas import (
    ApplicantSummary,
    ApplicationIn,
    ApplicationOut,
    MatchOut,
    ParticipantOut,
)
from gad.matching.service import (
    accept_application,
    apply_to_plan,
    cancel_match,
    complete_match,
    get_match,
    list_applications_for_plan,
    list_my_applications,
    list_my_matches,
    reject_application,
    withdraw_application,
)
from gad.models.match import MatchParticipant
from gad.models.plan import PlanApplication
from gad.models.user import User

router = APIRouter(tags=["matching"])


async def _app_to_out(session: AsyncSession, app: PlanApplication) -> ApplicationOut:
    result = await session.execute(select(User).where(User.id == app.applicant_id))
    applicant = result.scalar_one()
    return ApplicationOut(
        id=app.id,
        plan_id=app.plan_id,
        applicant=ApplicantSummary(
            id=applicant.id,
            display_name=applicant.display_name,
            avatar_url=applicant.avatar_url,
            reputation_score=applicant.reputation_score,
            verification_level=applicant.verification_level.value,
        ),
        status=app.status,
        message=app.message,
        created_at=app.created_at,
        decided_at=app.decided_at,
    )


async def _match_to_out(session: AsyncSession, match, viewer: User) -> MatchOut:
    participants_result = await session.execute(
        select(User, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.user_id == User.id)
        .where(MatchParticipant.match_id == match.id)
    )
    participants = [
        ParticipantOut(
            user_id=u.id,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            role=mp.role,
            joined_at=mp.joined_at,
        )
        for u, mp in participants_result.all()
    ]

    # Solo participantes ven la ubicación exacta
    exact_lat = None
    exact_lng = None
    is_participant = any(p.user_id == viewer.id for p in participants)
    if is_participant:
        from gad.models.plan import Plan

        plan_result = await session.execute(select(Plan).where(Plan.id == match.plan_id))
        plan = plan_result.scalar_one()
        if plan.exact_location is not None:
            # exact_location es geography; ST_X/ST_Y requieren geometry.
            loc_col = cast(plan.__table__.c.exact_location, Geometry)
            point = await session.execute(
                select(
                    func.ST_Y(loc_col).label("lat"),
                    func.ST_X(loc_col).label("lng"),
                ).where(plan.__table__.c.id == plan.id)
            )
            exact_lat, exact_lng = point.one()

    return MatchOut(
        id=match.id,
        plan_id=match.plan_id,
        status=match.status,
        started_at=match.started_at,
        ended_at=match.ended_at,
        location_sharing_active=match.location_sharing_active,
        participants=participants,
        exact_location_lat=exact_lat,
        exact_location_lng=exact_lng,
    )


@router.post(
    "/plans/{plan_id}/applications", response_model=ApplicationOut, status_code=201
)
async def apply_endpoint(
    plan_id: UUID,
    data: ApplicationIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ApplicationOut:
    app = await apply_to_plan(session, current_user, plan_id, data)
    return await _app_to_out(session, app)


@router.get("/plans/{plan_id}/applications", response_model=list[ApplicationOut])
async def list_plan_applications_endpoint(
    plan_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    apps = await list_applications_for_plan(session, current_user, plan_id)
    return [await _app_to_out(session, a) for a in apps]


@router.post("/applications/{application_id}/accept", response_model=MatchOut | None)
async def accept_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut | None:
    match = await accept_application(session, current_user, application_id)
    if match is None:
        return None
    return await _match_to_out(session, match, current_user)


@router.post("/applications/{application_id}/reject")
async def reject_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await reject_application(session, current_user, application_id)
    return {"message": "Postulación rechazada"}


@router.delete("/applications/{application_id}")
async def withdraw_endpoint(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await withdraw_application(session, current_user, application_id)
    return {"message": "Postulación retirada"}


@router.get("/me/applications", response_model=list[ApplicationOut])
async def my_applications_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ApplicationOut]:
    apps = await list_my_applications(session, current_user)
    return [await _app_to_out(session, a) for a in apps]


@router.get("/matches", response_model=list[MatchOut])
async def my_matches_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[MatchOut]:
    matches = await list_my_matches(session, current_user)
    return [await _match_to_out(session, m, current_user) for m in matches]


@router.get("/matches/{match_id}", response_model=MatchOut)
async def get_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await get_match(session, match_id)
    return await _match_to_out(session, match, current_user)


@router.post("/matches/{match_id}/complete", response_model=MatchOut)
async def complete_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await complete_match(session, current_user, match_id)
    return await _match_to_out(session, match, current_user)


@router.post("/matches/{match_id}/cancel", response_model=MatchOut)
async def cancel_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await cancel_match(session, current_user, match_id)
    return await _match_to_out(session, match, current_user)
