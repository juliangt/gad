# backend/src/gad/users/router.py
from typing import Annotated

from fastapi import APIRouter, Depends

from gad.auth.dependencies import get_current_user
from gad.models.user import User
from gad.schemas.auth import UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        verification_level=current_user.verification_level.value,
        reputation_score=current_user.reputation_score,
    )
