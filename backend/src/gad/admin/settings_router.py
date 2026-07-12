# backend/src/gad/admin/settings_router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.settings_schemas import (
    AuditEventOut,
    FeatureFlagOut,
    FeatureFlagUpdate,
    MaintenanceIn,
    MaintenanceOut,
    OperationalSettingsOut,
    UserDefaultsIn,
    UserDefaultsOut,
)
from gad.admin.settings_service import get_settings_service, record_audit
from gad.db import get_session
from gad.exceptions import NotFoundError, ValidationError
from gad.models.settings import (
    AuditEvent,
    FeatureFlag,
    MaintenanceState,
    OperationalSettings,
    UserDefaults,
)
from gad.models.user import User
from gad.schemas.pagination import PaginatedOut
from gad.settings_cache import SettingsService

router = APIRouter(prefix="/settings", tags=["admin-settings"])


def _snapshot(model) -> dict:
    """Snapshot de los campos editables para auditoría before/after."""
    return {
        c: getattr(model, c)
        for c in model.__table__.columns.keys()
        if c not in {"id", "created_at", "updated_at", "updated_by"}
    }


@router.get("/user-defaults", response_model=UserDefaultsOut)
async def get_user_defaults_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDefaultsOut:
    svc = await get_settings_service(session)
    ud = await svc.get_user_defaults()
    return UserDefaultsOut.model_validate(ud, from_attributes=True)


@router.put("/user-defaults", response_model=UserDefaultsOut)
async def put_user_defaults_endpoint(
    data: UserDefaultsIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserDefaultsOut:
    result = await session.execute(select(UserDefaults).where(UserDefaults.id == 1))
    ud = result.scalar_one_or_none()
    if ud is None:
        ud = UserDefaults(id=1, **data.model_dump())
        session.add(ud)
        before = {}
    else:
        before = _snapshot(ud)
        for field, value in data.model_dump().items():
            setattr(ud, field, value)
    await session.commit()
    await session.refresh(ud)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.user_defaults.update",
        target_type="settings",
        target_id="user_defaults",
        detail={"before": before, "after": _snapshot(ud)},
    )
    return UserDefaultsOut.model_validate(ud, from_attributes=True)


@router.get("/operational", response_model=OperationalSettingsOut)
async def get_operational_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OperationalSettingsOut:
    svc = await get_settings_service(session)
    op = await svc.get_operational()
    return OperationalSettingsOut.model_validate(op, from_attributes=True)


@router.put("/operational", response_model=OperationalSettingsOut)
async def put_operational_endpoint(
    data: OperationalSettingsOut,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OperationalSettingsOut:
    result = await session.execute(
        select(OperationalSettings).where(OperationalSettings.id == 1)
    )
    op = result.scalar_one_or_none()
    if op is None:
        op = OperationalSettings(id=1, **data.model_dump())
        session.add(op)
        before = {}
    else:
        before = _snapshot(op)
        for field, value in data.model_dump().items():
            setattr(op, field, value)
    await session.commit()
    await session.refresh(op)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.operational.update",
        target_type="settings",
        target_id="operational",
        detail={"before": before, "after": _snapshot(op)},
    )
    return OperationalSettingsOut.model_validate(op, from_attributes=True)


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
async def list_feature_flags_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[FeatureFlagOut]:
    result = await session.execute(select(FeatureFlag).order_by(FeatureFlag.key))
    return [FeatureFlagOut.model_validate(f, from_attributes=True) for f in result.scalars().all()]


@router.put("/feature-flags/{key}", response_model=FeatureFlagOut)
async def put_feature_flag_endpoint(
    key: str,
    data: FeatureFlagUpdate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeatureFlagOut:
    result = await session.execute(select(FeatureFlag).where(FeatureFlag.key == key))
    flag = result.scalar_one_or_none()
    if flag is None:
        raise NotFoundError(f"Feature flag '{key}' no encontrado")
    before = {"enabled": flag.enabled}
    flag.enabled = data.enabled
    await session.commit()
    await session.refresh(flag)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.feature_flag.update",
        target_type="feature_flag",
        target_id=key,
        detail={"before": before, "after": {"enabled": data.enabled}},
    )
    return FeatureFlagOut.model_validate(flag, from_attributes=True)


@router.get("/maintenance", response_model=MaintenanceOut)
async def get_maintenance_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MaintenanceOut:
    svc = await get_settings_service(session)
    ms = await svc.get_maintenance()
    return MaintenanceOut.model_validate(ms, from_attributes=True)


@router.put("/maintenance", response_model=MaintenanceOut)
async def put_maintenance_endpoint(
    data: MaintenanceIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MaintenanceOut:
    result = await session.execute(select(MaintenanceState).where(MaintenanceState.id == 1))
    ms = result.scalar_one_or_none()
    if ms is None:
        ms = MaintenanceState(id=1, updated_by=admin.id, **data.model_dump())
        session.add(ms)
        before = {}
    else:
        before = _snapshot(ms)
        for field, value in data.model_dump().items():
            setattr(ms, field, value)
        ms.updated_by = admin.id
    await session.commit()
    await session.refresh(ms)
    await record_audit(
        session,
        actor_id=admin.id,
        action="settings.maintenance.update",
        target_type="settings",
        target_id="maintenance",
        detail={"before": before, "after": _snapshot(ms)},
    )
    return MaintenanceOut.model_validate(ms, from_attributes=True)


@router.get("/audit", response_model=PaginatedOut[AuditEventOut])
async def list_audit_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    actor: UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AuditEventOut]:
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if actor is not None:
        stmt = stmt.where(AuditEvent.actor_id == actor)
    if action is not None:
        stmt = stmt.where(AuditEvent.action == action)
    if target_type is not None:
        stmt = stmt.where(AuditEvent.target_type == target_type)
    if before is not None:
        stmt = stmt.where(AuditEvent.created_at < before)
    result = await session.execute(stmt)
    items = [
        AuditEventOut.model_validate(e, from_attributes=True)
        for e in result.scalars().all()
    ]
    next_cursor = (
        items[-1].created_at.isoformat() if len(items) == limit and items else None
    )
    return PaginatedOut[AuditEventOut](items=items, next_cursor=next_cursor)
