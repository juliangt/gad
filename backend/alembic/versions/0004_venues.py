"""add venues and venue_offers tables

Crea las tablas `venues` y `venue_offers` para el feature Venue Sponsor
(issue #8). Modelo de datos aditivo: no modifica tablas existentes.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-11
"""
from collections.abc import Sequence

import gad.models  # noqa: F401  - registra modelos en Base.metadata
from alembic import op
from gad.alembic_utils import create_spatial_indexes
from gad.models import Base
from gad.models.venue import Venue, VenueOffer

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    # 0001 crea el schema con create_all sobre los modelos actuales, que ya
    # incluyen estas tablas (los modelos se registran en Base.metadata al
    # importar gad.models). Guardamos idempotencia para DBs nuevas.
    bind = op.get_bind()
    Base.metadata.create_all(
        bind=bind, tables=[Venue.__table__, VenueOffer.__table__], checkfirst=True
    )

    # Índice espacial GiST para queries ST_DWithin sobre venues.location.
    create_spatial_indexes()


def downgrade() -> None:
    op.drop_table("venue_offers")
    op.drop_table("venues")
