import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.service import login
from gad.middleware.metrics import AUTH_EVENTS
from gad.schemas.auth import LoginIn


@pytest.mark.asyncio
async def test_failed_login_increments_auth_metric(db_session):
    # Login con password incorrecta (usuario inexistente)
    with pytest.raises(Exception):
        await login(db_session, LoginIn(email="x@x.com", password="wrong"))
    # La métrica de login_failed debe haber incrementado
    found = False
    for metric in AUTH_EVENTS.collect():
        for child in metric.samples:
            if child.labels.get("outcome") == "failed":
                found = True
                break
    assert found
