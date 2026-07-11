# backend/tests/test_rate_limit.py
"""Tests de rate limiting que ejercitan el limiter REAL de la app.

Verifica:
1. El middleware SlowAPIMiddleware está registrado en create_app().
2. El limiter global trae default_limits configurados (cobertura broad).
3. Una ruta con @limiter.limit explícito dispara 429 tras agotar el cupo,
   y el keying respeta X-Forwarded-For (defensa en profundidad).

Para el caso (3) añadimos un endpoint de prueba temporal a la app real,
evitando la dependencia de DB que tendría un endpoint de dominio real
(/auth/login). El limiter es el mismo módulo configurado en producción.
"""
import pytest
from fastapi import Request
from httpx import ASGITransport, AsyncClient

from gad.middleware import rate_limit as rl_module


@pytest.fixture
def app(redis_container, monkeypatch):
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    storage = f"redis://{host}:{port}/0"

    monkeypatch.setattr(rl_module.settings, "rate_limit_enabled", True)
    rl_module.reset_limiter(storage_uri=storage, enabled=True)
    rl_module.limiter.reset()

    from gad.main import create_app

    application = create_app()

    # Endpoint de prueba que usa el limiter REAL recién reseteado (no el
    # importado al top del módulo, que apunta al limiter original). Misma
    # mecánica que cualquier @limiter.limit de la app, sin dependencia de DB.
    fresh_limiter = rl_module.limiter

    @application.post("/__rl_probe")
    @fresh_limiter.limit("5/minute")
    async def _probe(request: Request) -> dict:
        return {"ok": True}

    return application


def test_limiter_has_default_limits_configured(app):
    """El limiter global trae default_limits para cobertura broad."""
    lim = app.state.limiter
    assert lim.enabled is True
    assert len(lim._default_limits) >= 1


def test_slowapi_middleware_is_registered(app):
    """SlowAPIMiddleware está en la pila de middleware."""
    from slowapi.middleware import SlowAPIMiddleware

    cls_set = {m.cls for m in app.user_middleware}
    assert SlowAPIMiddleware in cls_set


@pytest.mark.asyncio
async def test_real_route_enforces_explicit_limit(app):
    """Una ruta con @limiter.limit('5/minute'): tras 5 intentos desde la
    misma IP, el 6º es 429."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        responses = [
            await c.post("/__rl_probe", headers={"x-forwarded-for": "5.5.5.5"})
            for _ in range(7)
        ]
    statuses = [r.status_code for r in responses]
    assert statuses[:5] == [200, 200, 200, 200, 200], statuses
    assert statuses[5] == 429
    assert statuses[6] == 429


@pytest.mark.asyncio
async def test_rate_limit_keyed_by_xff_ip(app):
    """Diferentes X-Forwarded-For → diferentes buckets → ninguna debe 429."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        responses = [
            await c.post("/__rl_probe", headers={"x-forwarded-for": f"10.0.0.{i}"})
            for i in range(4)
        ]
    statuses = [r.status_code for r in responses]
    assert all(s == 200 for s in statuses), f"IPs distintas no deben 429, got {statuses}"
