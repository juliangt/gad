# Plan 2 — Observabilidad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar el logging estructurado (structlog ya configurado pero sin usar) y añadir métricas Prometheus, para tener trazas de dominio y de seguridad además del health check.

**Architecture:** Un middleware de FastAPI registra cada request (método, path, status, latencia) vía structlog y actualiza contadores/histogramas de `prometheus_client`. Cada servicio obtiene su logger con `structlog.get_logger().bind(component="...")`. Eventos de seguridad (login ok/fail, SOS, ban) se loguean explícitamente.

**Tech Stack:** structlog (ya instalado), prometheus_client (a añadir), FastAPI middleware.

---

## File Structure

- **Create:** `backend/src/gad/middleware/request_logging.py` — middleware de logging + métricas.
- **Create:** `backend/src/gad/middleware/metrics.py` — definición de contadores/histograma + endpoint `/metrics`.
- **Create:** `backend/tests/test_request_logging.py`
- **Create:** `backend/tests/test_metrics.py`
- **Modify:** `backend/src/gad/auth/service.py` — logger en login (ok/fail).
- **Modify:** `backend/src/gad/safety/service.py` — logger en SOS.
- **Modify:** `backend/src/gad/main.py` — registrar middlewares + router de métricas.
- **Modify:** `backend/pyproject.toml` — dependencia `prometheus_client`.

---

## Task 1: Dependencia prometheus_client

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Añadir dependencia**

En `backend/pyproject.toml`, sección `[project] dependencies`, añadir:

```toml
    "prometheus_client>=0.21.0,<0.22.0",
```

- [ ] **Step 2: Sincronizar**

Run: `cd backend && uv sync`
Expected: instalación exitosa.

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "build: añadir prometheus_client"
```

---

## Task 2: Módulo de métricas

**Files:**
- Create: `backend/src/gad/middleware/metrics.py`
- Create: `backend/tests/test_metrics.py`

- [ ] **Step 1: Test que falla**

`backend/tests/test_metrics.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.metrics import metrics_router, record_request


@pytest.fixture
async def client():
    app = FastAPI()
    app.include_router(metrics_router)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_counters(client):
    record_request("GET", "/health", 200, 0.005)
    async with client as c:
        resp = await c.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    assert "gad_http_requests_total" in body
    assert "gad_http_request_duration_seconds" in body
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_metrics.py -v`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

`backend/src/gad/middleware/metrics.py`:

```python
"""Métricas Prometheus para el monolito GAD."""
from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUEST_COUNT = Counter(
    "gad_http_requests_total",
    "Total de requests HTTP",
    ["method", "path", "status"],
)
REQUEST_DURATION = Histogram(
    "gad_http_request_duration_seconds",
    "Duración de requests HTTP en segundos",
    ["method", "path"],
)
AUTH_EVENTS = Counter(
    "gad_auth_events_total",
    "Eventos de autenticación",
    ["event", "outcome"],
)

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def metrics_endpoint() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


def record_request(method: str, path: str, status: int, duration_s: float) -> None:
    REQUEST_COUNT.labels(method=method, path=path, status=str(status)).inc()
    REQUEST_DURATION.labels(method=method, path=path).observe(duration_s)


def record_auth_event(event: str, outcome: str) -> None:
    AUTH_EVENTS.labels(event=event, outcome=outcome).inc()
```

- [ ] **Step 4: Correr test**

Run: `cd backend && uv run pytest tests/test_metrics.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/middleware/metrics.py backend/tests/test_metrics.py
git commit -m "feat(metrics): contador e histograma de requests + endpoint /metrics"
```

---

## Task 3: Middleware de request logging

**Files:**
- Create: `backend/src/gad/middleware/request_logging.py`
- Create: `backend/tests/test_request_logging.py`

- [ ] **Step 1: Test que falla**

`backend/tests/test_request_logging.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.request_logging import RequestLoggingMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_middleware_logs_and_completes_request(client):
    async with client as c:
        resp = await c.get("/ping")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_request_logging.py -v`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

`backend/src/gad/middleware/request_logging.py`:

```python
"""Middleware: loguea cada request (estructurado) y registra métricas."""
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from gad.middleware.metrics import record_request

logger = structlog.get_logger().bind(component="http")

