import pytest
from sqlalchemy import event, select

from gad.auth.service import register
from gad.models.enums import ActivityType, PlanMode
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan, list_nearby_plans
from gad.schemas.auth import RegisterIn


async def _user(session, email):
    t = await register(
        session, RegisterIn(email=email, password="12345678", display_name="U")
    )
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_list_nearby_no_n_plus_one(db_session):
    """list_nearby_plans con N planes emite O(1) queries, no O(N).

    Antes del fix: ~2N+1 selects (host + coords por plan).
    Después: selectinload(host) + columnas ST_X/ST_Y en la misma query.
    """
    host = await _user(db_session, "host_n1@example.com")
    viewer = await _user(db_session, "viewer_n1@example.com")

    for i in range(5):
        await create_plan(
            db_session,
            host,
            PlanIn(
                activity_type=ActivityType.coffee,
                mode=PlanMode.now,
                title=f"P{i}",
                location=PlanLocationIn(lat=-34.590 + i * 0.0001, lng=-58.43, label="X"),
            ),
        )

    # Contar queries SELECT en la sesión durante list_nearby_plans.
    queries: list[str] = []
    sync_engine = db_session.bind.sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.strip().lower().startswith("select"):
            queries.append(statement)

    try:
        plans = await list_nearby_plans(
            db_session, viewer=viewer, lat=-34.590, lng=-58.43, radius_m=5000
        )
        # Forzar acceso al host (simula construir HostSummary en el router).
        for p in plans:
            _ = p.host.display_name
    finally:
        event.remove(sync_engine, "before_cursor_execute", _capture)

    # Con 5 planes, antes eran ~2N+1 = 11 selects. Ahora deben ser muy pocos.
    assert len(queries) <= 4, (
        f"Esperaba <=4 selects, got {len(queries)}:\n"
        + "\n---\n".join(queries)
    )
