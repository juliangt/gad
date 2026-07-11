# backend/src/gad/users/service.py
import io
from datetime import UTC, datetime
from uuid import UUID

from fastapi import UploadFile
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gad.config import settings
from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.models.social import Block
from gad.models.user import User, UserPreferences
from gad.schemas.user import PreferencesIn, UserUpdateIn
from gad.storage import get_storage

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_DIMENSION = 4096  # px
# Pillow lanza DecompressionBombError si la imagen supera este umbral.
Image.MAX_IMAGE_PIXELS = MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION

# Magic bytes por Content-Type para validar que el contenido coincide.
_AVATAR_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # WEBP empieza con RIFF....WEBP
}


def _has_valid_magic(raw: bytes, content_type: str) -> bool:
    signatures = _AVATAR_MAGIC.get(content_type, ())
    return any(raw.startswith(sig) for sig in signatures)


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


async def unblock_user(session: AsyncSession, blocker: User, blocked_id: UUID) -> None:
    result = await session.execute(
        select(Block).where(
            Block.blocker_id == blocker.id, Block.blocked_id == blocked_id
        )
    )
    block = result.scalar_one_or_none()
    if block is None:
        raise NotFoundError("Bloqueo no encontrado")
    await session.delete(block)
    await session.commit()


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


async def set_user_status(session: AsyncSession, user_id: UUID, status) -> User:
    from gad.models.enums import UserStatus

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Usuario no encontrado")
    user.status = UserStatus(status)
    await session.commit()
    await session.refresh(user)
    return user


async def upload_avatar(session: AsyncSession, user: User, file: UploadFile) -> str:
    """Redimensiona a 512x512, valida tipo/tamaño y guarda el avatar.

    Validaciones:
    - Content-Type en allowlist (image/jpeg, image/png, image/webp).
    - Tamaño <= settings.max_avatar_bytes (lee en chunks, aborta si excede).
    - Magic bytes coherentes con el Content-Type declarado.
    - Image.MAX_IMAGE_PIXELS protege contra decompression bombs.
    - Image.verify() valida integridad del header antes de decodificar.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_AVATAR_TYPES:
        raise ValidationError(f"Tipo no permitido: {content_type}")

    # Leer en chunks con tope de tamaño para no cargar archivos enormes.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_avatar_bytes:
            raise ValidationError("Archivo demasiado grande")
        chunks.append(chunk)
    raw = b"".join(chunks)

    # Magic bytes: validar firma según Content-Type declarado.
    if not _has_valid_magic(raw, content_type):
        raise ValidationError("El contenido no coincide con el tipo declarado")

    # verify() valida integridad sin decodificar el body completo.
    try:
        Image.open(io.BytesIO(raw)).verify()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise ValidationError("Imagen inválida o corrupta") from e

    img.thumbnail((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = buf.getvalue()

    storage = get_storage()
    path = storage.avatar_path(str(user.id), "jpg")
    url = await storage.save(path, data, "image/jpeg")
    user.avatar_url = url
    await session.commit()
    await session.refresh(user)
    return url


async def delete_account(session: AsyncSession, store, user: User) -> None:
    """Soft-delete: marca status=deleted, anonimiza email y limpia credenciales.
    Conserva el registro para integridad referencial (reviews, matches)."""
    import uuid

    from gad.config import settings
    from gad.models.enums import UserStatus

    user.status = UserStatus.deleted
    user.email = f"deleted:{uuid.uuid4()}@gad.invalid"
    user.password_hash = None
    user.password_changed_at = datetime.now(UTC)
    user.google_id = None
    user.display_name = "Cuenta eliminada"
    user.bio = None
    user.avatar_url = None
    await session.commit()
    # Revocar todas las sesiones activas (el status check en get_current_user
    # también las invalida; esto cubre tokens cacheados).
    await store.revoke_user(
        str(user.id), ttl_seconds=settings.refresh_token_expire_days * 86400
    )
