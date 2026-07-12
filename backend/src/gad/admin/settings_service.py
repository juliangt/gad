# backend/src/gad/admin/settings_service.py
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.settings import AuditEvent
from gad.settings_cache import SettingsService


async def get_settings_service(session: AsyncSession) -> SettingsService:
    """Factory de SettingsService para uso como dependencia FastAPI."""
    return SettingsService(session)


async def record_audit(
    session: AsyncSession,
    *,
    actor_id: UUID | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    detail: dict | None = None,
) -> AuditEvent:
    ev = AuditEvent(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail or {},
    )
    session.add(ev)
    await session.commit()
    await session.refresh(ev)
    return ev
