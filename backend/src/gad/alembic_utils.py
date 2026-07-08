# backend/src/gad/alembic_utils.py
"""Helpers para migraciones que necesitan PostGIS."""
from alembic import op


def enable_postgis() -> None:
    """Habilita la extensión PostGIS. Llamar al inicio de la migración inicial."""
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")


def create_spatial_indexes() -> None:
    """Crea índices GiST sobre las columnas geography para queries espaciales."""
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plans_location_grid "
        "ON plans USING GIST (location_grid);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_availability_location_grid "
        "ON availability USING GIST (location_grid);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_safety_sessions_last_ping_location "
        "ON safety_sessions USING GIST (last_ping_location);"
    )
