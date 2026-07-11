"""add_default_plan_validity_mins

Revision ID: 99b9b144cd51
Revises: 0004
Create Date: 2026-07-11 22:30:44.385410+00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '99b9b144cd51'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Add column with server_default so existing rows get populated
    op.add_column(
        'user_preferences',
        sa.Column('default_plan_validity_mins', sa.Integer(), nullable=False, server_default='120')
    )
    # Remove server default so future inserts use Python-level defaults
    op.alter_column('user_preferences', 'default_plan_validity_mins', server_default=None)


def downgrade() -> None:
    op.drop_column('user_preferences', 'default_plan_validity_mins')
