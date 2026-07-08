"""initial schema

Creación de todas las tablas del spec GAD + extensión PostGIS + índices espaciales.

La migración delega la creación de tablas a Base.metadata (los modelos SQLAlchemy)
para mantener una sola fuente de verdad y evitar duplicar definiciones.

Revision ID: 0001
Revises:
Create Date: 2026-07-08
"""
from collections.abc import Sequence

import gad.models  # noqa: F401  - registra modelos en Base.metadata
from alembic import op
from gad.alembic_utils import create_spatial_indexes, enable_postgis
from gad.models import Base

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

# Orden de borrado: dependencias (hijas) primero, luego padres.
# El orden de creación no importa porque las FK se crean al final por metadata.
_DROP_ORDER = [
    "notifications",
    "blocks",
    "safety_events",
    "safety_sessions",
    "trusted_contacts",
    "availability",
    "reviews",
    "messages",
    "match_participants",
    "matches",
    "plan_applications",
    "plans",
    "user_preferences",
    "users",
]


def upgrade() -> None:
    # 1. PostGIS debe estar antes de crear tablas con columnas geography.
    enable_postgis()

    # 2. Crea todas las tablas desde los modelos (una sola fuente de verdad).
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)

    # 3. Índices espaciales GiST para queries ST_DWithin eficientes.
    create_spatial_indexes()


def downgrade() -> None:
    # Borra en orden inverso de dependencias para respetar las FK.
    for table in _DROP_ORDER:
        op.drop_table(table)
