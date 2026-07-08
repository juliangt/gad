# backend/src/gad/users/service.py
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.exceptions import ConflictError, NotFoundError
from gad.models.social import Block
from gad.models.user import User, UserPreferences
from gad.schemas.user import PreferencesIn, UserUpdateIn


async def get_or_create_preferences(session: AsyncSession, user: User) -> UserPreferences:
    # Asegura que la relación lazy esté cargada en contexto async.
    if user.preferences is None:
        await session.refresh(user, ["preferences"])
    if user.preferences is None:
        prefs = UserPreferences(user_id=user.id)
        session.add(prefs)
        await session.commit()
        await session.refresh(user, ["preferences"])
    return user.preferences


async def update_profile(session: AsyncSession, user: User, data: UserUpdateIn) -> User:
    changed = False
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value)
            changed = True
    if changed:
        await session.commit()
        await session.refresh(user)
    return user


async def update_preferences(
    session: AsyncSession, user: User, data: PreferencesIn
) -> UserPreferences:
    prefs = await get_or_create_preferences(session, user)
    for field, value in data.model_dump().items():
        setattr(prefs, field, value)
    await session.commit()
    await session.refresh(prefs)
    return prefs


async def get_user_public(session: AsyncSession, user_id: UUID) -> User:
    result = await session.execute(
        select(User).options(selectinload(User.preferences)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Usuario no encontrado")
    return user


async def block_user(
    session: AsyncSession, blocker: User, blocked_id: UUID
) -> Block:
    if blocker.id == blocked_id:
        raise ConflictError("No podés bloquearte a vos mismo")
    existing = await session.execute(
        select(Block).where(Block.blocker_id == blocker.id, Block.blocked_id == blocked_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya bloqueaste a este usuario")
    block = Block(
        blocker_id=blocker.id,
        blocked_id=blocked_id,
        created_at=datetime.now(UTC),
    )
    session.add(block)
    await session.commit()
    await session.refresh(block)
    return block


async def list_blocks(session: AsyncSession, user: User) -> list[Block]:
    result = await session.execute(
        select(Block).where(Block.blocker_id == user.id).order_by(Block.created_at.desc())
    )
    return list(result.scalars().all())


async def is_blocked_pair(
    session: AsyncSession, user_a_id: UUID, user_b_id: UUID
) -> bool:
    """True si cualquiera de los dos bloqueó al otro."""
    result = await session.execute(
        select(Block).where(
            ((Block.blocker_id == user_a_id) & (Block.blocked_id == user_b_id))
            | ((Block.blocker_id == user_b_id) & (Block.blocked_id == user_a_id))
        )
    )
    return result.scalar_one_or_none() is not None
