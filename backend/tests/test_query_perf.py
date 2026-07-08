# backend/tests/test_query_perf.py
"""Test funcional: verifica que list_nearby_plans funciona correctamente
con múltiples planes y ordena por distancia."""
import pytest
from sqlalchemy import select

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
    return (
        await session.execute(select(User).where(User.id == t.user_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_list_nearby_with_multiple_plans(db_session):
    """La query no falla con varios planes y devuelve resultados ordenados por distancia."""
    host = await _user(db_session, "perf@example.com")
    viewer = await _user(db_session, "viewer@example.com")

    # Crear 3 planes a distintas distancias
    for lat in [-34.590, -34.591, -34.592]:
        await create_plan(
            db_session, host,
            PlanIn(
                activity_type=ActivityType.coffee, mode=PlanMode.now, title=f"Plan {lat}",
                location=PlanLocationIn(lat=lat, lng=-58.43, label="X"),
            ),
        )

    nearby = await list_nearby_plans(
        db_session, viewer=viewer, lat=-34.590, lng=-58.43, radius_m=5000
    )
    assert len(nearby) == 3
    # El más cercano primero
    assert nearby[0].title == "Plan -34.59"
