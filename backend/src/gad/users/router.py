# backend/src/gad/users/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user, get_token_store
from gad.db import get_session
from gad.models.user import User
from gad.schemas.block import BlockOut
from gad.schemas.user import (
    PreferencesIn,
    PreferencesOut,
    UserDetail,
    UserPublicProfile,
    UserUpdateIn,
)
from gad.users.service import (
    block_user,
    delete_account,
    get_or_create_preferences,
    get_user_public,
    list_blocks,
    update_preferences,
    update_profile,
    upload_avatar,
)

router = APIRouter(tags=["users"])


def _to_detail(user: User) -> UserDetail:
    prefs = user.preferences
    return UserDetail(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        birth_date=user.birth_date,
        gender=user.gender,
        reputation_score=user.reputation_score,
        verification_level=user.verification_level,
        preferences=PreferencesOut.model_validate(prefs, from_attributes=True)
        if prefs
        else PreferencesOut(),
    )


@router.get("/me", response_model=UserDetail)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDetail:
    await get_or_create_preferences(session, current_user)
    return _to_detail(current_user)


@router.delete("/me", status_code=204)
async def delete_me_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await delete_account(session, get_token_store(), current_user)


@router.patch("/me", response_model=UserDetail)
async def patch_me(
    data: UserUpdateIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDetail:
    await update_profile(session, current_user, data)
    return _to_detail(current_user)


@router.put("/me/preferences", response_model=PreferencesOut)
async def put_preferences(
    data: PreferencesIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PreferencesOut:
    prefs = await update_preferences(session, current_user, data)
    return PreferencesOut.model_validate(prefs, from_attributes=True)


@router.post("/me/avatar", response_model=UserDetail)
async def post_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
) -> UserDetail:
    await upload_avatar(session, current_user, file)
    return _to_detail(current_user)


@router.get("/users/{user_id}", response_model=UserPublicProfile)
async def get_user(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserPublicProfile:
    user = await get_user_public(session, user_id)
    return UserPublicProfile(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        reputation_score=user.reputation_score,
        verification_level=user.verification_level,
    )


@router.post("/users/{user_id}/block", response_model=BlockOut, status_code=201)
async def block_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BlockOut:
    block = await block_user(session, current_user, user_id)
    return BlockOut(blocked_id=block.blocked_id, created_at=block.created_at)


@router.get("/me/blocks", response_model=list[BlockOut])
async def list_my_blocks(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[BlockOut]:
    blocks = await list_blocks(session, current_user)
    return [BlockOut(blocked_id=b.blocked_id, created_at=b.created_at) for b in blocks]
