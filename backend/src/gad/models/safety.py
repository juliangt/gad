# backend/src/gad/models/safety.py
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ContactType, SafetyEventType


class TrustedContact(Base, TimestampMixin):
    __tablename__ = "trusted_contacts"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_type: Mapped[ContactType] = mapped_column(
        Enum(ContactType, name="contacttype"), nullable=False
    )
    contact_value: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "contact_type", "contact_value", name="uq_trusted_contacts_user_value"
        ),
    )


class SafetySession(Base, TimestampMixin):
    __tablename__ = "safety_sessions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ping_location: Mapped[object | None] = mapped_column(
        Geography("POINT", srid=4326), nullable=True
    )
    last_ping_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trusted_contacts_notified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )


class SafetyEvent(Base, TimestampMixin):
    __tablename__ = "safety_events"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    match_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[SafetyEventType] = mapped_column(
        Enum(SafetyEventType, name="safetyeventtype"), nullable=False
    )
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
