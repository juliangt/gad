import pytest
from sqlalchemy import select

from gad.admin.settings_service import get_settings_service, record_audit
from gad.models.settings import AuditEvent


@pytest.mark.asyncio
async def test_get_settings_service_returns_instance(db_session):
    svc = await get_settings_service(db_session)
    assert svc is not None
    # Mismo objeto para la misma sesión (no es obligatorio, pero verifica tipo).
    assert hasattr(svc, "get_user_defaults")


@pytest.mark.asyncio
async def test_record_audit_persists_event(db_session):
    from uuid import uuid4

    actor = uuid4()
    await record_audit(
        db_session,
        actor_id=actor,
        action="settings.update",
        target_type="settings",
        target_id="operational",
        detail={"field": "rate_limit_enabled", "before": True, "after": False},
    )
    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "settings.update")
    )
    ev = result.scalar_one()
    assert ev.actor_id == actor
    assert ev.detail["after"] is False
