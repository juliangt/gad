# backend/src/gad/availability/router.py
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.availability.schemas import AvailabilityIn, AvailabilityOut
from gad.availability.service import activate, deactivate, get_mine
from gad.db import get_session
from gad.models.user import User

router = APIRouter(prefix="/availability", tags=["availability"])


def _to_out(avail) -> AvailabilityOut:
    return AvailabilityOut(
        id=avail.id, radius_m=avail.radius_m, activity_filter=avail.activity_filter,
        expires_at=avail.expires_at, active=avail.active, created_at=avail.created_at,
    )


@router.post("", response_model=AvailabilityOut, status_code=201)
async def activate_endpoint(
    data: AvailabilityIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AvailabilityOut:
    avail = await activate(session, current_user, data)
    return _to_out(avail)


@router.get("/me", response_model=AvailabilityOut | None)
async def get_mine_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AvailabilityOut | None:
    avail = await get_mine(session, current_user)
    if avail is None:
        return None
    return _to_out(avail)


@router.delete("/me")
async def deactivate_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await deactivate(session, current_user)
    return {"message": "Modo disponible desactivado"}
