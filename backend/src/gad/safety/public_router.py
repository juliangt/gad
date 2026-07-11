# backend/src/gad/safety/public_router.py
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.db import get_session
from gad.middleware.rate_limit import limiter
from gad.safety.schemas import PublicLocationOut
from gad.safety.service import get_public_location

router = APIRouter(tags=["safety"])


@router.get("/s/{token}", response_model=PublicLocationOut)
@limiter.limit("30/minute")
async def public_location_endpoint(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PublicLocationOut:
    info = await get_public_location(session, token)
    return PublicLocationOut(**info)