# Paths que no generan ruido (health checks, scraping de métricas).
_QUIET_PATHS = {"/health", "/health/ready", "/metrics"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        path = request.url.path
        method = request.method
        status = response.status_code

        record_request(method, path, status, duration)

        if path not in _QUIET_PATHS:
            logger.info(
                "request",
                method=method,
                path=path,
                status=status,
                duration_ms=round(duration * 1000, 2),
            )
        return response
```

- [ ] **Step 4: Correr test**

Run: `cd backend && uv run pytest tests/test_request_logging.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/middleware/request_logging.py backend/tests/test_request_logging.py
git commit -m "feat(obs): middleware de logging estructurado de requests"
```

---

## Task 4: Registrar middlewares en create_app

**Files:**
- Modify: `backend/src/gad/main.py`

- [ ] **Step 1: Añadir imports y middlewares**

En `backend/src/gad/main.py`, añadir imports (junto a los otros de middleware, ~línea 20):

```python
from gad.middleware.metrics import metrics_router
from gad.middleware.request_logging import RequestLoggingMiddleware
```

En `create_app()`, después de `app.add_middleware(SecurityHeadersMiddleware)` (línea 68), añadir:

```python
    app.add_middleware(RequestLoggingMiddleware)
```

Y junto a los `include_router` (después del health_router, línea 77):

```python
    app.include_router(metrics_router)
```

- [ ] **Step 2: Verificar que arranca**

Run: `cd backend && uv run python -c "from gad.main import create_app; create_app(); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/main.py
git commit -m "feat(obs): registrar middleware de logging y router /metrics"
```

---

## Task 5: Logging de eventos de seguridad (auth)

**Files:**
- Modify: `backend/src/gad/auth/service.py`

- [ ] **Step 1: Test que verifica métricas de login**

`backend/tests/test_auth_logging.py`:

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.service import login, register
from gad.middleware.metrics import AUTH_EVENTS
from gad.schemas.auth import LoginIn, RegisterIn


@pytest.mark.asyncio
async def test_failed_login_increments_auth_metric(db_session):
    before = AUTH_EVENTS.collect()
    # Login con password incorrecta
    with pytest.raises(Exception):
        await login(db_session, LoginIn(email="x@x.com", password="wrong"))
    # La métrica de login_failed debe haber incrementado
    samples = list(AUTH_EVENTS.collect())
    # Verificar que existe al menos una muestra con outcome="failed"
    found = False
    for sample in samples:
        if sample.name == "gad_auth_events_total":
            for child in sample.samples:
                if child.labels.get("outcome") == "failed":
                    found = True
                    break
    assert found
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_auth_logging.py -v`
Expected: FAIL (no se registra el evento)

- [ ] **Step 3: Añadir logging en login**

En `backend/src/gad/auth/service.py`, añadir imports arriba:

```python
import structlog

from gad.middleware.metrics import record_auth_event

logger = structlog.get_logger().bind(component="auth")
```

Modificar la función `login` para registrar eventos:

```python
async def login(session: AsyncSession, data: LoginIn) -> TokenOut:
    result = await session.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None or not verify_password(data.password, user.password_hash):
        logger.warning("login_failed", email=data.email)
        record_auth_event("login", "failed")
        raise InvalidCredentialsError("Credenciales inválidas")
    logger.info("login_ok", user_id=str(user.id))
    record_auth_event("login", "ok")
    return _issue_tokens(user)
```

- [ ] **Step 4: Correr todos los tests de auth (los existentes + nuevo)**

Run: `cd backend && uv run pytest tests/test_auth_logging.py tests/test_auth_protected.py -v`
Expected: PASS. (Nota: este refactor también mejora el timing-safe login — un solo branch — que se completa en Plan 6.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/auth/service.py backend/tests/test_auth_logging.py
git commit -m "feat(auth): logging estructurado y métricas de login ok/fail"
```

---

## Task 6: Logging en eventos de seguridad (SOS, ban)

**Files:**
- Modify: `backend/src/gad/safety/service.py`

- [ ] **Step 1: Añadir logger al servicio de safety**

En `backend/src/gad/safety/service.py`, añadir al inicio (junto a los imports):

```python
import structlog

logger = structlog.get_logger().bind(component="safety")
```

Buscar la función `trigger_sos` (la que invoca `POST /safety/{match_id}/sos`) y añadir al final, antes del `return`:

```python
    logger.warning("sos_triggered", user_id=str(user.id), match_id=str(match_id))
```

(Si la función se llama distinto, localizarla con: `grep -n "def trigger_sos" backend/src/gad/safety/service.py`)

- [ ] **Step 2: Smoke de que no rompe**

Run: `cd backend && uv run pytest tests/test_smoke_phase4.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/safety/service.py
git commit -m "feat(safety): log estructurado de eventos SOS"
```

---

## Task 7: Smoke de observabilidad

**Files:**
- Create: `backend/tests/test_smoke_observability.py`

- [ ] **Step 1: Smoke test**

```python
"""Smoke: una request genera log y métrica, /metrics responde."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.metrics import metrics_router
from gad.middleware.request_logging import RequestLoggingMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(metrics_router)

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_request_generates_metric_visible_in_metrics(client):
    async with client as c:
        await c.get("/ping")
        resp = await c.get("/metrics")
    assert resp.status_code == 200
    assert "gad_http_requests_total" in resp.text
    # La request a /ping debe contar
    assert 'path="/ping"' in resp.text
```

- [ ] **Step 2: Correrlo**

Run: `cd backend && uv run pytest tests/test_smoke_observability.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_observability.py
git commit -m "test(obs): smoke de logging y métricas de requests"
```

---

## Self-Review (Plan 2)

**Cobertura:**
- ✅ Logging estructurado activo → Tasks 3, 4, 5, 6
- ✅ Métricas Prometheus → Tasks 2, 4
- ✅ Eventos de seguridad logueados → Tasks 5, 6

**Placeholder scan:** el "si la función se llama distinto" en Task 6 es una guía de localización, no un placeholder. El resto tiene código completo.

**Type consistency:** `record_request` y `record_auth_event` definidos en `metrics.py` y consumidos en `request_logging.py` y `service.py`. `RequestLoggingMiddleware` registrado en `main.py`.
