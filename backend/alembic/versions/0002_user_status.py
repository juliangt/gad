"""add user status and password_changed_at columns

Añade la columna status (enum) a users para soft-delete y suspensión, y
password_changed_at para invalidar tokens emitidos antes de un cambio de
contraseña (revocación por timestamp, sin trackear jtis).

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-08
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    userstatus = sa.Enum("active", "suspended", "deleted", name="userstatus")
    userstatus.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column(
            "status",
            userstatus,
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "status")
    sa.Enum(name="userstatus").drop(op.get_bind(), checkfirst=True)
