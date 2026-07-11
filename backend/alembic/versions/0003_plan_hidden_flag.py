"""add hidden_by_host column to plans

Añade hidden_by_host (bool, default false) a plans. El host puede ocultar
un plan de su propia vista ("Mis Planes") al cancelarlo/eliminarlo, sin
borrar el registro (preserva integridad referencial con applications,
matches y notificaciones).

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-10
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _has_column(table: str, column: str) -> bool:
    """True si la columna ya existe (la migración inicial create_all la pudo crear)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # 0001 crea el schema con create_all sobre los modelos actuales, que ya
    # incluyen esta columna. Guardamos idempotencia para DBs nuevas.
    if not _has_column("plans", "hidden_by_host"):
        op.add_column(
            "plans",
            sa.Column(
                "hidden_by_host",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    op.drop_column("plans", "hidden_by_host")
