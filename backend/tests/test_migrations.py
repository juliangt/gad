# backend/tests/test_migrations.py
import pytest
import sqlalchemy as sa


@pytest.mark.asyncio
async def test_schema_has_all_expected_tables(db_session):
    """conftest crea el schema con Base.metadata.create_all(); verificamos que todas las
    tablas del spec existen."""
    from sqlalchemy import text

    result = await db_session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name;"
        )
    )
    tables = {row[0] for row in result}
    expected = {
        "users", "user_preferences", "plans", "plan_applications",
        "matches", "match_participants", "messages", "reviews",
        "availability", "trusted_contacts", "safety_sessions",
        "safety_events", "blocks", "notifications",
    }
    missing = expected - tables
    assert not missing, f"Faltan tablas: {missing}"


@pytest.mark.asyncio
async def test_user_status_column_exists(db_engine):
    """La migración 0002 añade la columna status a users."""
    async with db_engine.connect() as conn:
        cols = await conn.run_sync(
            lambda sync_conn: [
                c["name"] for c in sa.inspect(sync_conn).get_columns("users")
            ]
        )
    assert "status" in cols

