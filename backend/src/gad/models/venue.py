# backend/src/gad/models/venue.py
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ActivityType, OfferRedemption, VenueStatus

if TYPE_CHECKING:
    pass


class Venue(Base, TimestampMixin):
    __tablename__ = "venues"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activitytype"), nullable=False
    )
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    # Dirección comercial pública: NO usa snap_to_grid (no es posición de usuario).
    location: Mapped[object] = mapped_column(
        Geography("POINT", srid=4326), nullable=False
    )
    status: Mapped[VenueStatus] = mapped_column(
        Enum(VenueStatus, name="venuestatus"),
        nullable=False,
        default=VenueStatus.pending,
        index=True,
    )

    # Datos de contacto administrativos (no son login; revisión manual por admin).
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    offers: Mapped[list["VenueOffer"]] = relationship(
        "VenueOffer",
        back_populates="venue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class VenueOffer(Base, TimestampMixin):
    __tablename__ = "venue_offers"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    venue_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    redemption_method: Mapped[OfferRedemption] = mapped_column(
        Enum(OfferRedemption, name="offerredemption"), nullable=False
    )
    # Vigencia obligatoria: valid_until NOT NULL exige renovación (decisión #4).
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    venue: Mapped["Venue"] = relationship("Venue", back_populates="offers")
