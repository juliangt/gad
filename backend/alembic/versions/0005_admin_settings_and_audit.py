"""admin settings and audit tables

Crea las tablas de configuración global y auditoría:
  user_defaults, operational_settings, feature_flags, maintenance_state, audit_events.

Revision ID: 0005
Revises: 99b9b144cd51
Create Date: 2026-07-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "99b9b144cd51"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("user_defaults"):
        op.create_table(
            "user_defaults",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("default_plan_validity_mins", sa.Integer(), nullable=False),
            sa.Column("default_search_radius_m", sa.Integer(), nullable=False),
            sa.Column("age_range_min", sa.Integer(), nullable=False),
            sa.Column("age_range_max", sa.Integer(), nullable=False),
            sa.Column("group_size_preference", sa.String(length=30), nullable=False),
            sa.Column("gender_preference", sa.String(length=30), nullable=False),
            sa.Column("activity_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_user_defaults")),
        )

    if not _has_table("operational_settings"):
        op.create_table(
            "operational_settings",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("rate_limit_enabled", sa.Boolean(), nullable=False),
            sa.Column("default_rate_limit", sa.String(length=50), nullable=False),
            sa.Column("access_token_expire_minutes", sa.Integer(), nullable=False),
            sa.Column("refresh_token_expire_days", sa.Integer(), nullable=False),
            sa.Column("max_avatar_bytes", sa.Integer(), nullable=False),
            sa.Column("ws_max_message_rate", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_operational_settings")),
        )

    if not _has_table("feature_flags"):
        op.create_table(
            "feature_flags",
            sa.Column("key", sa.String(length=50), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("key", name=op.f("pk_feature_flags")),
        )

    if not _has_table("maintenance_state"):
        op.create_table(
            "maintenance_state",
            sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("banner_active", sa.Boolean(), nullable=False),
            sa.Column("banner_message", sa.Text(), nullable=False),
            sa.Column("banner_level", sa.String(length=10), nullable=False),
            sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name=op.f("fk_maintenance_state_updated_by_users")),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_maintenance_state")),
        )

    if not _has_table("audit_events"):
        op.create_table(
            "audit_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("action", sa.String(length=50), nullable=False),
            sa.Column("target_type", sa.String(length=30), nullable=False),
            sa.Column("target_id", sa.String(length=100), nullable=True),
            sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
        )
        op.create_index(op.f("ix_audit_events_action"), "audit_events", ["action"])


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_events_action"), table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("maintenance_state")
    op.drop_table("feature_flags")
    op.drop_table("operational_settings")
    op.drop_table("user_defaults")
