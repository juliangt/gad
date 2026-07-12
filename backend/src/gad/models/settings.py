# backend/src/gad/models/settings.py
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin


class UserDefaults(Base, TimestampMixin):
    """Singleton (id fijo = 1): defaults aplicados a nuevos usuarios y como
    catálogo de actividades disponibles."""

    __tablename__ = "user_defaults"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    default_plan_validity_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    default_search_radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    age_range_min: Mapped[int] = mapped_column(Integer, nullable=False)
    age_range_max: Mapped[int] = mapped_column(Integer, nullable=False)
    group_size_preference: Mapped[str] = mapped_column(String(30), nullable=False)
    gender_preference: Mapped[str] = mapped_column(String(30), nullable=False)
    activity_types: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )


class OperationalSettings(Base, TimestampMixin):
    """Singleton (id fijo = 1): parámetros operativos editables en caliente."""

    __tablename__ = "operational_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    rate_limit_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    default_rate_limit: Mapped[str] = mapped_column(String(50), nullable=False)
    access_token_expire_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    refresh_token_expire_days: Mapped[int] = mapped_column(Integer, nullable=False)
    max_avatar_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    ws_max_message_rate: Mapped[int] = mapped_column(Integer, nullable=False)


class FeatureFlag(Base, TimestampMixin):
    """Una fila por flag. PK = key."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class MaintenanceState(Base, TimestampMixin):
    """Singleton (id fijo = 1): modo mantenimiento + banner global."""

    __tablename__ = "maintenance_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    banner_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    banner_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    banner_level: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    updated_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class AuditEvent(Base, TimestampMixin):
    """Registro de acciones administrativas sensibles."""

    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
