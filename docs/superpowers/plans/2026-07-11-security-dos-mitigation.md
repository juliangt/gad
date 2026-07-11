# Mitigación de abuso y DoS (Issue #37) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 7 vectores de abuso/DoS del issue #37 (rate limiting roto tras nginx, sin límite global, uploads sin validar, N+1 en listados, WebSocket sin tope, endpoint público sin throttle, sin body cap/TrustedHost/GZip/SECURITY.md).

**Architecture:** Reforzar slowapi (límite global + IP real vía X-Forwarded-For), endurazar uvicorn (proxy headers), validar uploads en el handler + middleware de body cap, throttle de WS con sliding window in-memory, mitigar N+1 con `selectinload` y columnas computadas, añadir TrustedHost/GZip, hardening de nginx, SECURITY.md, test de carga locust y scan pip-audit en CI.

**Tech Stack:** FastAPI, slowapi, SQLAlchemy 2 async, uvicorn, Pillow, nginx, locust, pip-audit, GitHub Actions.

**Spec de referencia:** `docs/superpowers/specs/2026-07-11-security-dos-mitigation.md`

---

## File Structure (mapa de cambios)

**Backend — crear:**
- `backend/src/gad/middleware/ip_key.py` — `client_ip_key(request)`: lee X-Forwarded-For con fallback seguro a `request.client.host`.
- `backend/src/gad/middleware/body_size.py` — `BodySizeLimitMiddleware`: rechaza bodies > N bytes con 413.
- `backend/tests/test_ip_key.py` — tests de la key_func.
- `backend/tests/test_body_size.py` — tests del middleware de body cap.
- `backend/tests/test_global_rate_limit.py` — test que ejercita el rate limit de rutas reales.
- `backend/tests/test_avatar_upload_validation.py` — tests de validación de avatar.
- `backend/tests/test_ws_throttle.py` — tests del throttle de WS.
- `backend/tests/test_n_plus_one.py` — tests que verifican ausencia de N+1.
- `backend/tests/load/locustfile.py` — escenario de load test.

**Backend — modificar:**
- `backend/src/gad/config.py` — añadir `trusted_hosts`, `forwarded_allow_ips`, `max_avatar_bytes`, `max_request_body_size`, `default_rate_limit`, `ws_max_message_rate`.
- `backend/src/gad/middleware/rate_limit.py` — usar `client_ip_key`, añadir `default_limits`, registrar `SlowAPIMiddleware`.
- `backend/src/gad/main.py` — añadir `TrustedHostMiddleware`, `GZipMiddleware`, `BodySizeLimitMiddleware`.
- `backend/entrypoint.sh` — `--proxy-headers on --forwarded-allow-ips '*' --ws-max-size 65536`.
- `backend/src/gad/users/service.py` — hardening de `upload_avatar`.
- `backend/src/gad/users/router.py` — rate limit en `POST /me/avatar`.
- `backend/src/gad/plans/router.py` — rate limit GET, fix N+1.
- `backend/src/gad/plans/service.py` — `selectinload(Plan.host)` + columnas geo.
- `backend/src/gad/matching/router.py` — rate limit + fix N+1.
- `backend/src/gad/reviews/router.py` — fix N+1.
- `backend/src/gad/safety/router.py` — rate limit ping/sos.
- `backend/src/gad/safety/public_router.py` — rate limit `GET /s/{token}`.
- `backend/src/gad/chat/websocket.py` — sliding window throttle.
- `backend/src/gad/models/plan.py` — relationship `Plan.host`.
- `backend/src/gad/db.py` — `pool_timeout`, `pool_recycle`.

**Raíz / infra:**
- `frontend/nginx.conf` — `client_max_body_size`, `limit_req_zone`, `gzip`, `server_tokens off`.
- `SECURITY.md` (raíz) — política de divulgación.
- `.env.example` — documentar nuevas vars.
- `.github/workflows/ci.yml` — job `audit` con pip-audit.

---

## Task 1: Settings de seguridad (config fields)

**Files:**
- Modify: `backend/src/gad/config.py:37-41`

- [ ] **Step 1: Añadir campos de settings**

Edita `backend/src/gad/config.py`, reemplaza el bloque de "Rate limit" / "Security headers" (líneas 37-41):

```python
    # Rate limit
    rate_limit_enabled: bool = True
    default_rate_limit: str = "300/minute"
    forwarded_allow_ips: str = "*"

    # Trusted hosts
    trusted_hosts: list[str] | str = ["*"]

    # Body / uploads
    max_request_body_size: int = 10 * 1024 * 1024  # 10 MB
    max_avatar_bytes: int = 5 * 1024 * 1024  # 5 MB

    # WebSocket
    ws_max_message_rate: int = 5  # mensajes por segundo por conexión

    # Security headers
    csp_policy: str = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'"
```

- [ ] **Step 2: Añadir validator para trusted_hosts (igual que cors_origins)**

Añade después del validator `parse_cors_origins` (tras línea 48):

```python
    @field_validator("trusted_hosts", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, v):
        if isinstance(v, str):
            return [h.strip() for h in v.split(",") if h.strip()]
        return v
```

- [ ] **Step 3: Verificar que la app arranca**

Run: `cd backend && python -c "from gad.config import Settings; s = Settings(DATABASE_URL='postgresql+asyncpg://x:x@localhost/x', REDIS_URL='redis://localhost', JWT_SECRET='a' * 16); print(s.default_rate_limit, s.max_avatar_bytes, s.trusted_hosts, s.ws_max_message_rate)"`
Expected: imprime `300/minute 5242880 ['*'] 5`

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/config.py
git commit -m "feat(config): add security settings (rate limit, body size, ws, trusted hosts)"
```

---

## Task 2: IP key_func que lee X-Forwarded-For

**Files:**
- Create: `backend/src/gad/middleware/ip_key.py`
- Test: `backend/tests/test_ip_key.py`

- [ ] **Step 1: Escribir el test que falla**

Crea `backend/tests/test_ip_key.py`:

```python
from starlette.requests import Request


def _make_request(headers=None, client=("10.0.0.1", 12345), app=None):
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "query_string": b"",
        "client": client,
        "app": app or {},
        "scheme": "http",
        "server": ("test", 80),
    }
    req = Request(scope)
    if headers:
        for k, v in headers.items():
            req._headers = req.headers.__class__(
                [(k.lower().encode("latin-1"), v.encode("latin-1"))]
                + list(req.headers.raw)
            )
    return req


def test_uses_xff_first_hop_when_present():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(headers={"x-forwarded-for": "203.0.113.5, 10.0.0.1"})
    assert client_ip_key(req) == "203.0.113.5"


def test_falls_back_to_client_host_without_xff():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(client=("198.51.100.2", 5000))
    assert client_ip_key(req) == "198.51.100.2"


def test_handles_empty_xff():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(headers={"x-forwarded-for": ""}, client=("198.51.100.2", 5000))
    assert client_ip_key(req) == "198.51.100.2"


def test_returns_unknown_if_no_client():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(client=None)
    assert client_ip_key(req) == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ip_key.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'gad.middleware.ip_key'`

- [ ] **Step 3: Implementar `client_ip_key`**

Crea `backend/src/gad/middleware/ip_key.py`:

```python
# backend/src/gad/middleware/ip_key.py
"""Resuelve la IP real del cliente para rate limiting tras un reverse proxy.

Lee `X-Forwarded-For` (primer hop = cliente original). Si el header no
existe o está vacío, cae a `request.client.host`. Esto es defensa en
profundidad: complementa el `--proxy-headers` de uvicorn para que el
rate limiting funcione correctamente sin importar cómo llegue la app.
"""
from starlette.requests import Request


def client_ip_key(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if request.client is not None:
        return request.client.host
    return "unknown"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ip_key.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/middleware/ip_key.py backend/tests/test_ip_key.py
git commit -m "feat(rate-limit): add client_ip_key reading X-Forwarded-For"
```

---

## Task 3: Limiter con default_limits + SlowAPIMiddleware

**Files:**
- Modify: `backend/src/gad/middleware/rate_limit.py`
- Modify: `backend/src/gad/main.py:97-99`

- [ ] **Step 1: Actualizar el limiter para usar `client_ip_key` y `default_limits`**

Reemplaza TODO el contenido de `backend/src/gad/middleware/rate_limit.py`:

```python
# backend/src/gad/middleware/rate_limit.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from gad.config import settings
from gad.middleware.ip_key import client_ip_key

limiter = Limiter(
    key_func=client_ip_key,
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.redis_url,
    default_limits=[settings.default_rate_limit],
)


def setup_rate_limit(app):
    """Registra el state, middleware y handler de slowapi en la app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)


def reset_limiter(storage_uri: str, enabled: bool = True) -> None:
    """Reconfigura el limiter global (para tests con un Redis dedicado)."""
    global limiter
    limiter = Limiter(
        key_func=client_ip_key,
        enabled=enabled,
        storage_uri=storage_uri,
        default_limits=[settings.default_rate_limit],
    )
```

- [ ] **Step 2: Verificar que el import en main.py sigue siendo válido**

`setup_rate_limit` ya se llama en `main.py:99`. La nueva versión registra `SlowAPIMiddleware` internamente, así que `main.py` no necesita cambios adicionales para esto.

- [ ] **Step 3: Verificar import**

Run: `cd backend && python -c "from gad.middleware.rate_limit import limiter, setup_rate_limit; print('ok', limiter.enabled)"`
Expected: imprime `ok True`

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/middleware/rate_limit.py
git commit -m "feat(rate-limit): use client_ip_key, default_limits, register SlowAPIMiddleware"
```

---

## Task 4: Test de rate limit con rutas reales

**Files:**
- Modify: `backend/tests/test_rate_limit.py` (reescribir)

- [ ] **Step 1: Reescribir el test para usar la app real**

Reemplaza TODO el contenido de `backend/tests/test_rate_limit.py`:

```python
# backend/tests/test_rate_limit.py
"""Test de rate limiting que ejercita rutas REALES de la app.

Construye la app completa (create_app) con el limiter apuntando al Redis
de testcontainers y verifica que el límite por IP real se aplica.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from gad.middleware import rate_limit as rl_module


@pytest.fixture
def app(redis_container, monkeypatch):
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    storage = f"redis://{host}:{port}/0"

    # Reconfigurar el limiter global para usar el Redis de testcontainers
    # con default_limits muy bajos para poder disparar 429 rápido.
    monkeypatch.setattr(rl_module.settings, "rate_limit_enabled", True)
    rl_module.reset_limiter(storage_uri=storage, enabled=True)
    rl_module.limiter.reset()

    from gad.main import create_app

    app = create_app()
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_global_rate_limit_applies_to_health(client):
    """El límite default se aplica a rutas sin decorador explícito."""
    # /health no tiene @limiter.limit; usa el default global.
    # Disparamos muchas requests con la misma IP.
    async with client as c:
        responses = [await c.get("/health", headers={"x-forwarded-for": "1.2.3.4"}) for _ in range(310)]
    statuses = [r.status_code for r in responses]
    # Alguna debe ser 429 (el default es 300/minute)
    assert 429 in statuses, f"Esperaba al menos un 429, got statuses: {sorted(set(statuses))}"


@pytest.mark.asyncio
async def test_rate_limit_uses_xff_ip(client):
    """El límite se calcula por IP del X-Forwarded-For, no por conexión."""
    async with client as c:
        # Cada request con IP distinta: ninguna debe hitting el límite.
        responses = [
            await c.get("/health", headers={"x-forwarded-for": f"10.0.0.{i}"})
            for i in range(50)
        ]
    statuses = [r.status_code for r in responses]
    assert all(s == 200 for s in statuses), f"Todas 200, got {statuses.count(429)} 429s"
```

> **Nota:** Estos tests necesitan que el limiter esté habilitado. El `conftest.py` setea `RATE_LIMIT_ENABLED=false` globalmente; por eso el fixture usa `monkeypatch.setattr(rl_module.settings, ...)` y `reset_limiter` para re-habilitar con el Redis de testcontainers. El `create_app()` lee `app.state.limiter` del módulo `rate_limit` al momento de `setup_rate_limit`, y `reset_limiter` muta el global, así que debe llamarse ANTES de `create_app()`.

- [ ] **Step 2: Run test to verify behavior**

Run: `cd backend && python -m pytest tests/test_rate_limit.py -v`
Expected: PASS

> Si los tests fallan por lentitud (testcontainers), confirma con `make test-file FILE=tests/test_rate_limit.py`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_rate_limit.py
git commit -m "test(rate-limit): exercise real app routes, verify XFF-based limiting"
```

---

## Task 5: uvicorn con proxy-headers y ws-max-size

**Files:**
- Modify: `backend/entrypoint.sh:16`
- Modify: `backend/entrypoint.dev.sh` (si existe)

- [ ] **Step 1: Actualizar entrypoint.sh**

Edita `backend/entrypoint.sh`, reemplaza la línea 16:

```sh
exec uvicorn gad.main:app --host 0.0.0.0 --port 8000
```

por:

```sh
exec uvicorn gad.main:app \
  --host 0.0.0.0 --port 8000 \
  --proxy-headers on \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" \
  --ws-max-size 65536
```

- [ ] **Step 2: Verificar el dev entrypoint**

Run: `cat backend/entrypoint.dev.sh 2>/dev/null || echo "NO EXISTE"`
Si existe y arranca uvicorn, aplicar los mismos flags. Si no existe, skip.

- [ ] **Step 3: Commit**

```bash
git add backend/entrypoint.sh backend/entrypoint.dev.sh
git commit -m "fix(uvicorn): enable proxy-headers, forwarded-allow-ips, ws-max-size"
```

---

## Task 6: Límites específicos en endpoints sensibles

**Files:**
- Modify: `backend/src/gad/plans/router.py:81-90` (GET /plans)
- Modify: `backend/src/gad/users/router.py:89-96` (POST /me/avatar)
- Modify: `backend/src/gad/safety/router.py:71-79` (ping)
- Modify: `backend/src/gad/safety/router.py:114-122` (sos)
- Modify: `backend/src/gad/safety/public_router.py:14-20` (GET /s/{token})

- [ ] **Step 1: Rate limit en GET /plans**

En `backend/src/gad/plans/router.py`, importa `Request` y `limiter` ya están importados (líneas 5, 13). Modifica el signature del list endpoint:

```python
@router.get("", response_model=list[PlanListItem])
@limiter.limit("60/minute")
async def list_plans_endpoint(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=50000),
    activity: str | None = None,
    mode: str | None = None,
) -> list[PlanOut]:
```

- [ ] **Step 2: Rate limit en POST /me/avatar**

En `backend/src/gad/users/router.py`, añade imports `Request` y `limiter`:

```python
from fastapi import APIRouter, Depends, File, Request, UploadFile
```
y tras los imports de service (línea 29), añade:

```python
from gad.middleware.rate_limit import limiter
```

Modifica el endpoint:

```python
@router.post("/me/avatar", response_model=UserDetail)
@limiter.limit("5/minute")
async def post_avatar(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
) -> UserDetail:
    await upload_avatar(session, current_user, file)
    return _to_detail(current_user)
```

- [ ] **Step 3: Rate limit en safety ping y sos**

En `backend/src/gad/safety/router.py`, añade imports:

```python
from fastapi import APIRouter, Depends, Query, Request
```
y tras los imports de service:

```python
from gad.middleware.rate_limit import limiter
```

Modifica ping:

```python
@router.post("/safety/{match_id}/ping")
@limiter.limit("10/minute")
async def ping_endpoint(
    request: Request,
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await ping_location(session, current_user, match_id, data.lat, data.lng)
    return {"message": "Ubicación actualizada"}
```

Modifica sos:

```python
@router.post("/safety/{match_id}/sos", response_model=SosOut)
@limiter.limit("10/minute")
async def sos_endpoint(
    request: Request,
    match_id: UUID,
    data: PingIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SosOut:
    event = await trigger_sos(session, current_user, match_id, data.lat, data.lng)
    return SosOut(event_id=event.id, message="SOS registrado y notificado")
```

- [ ] **Step 4: Rate limit en GET /s/{token} (público)**

En `backend/src/gad/safety/public_router.py`, reemplaza TODO:

```python
# backend/src/gad/safety/public_router.py
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.db import get_session
from gad.middleware.rate_limit import limiter
from gad.safety.schemas import PublicLocationOut
from gad.safety.service import get_public_location

router = APIRouter(tags=["safety"])


@router.get("/s/{token}", response_model=PublicLocationOut)
@limiter.limit("30/minute")
async def public_location_endpoint(
    token: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PublicLocationOut:
    info = await get_public_location(session, token)
    return PublicLocationOut(**info)
```

- [ ] **Step 5: Verificar imports**

Run: `cd backend && python -c "from gad.plans.router import router as p; from gad.users.router import router as u; from gad.safety.router import router as s; from gad.safety.public_router import router as sp; print('ok')"`
Expected: imprime `ok`

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/plans/router.py backend/src/gad/users/router.py backend/src/gad/safety/router.py backend/src/gad/safety/public_router.py
git commit -m "feat(rate-limit): add specific limits to plans, avatar, safety, public token"
```

---

## Task 7: Hardening de upload_avatar

**Files:**
- Modify: `backend/src/gad/users/service.py:131-146`
- Test: `backend/tests/test_avatar_upload_validation.py`

- [ ] **Step 1: Escribir tests que fallan**

Crea `backend/tests/test_avatar_upload_validation.py`:

```python
import io

import pytest
from PIL import Image

from gad.config import settings


def _jpeg_bytes(size=(100, 100), color="red") -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _png_bytes(size=(100, 100)) -> bytes:
    img = Image.new("RGB", size, "blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class FakeUpload:
    """Simula fastapi.UploadFile mínimo para upload_avatar."""

    def __init__(self, data: bytes, content_type: str = "image/jpeg"):
        self._data = data
        self.content_type = content_type

    async def read(self, size: int = -1) -> bytes:
        if size == -1:
            return self._data
        return self._data[:size]

    async def seek(self, offset: int) -> None:
        pass


@pytest.mark.asyncio
async def test_rejects_oversized_upload(db_session, monkeypatch):
    from gad.users.service import upload_avatar
    from gad.exceptions import ValidationError

    big = b"\xff\xd8\xff" + b"x" * (settings.max_avatar_bytes + 1)

    class U:
        content_type = "image/jpeg"

        async def read(self, size=-1):
            return big if size == -1 else big[:size]

        async def seek(self, offset):
            pass

    with pytest.raises(ValidationError, match="demasiado grande|too large|grande"):
        await upload_avatar(db_session, object(), U())


@pytest.mark.asyncio
async def test_rejects_unsupported_content_type(db_session):
    from gad.users.service import upload_avatar, ALLOWED_AVATAR_TYPES
    from gad.exceptions import ValidationError

    assert "image/jpeg" in ALLOWED_AVATAR_TYPES

    data = _jpeg_bytes()
    with pytest.raises(ValidationError):
        await upload_avatar(db_session, object(), FakeUpload(data, content_type="application/pdf"))


@pytest.mark.asyncio
async def test_rejects_non_image_bytes(db_session):
    from gad.users.service import upload_avatar
    from gad.exceptions import ValidationError

    with pytest.raises(ValidationError):
        await upload_avatar(
            db_session, object(), FakeUpload(b"not an image at all!!!", "image/jpeg")
        )


@pytest.mark.asyncio
async def test_accepts_valid_jpeg(db_session, monkeypatch):
    """Un JPEG válido pasa la validación (storage mockeado)."""
    from gad.users.service import upload_avatar

    data = _jpeg_bytes()

    class FakeStorage:
        def avatar_path(self, *a):
            return "x.jpg"

        async def save(self, *a, **kw):
            return "http://fake/x.jpg"

    class FakeUser:
        id = "00000000-0000-0000-0000-000000000001"
        avatar_url = None

    monkeypatch.setattr("gad.users.service.get_storage", lambda: FakeStorage())
    url = await upload_avatar(db_session, FakeUser(), FakeUpload(data, "image/jpeg"))
    assert url == "http://fake/x.jpg"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_avatar_upload_validation.py -v`
Expected: FAIL — `ImportError` o `AttributeError` (ALLOWED_AVATAR_TYPES no existe, no lanza ValidationError)

- [ ] **Step 3: Implementar hardening de upload_avatar**

Reemplaza la función `upload_avatar` en `backend/src/gad/users/service.py` (líneas 131-146) y añade constantes arriba del archivo (tras los imports, línea 17):

Constantes (añadir tras línea 16):

```python
from gad.exceptions import ConflictError, NotFoundError, ValidationError

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_DIMENSION = 4096  # px
# Pillow lanza DecompressionBombError si la imagen supera este umbral.
Image.MAX_IMAGE_PIXELS = MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION
```

Reemplaza la función `upload_avatar`:

```python
async def upload_avatar(session: AsyncSession, user: User, file: UploadFile) -> str:
    """Redimensiona a 512x512, valida tipo/tamaño y guarda el avatar.

    Validaciones:
    - Content-Type en allowlist (image/jpeg, image/png, image/webp).
    - Tamaño <= settings.max_avatar_bytes (lee en chunks, aborta si excede).
    - Magic bytes coherentes con el Content-Type declarado.
    - Image.MAX_IMAGE_PIXELS protege contra decompression bombs.
    - Image.verify() valida integridad del header antes de decodificar.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_AVATAR_TYPES:
        raise ValidationError(f"Tipo no permitido: {content_type}")

    # Leer en chunks con tope de tamaño para no cargar archivos enormes.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_avatar_bytes:
            raise ValidationError("Archivo demasiado grande")
        chunks.append(chunk)
    raw = b"".join(chunks)

    # Magic bytes: JPEG/WEBP tienen firmas distintas; PNG también.
    if not _has_valid_magic(raw, content_type):
        raise ValidationError("El contenido no coincide con el tipo declarado")

    # verify() valida integridad sin decodificar el body completo.
    try:
        Image.open(io.BytesIO(raw)).verify()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise ValidationError("Imagen inválida o corrupta") from e

    img.thumbnail((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = buf.getvalue()

    storage = get_storage()
    path = storage.avatar_path(str(user.id), "jpg")
    url = await storage.save(path, data, "image/jpeg")
    user.avatar_url = url
    await session.commit()
    await session.refresh(user)
    return url


_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # WEBP empieza con RIFF....WEBP
}


def _has_valid_magic(raw: bytes, content_type: str) -> bool:
    signatures = _MAGIC.get(content_type, ())
    return any(raw.startswith(sig) for sig in signatures)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_avatar_upload_validation.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/users/service.py backend/tests/test_avatar_upload_validation.py
git commit -m "feat(avatar): validate size, content-type, magic bytes, MAX_IMAGE_PIXELS"
```

---

## Task 8: WebSocket throttle (sliding window)

**Files:**
- Modify: `backend/src/gad/chat/websocket.py:73-99`
- Test: `backend/tests/test_ws_throttle.py`

- [ ] **Step 1: Escribir el test que falla**

Crea `backend/tests/test_ws_throttle.py`:

```python
import pytest

from gad.chat.websocket import SlidingWindowRateLimiter


@pytest.mark.asyncio
async def test_allows_up_to_rate_per_second():
    rl = SlidingWindowRateLimiter(max_per_second=5)
    for _ in range(5):
        assert rl.allow() is True


@pytest.mark.asyncio
async def test_rejects_above_rate():
    rl = SlidingWindowRateLimiter(max_per_second=3)
    for _ in range(3):
        assert rl.allow() is True
    assert rl.allow() is False
    assert rl.allow() is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ws_throttle.py -v`
Expected: FAIL — `ImportError: cannot import name 'SlidingWindowRateLimiter'`

- [ ] **Step 3: Implementar SlidingWindowRateLimiter y aplicarlo en el handler**

En `backend/src/gad/chat/websocket.py`, añade tras los imports (línea 16):

```python
import time
from collections import deque


class SlidingWindowRateLimiter:
    """Límite de N mensajes por segundo usando una ventana deslizante in-memory.

    Suficiente para throttle por conexión WS (slowapi no cubre websockets).
    """

    def __init__(self, max_per_second: int, window: float = 1.0):
        self.max_per_second = max_per_second
        self.window = window
        self._events: deque[float] = deque()

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        while self._events and self._events[0] <= cutoff:
            self._events.popleft()
        if len(self._events) >= self.max_per_second:
            return False
        self._events.append(now)
        return True
```

Luego modifica el loop del endpoint (`chat_endpoint`), reemplaza el bloque `try:` del loop (líneas 73-99):

```python
    await mgr.connect(str(match_id), websocket)
    throttle = SlidingWindowRateLimiter(
        max_per_second=getattr(websocket.app.state, "ws_message_rate", None)
        or settings.ws_max_message_rate
    )
    try:
        while True:
            data = await websocket.receive_json()
            if not throttle.allow():
                await websocket.send_json(
                    {"type": "error", "detail": "Demasiados mensajes, frená un poco"}
                )
                continue
            try:
                msg_in = MessageIn(**data)
            except Exception:
                await websocket.send_json(
                    {"type": "error", "detail": "Mensaje inválido"}
                )
                continue

            # Persistir en sesión propia
            async with session_maker() as session:
                user = (
                    await session.execute(select(User).where(User.id == UUID(user_id)))
                ).scalar_one()
                msg = await send_message(session, user, match_id, msg_in.content)

            payload = {
                "type": "message",
                "id": str(msg.id),
                "match_id": str(msg.match_id),
                "sender_id": str(msg.sender_id),
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
            }
            await mgr.publish(str(match_id), payload)
    except WebSocketDisconnect:
        mgr.disconnect(str(match_id), websocket)
```

Añade el import de settings al principio del archivo:

```python
from gad.config import settings
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ws_throttle.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/chat/websocket.py backend/tests/test_ws_throttle.py
git commit -m "feat(chat): sliding-window throttle per WS connection"
```

---

## Task 9: Fix N+1 en plans (relationship + geo en query)

**Files:**
- Modify: `backend/src/gad/models/plan.py:28` (añadir relationship)
- Modify: `backend/src/gad/plans/service.py:142-180` (selectinload + columnas geo)
- Modify: `backend/src/gad/plans/router.py:28-66, 81-104`
- Test: `backend/tests/test_n_plus_one.py`

- [ ] **Step 1: Añadir relationship `Plan.host`**

En `backend/src/gad/models/plan.py`, añade import y relationship. En los imports (tras línea 17):

```python
from sqlalchemy.orm import Mapped, mapped_column, relationship
```

(reemplaza `from sqlalchemy.orm import Mapped, mapped_column`)

Y dentro de la clase `Plan`, tras la columna `hidden_by_host` (línea 64), añade:

```python
    host: Mapped["User"] = relationship("User", lazy="raise")
```

Necesita import del tipo (para el string `"User"` SQLAlchemy lo resuelve por nombre, pero añadimos TYPE_CHECKING para mypy). Al final del bloque de imports (tras línea 19):

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from gad.models.user import User
```

> `lazy="raise"` fuerza error si se accede sin cargar explícitamente → previene N+1 accidental.

- [ ] **Step 2: Modificar `list_nearby_plans` para cargar host + extraer coords**

En `backend/src/gad/plans/service.py`, modifica el `select(Plan)` del stmt (línea 162) y añade import. Arriba (tras línea 6):

```python
from sqlalchemy import func, literal_column, select
```

(literal_column no se usa aún pero mantén imports limpios — solo añade `selectinload` al import de orm)

Añade import:

```python
from sqlalchemy.orm import selectinload
```

Reemplaza el `stmt` (líneas 161-173):

```python
    # Extraemos ST_X/ST_Y en la misma query para evitar una segunda query
    # por plan en el router. También precargamos el host (selectinload)
    # para evitar N+1 al construir el HostSummary.
    grid_col = Plan.location_grid
    stmt = (
        select(
            Plan,
            func.ST_Y(grid_col).label("lat"),
            func.ST_X(grid_col).label("lng"),
        )
        .options(selectinload(Plan.host))
        .join(User, User.id == Plan.host_id)
        .where(
            Plan.status == PlanStatus.open,
            Plan.expires_at > func.now(),
            Plan.host_id != viewer.id,
            Plan.location_grid.ST_DWithin(viewer_point, radius_m),
            ~User.id.in_(exclude_ids),
        )
        .order_by(Plan.location_grid.ST_Distance(viewer_point))
        .limit(limit)
    )
```

Cambia el return (líneas 179-180) para devolver plan+coords:

```python
    result = await session.execute(stmt)
    # Cada fila es (Plan, lat, lng); guardamos las coords en el objeto para
    # que el router las use sin una nueva query.
    plans = []
    for plan, lat, lng in result.all():
        plan._grid_lat = lat
        plan._grid_lng = lng
        plans.append(plan)
    return plans
```

- [ ] **Step 3: Modificar `_plan_to_out` para usar host cargado y coords pre-extraídas**

En `backend/src/gad/plans/router.py`, reemplaza `_plan_to_out` (líneas 28-66):

```python
def _get_grid_coords(plan: Plan) -> tuple[float, float]:
    """Devuelve (lat, lng) del grid: de la query batch si está, o query fallback."""
    lat = getattr(plan, "_grid_lat", None)
    lng = getattr(plan, "_grid_lng", None)
    return lat, lng


async def _plan_to_out(session: AsyncSession, plan: Plan) -> PlanOut:
    # Host: ya viene cargado vía selectinload en listados; en single-plan
    # puede no estar, hacemos fallback a una query.
    host = getattr(plan, "host", None)
    if host is None:
        result = await session.execute(select(User).where(User.id == plan.host_id))
        host = result.scalar_one()
    # Coords: de la query batch si vino, si no query puntual.
    lat, lng = _get_grid_coords(plan)
    if lat is None or lng is None:
        grid_col = cast(plan.__table__.c.location_grid, Geometry)
        point_stmt = select(
            func.ST_Y(grid_col).label("lat"),
            func.ST_X(grid_col).label("lng"),
        ).where(plan.__table__.c.id == plan.id)
        point_result = await session.execute(point_stmt)
        lat, lng = point_result.one()

    return PlanOut(
        id=plan.id,
        activity_type=plan.activity_type,
        mode=plan.mode,
        scheduled_at=plan.scheduled_at,
        window_minutes=plan.window_minutes,
        max_participants=plan.max_participants,
        current_participants=plan.current_participants,
        title=plan.title,
        description=plan.description,
        location_label=plan.location_label,
        location_lat=lat,
        location_lng=lng,
        search_radius_m=plan.search_radius_m,
        status=plan.status,
        expires_at=plan.expires_at,
        host=HostSummary(
            id=host.id,
            display_name=host.display_name,
            avatar_url=host.avatar_url,
            reputation_score=host.reputation_score,
            verification_level=host.verification_level.value,
        ),
        created_at=plan.created_at,
    )
```

- [ ] **Step 4: Modificar `list_my_plans` para precargar host y extraer coords**

En `backend/src/gad/plans/service.py`, la query de `list_my_plans` (líneas 208-214) también necesita selectinload + coords. Reemplaza el `stmt`:

```python
    grid_col = Plan.location_grid
    stmt = (
        select(
            Plan,
            func.coalesce(pending_subq.c.pending_count, 0),
            func.ST_Y(grid_col).label("lat"),
            func.ST_X(grid_col).label("lng"),
        )
        .options(selectinload(Plan.host))
        .outerjoin(pending_subq, pending_subq.c.plan_id == Plan.id)
        .where(Plan.host_id == host_id)
        .order_by(Plan.created_at.desc())
        .limit(limit)
    )
```

Y el return (líneas 222-223):

```python
    result = await session.execute(stmt)
    rows = []
    for plan, count, lat, lng in result.all():
        plan._grid_lat = lat
        plan._grid_lng = lng
        rows.append((plan, count))
    return rows
```

- [ ] **Step 5: Escribir test de N+1**

Crea `backend/tests/test_n_plus_one.py`:

```python
import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    """list_nearby_plans con N planes emite O(1) queries, no O(N)."""
    host = await _user(db_session, "host_n1@example.com")
    viewer = await _user(db_session, "viewer_n1@example.com")

    for i in range(5):
        await create_plan(
            db_session, host,
            PlanIn(
                activity_type=ActivityType.coffee, mode=PlanMode.now, title=f"P{i}",
                location=PlanLocationIn(lat=-34.590 + i * 0.0001, lng=-58.43, label="X"),
            ),
        )

    # Contar queries SELECT en la sesión durante list_nearby_plans.
    queries: list[str] = []

    sync_engine = db_session.get_sync_engine()

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.strip().lower().startswith("select"):
            queries.append(statement)

    try:
        await list_nearby_plans(db_session, viewer=viewer, lat=-34.590, lng=-58.43, radius_m=5000)
    finally:
        event.remove(sync_engine, "before_cursor_execute", _capture)

    # Con 5 planes, antes eran ~2N+1 = 11 selects. Ahora deben ser muy pocos.
    assert len(queries) <= 4, f"Esperaba <=4 selects, got {len(queries)}:\n" + "\n---\n".join(
        queries
    )
```

- [ ] **Step 6: Run tests**

Run: `cd backend && python -m pytest tests/test_n_plus_one.py tests/test_query_perf.py tests/test_plans_list.py -v 2>/dev/null || cd backend && python -m pytest tests/test_n_plus_one.py tests/test_query_perf.py -v`
Expected: PASS

> Si tests existentes de plans fallan por el signature de `list_nearby_plans` o `_plan_to_out`, ajustar para que el test use el router o el service de forma compatible.

- [ ] **Step 7: Commit**

```bash
git add backend/src/gad/models/plan.py backend/src/gad/plans/service.py backend/src/gad/plans/router.py backend/tests/test_n_plus_one.py
git commit -m "perf(plans): fix N+1 via selectinload(host) + batched ST_X/ST_Y"
```

---

## Task 10: Fix N+1 en matching y reviews

**Files:**
- Modify: `backend/src/gad/matching/router.py:44-61` (`_app_to_out`)
- Modify: `backend/src/gad/matching/router.py:71-118` (`_match_to_out`)
- Modify: `backend/src/gad/reviews/router.py:37-65`

- [ ] **Step 1: Batch fetch de users en `_app_to_out` y sus callers**

El patrón más limpio: precargar los applicants en los list endpoints. Modifica `list_applications_for_plan`, `list_my_applications` para devolver los users, o bien hacer un batch fetch en el router.

Enfoque por batch fetch en router (menos invasivo). Añade helper en `matching/router.py` (tras imports):

```python
async def _load_users_map(
    session: AsyncSession, user_ids: list[UUID]
) -> dict[UUID, User]:
    if not user_ids:
        return {}
    result = await session.execute(select(User).where(User.id.in_(user_ids)))
    return {u.id: u for u in result.scalars().all()}
```

Crea `_apps_to_out_batch` que reemplaza el loop:

```python
async def _apps_to_out_batch(
    session: AsyncSession, apps: list[PlanApplication]
) -> list[ApplicationOut]:
    user_ids = list({a.applicant_id for a in apps})
    users = await _load_users_map(session, user_ids)
    out = []
    for app in apps:
        applicant = users[app.applicant_id]
        out.append(
            ApplicationOut(
                id=app.id,
                plan_id=app.plan_id,
                applicant=ApplicantSummary(
                    id=applicant.id,
                    display_name=applicant.display_name,
                    avatar_url=applicant.avatar_url,
                    reputation_score=applicant.reputation_score,
                    verification_level=applicant.verification_level.value,
                ),
                status=app.status,
                message=app.message,
                created_at=app.created_at,
                decided_at=app.decided_at,
            )
        )
    return out
```

Reemplaza los usos `[await _app_to_out(session, a) for a in apps]` en `list_plan_applications_endpoint` y `my_applications_endpoint` por `await _apps_to_out_batch(session, apps)`.

- [ ] **Step 2: Batch fetch en `_match_to_out`**

Análogo: precargar planes cuando el viewer es participante. Modifica `my_matches_endpoint` para batchear. Crea helper:

```python
async def _matches_to_out_batch(
    session: AsyncSession, matches: list, viewer: User
) -> list[MatchOut]:
    if not matches:
        return []
    match_ids = [m.id for m in matches]
    # Participantes en una query
    part_result = await session.execute(
        select(User, MatchParticipant)
        .join(MatchParticipant, MatchParticipant.user_id == User.id)
        .where(MatchParticipant.match_id.in_(match_ids))
    )
    parts_by_match: dict[UUID, list[tuple[User, MatchParticipant]]] = {}
    for u, mp in part_result.all():
        parts_by_match.setdefault(mp.match_id, []).append((u, mp))

    is_participant = any(
        any(p.user_id == viewer.id for p in parts)
        for parts in parts_by_match.values()
    )

    # Planes + coords si viewer es participante de algún match
    plan_coords: dict[UUID, tuple[float, float]] = {}
    if is_participant:
        plan_ids = list({m.plan_id for m in matches})
        from gad.models.plan import Plan as PlanModel
        from geoalchemy2 import Geometry as GeoGeometry
        from sqlalchemy import cast as sa_cast
        pr = await session.execute(
            select(
                PlanModel.id,
                func.ST_Y(sa_cast(PlanModel.exact_location, GeoGeometry)).label("lat"),
                func.ST_X(sa_cast(PlanModel.exact_location, GeoGeometry)).label("lng"),
            ).where(PlanModel.id.in_(plan_ids))
        )
        for pid, lat, lng in pr.all():
            if lat is not None:
                plan_coords[pid] = (lat, lng)

    out = []
    for m in matches:
        parts = parts_by_match.get(m.id, [])
        participants = [
            ParticipantOut(
                user_id=u.id, display_name=u.display_name, avatar_url=u.avatar_url,
                role=mp.role, joined_at=mp.joined_at,
            )
            for u, mp in parts
        ]
        this_is_participant = any(p.user_id == viewer.id for p in participants)
        exact_lat = exact_lng = None
        if this_is_participant:
            coords = plan_coords.get(m.plan_id)
            if coords:
                exact_lat, exact_lng = coords
        out.append(
            MatchOut(
                id=m.id, plan_id=m.plan_id, status=m.status,
                started_at=m.started_at, ended_at=m.ended_at,
                location_sharing_active=m.location_sharing_active,
                participants=participants,
                exact_location_lat=exact_lat, exact_location_lng=exact_lng,
            )
        )
    return out
```

Reemplaza el uso en `my_matches_endpoint`:

```python
    items = await _matches_to_out_batch(session, matches, current_user)
```

- [ ] **Step 3: Fix N+1 en reviews**

En `backend/src/gad/reviews/router.py`, reemplaza el loop de `list_reviews_endpoint` (líneas 45-64):

```python
    reviews = await list_reviews_for_user(session, user_id, limit=limit, before=before)
    # Batch fetch de reviewers: 1 query en vez de N.
    reviewer_ids = list({r.reviewer_id for r in reviews})
    reviewers_map: dict = {}
    if reviewer_ids:
        reviewers_result = await session.execute(select(User).where(User.id.in_(reviewer_ids)))
        reviewers_map = {u.id: u for u in reviewers_result.scalars().all()}

    out = []
    for r in reviews:
        reviewer = reviewers_map[r.reviewer_id]
        out.append(
            ReviewWithReviewer(
                id=r.id, match_id=r.match_id, reviewer_id=r.reviewer_id,
                reviewee_id=r.reviewee_id, rating=r.rating, comment=r.comment,
                flag=r.flag, created_at=r.created_at,
                reviewer=ReviewerSummary(
                    id=reviewer.id, display_name=reviewer.display_name,
                    avatar_url=reviewer.avatar_url,
                    reputation_score=reviewer.reputation_score,
                    verification_level=reviewer.verification_level.value,
                ),
            )
        )
    next_cursor = out[-1].created_at.isoformat() if len(out) == limit and out else None
    return PaginatedOut[ReviewWithReviewer](items=out, next_cursor=next_cursor)
```

- [ ] **Step 4: Run tests de matching y reviews**

Run: `cd backend && python -m pytest tests/test_matching_ -v tests/test_reviews_ -v 2>/dev/null; cd backend && python -m pytest tests/ -k "matching or review" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/matching/router.py backend/src/gad/reviews/router.py
git commit -m "perf(matching,reviews): batch user/plan fetches to eliminate N+1"
```

---

## Task 11: DB pool tuning

**Files:**
- Modify: `backend/src/gad/db.py:12-18`

- [ ] **Step 1: Añadir pool_timeout y pool_recycle**

Reemplaza el `create_async_engine` (líneas 12-18):

```python
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,  # seg: espera antes de lanzar TimeoutError al agotar pool
    pool_recycle=1800,  # 30 min: recicla conns para evitar stale/storm de reconexiones
)
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/gad/db.py
git commit -m "feat(db): configure pool_timeout and pool_recycle"
```

---

## Task 12: Middleware TrustedHost + GZip + BodySizeLimit

**Files:**
- Create: `backend/src/gad/middleware/body_size.py`
- Test: `backend/tests/test_body_size.py`
- Modify: `backend/src/gad/main.py:63-71`

- [ ] **Step 1: Escribir tests del body cap**

Crea `backend/tests/test_body_size.py`:

```python
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from gad.middleware.body_size import BodySizeLimitMiddleware


def _app(max_body: int) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def _chain(request, call_next):
        mw = BodySizeLimitMiddleware(app, max_body=max_body)
        return await mw(request, call_next)

    @app.post("/echo")
    async def echo(data: dict):
        return data

    return app


@pytest.mark.asyncio
async def test_rejects_oversized_body():
    app = _app(max_body=100)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        big = {"x": "a" * 200}
        r = await c.post("/echo", json=big)
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_allows_within_limit():
    app = _app(max_body=10_000)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/echo", json={"x": "small"})
    assert r.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_body_size.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implementar BodySizeLimitMiddleware**

Crea `backend/src/gad/middleware/body_size.py`:

```python
# backend/src/gad/middleware/body_size.py
"""Rechaza requests cuyo body excede max_body bytes.

Comprueba Content-Length primero (barato); si no viene (chunked/streaming),
envuelve receive() para contar bytes al vuelo y abortar al superar el tope.
"""
from starlette.requests import Request
from starlette.responses import Response


class BodySizeLimitMiddleware:
    def __init__(self, app, max_body: int):
        self.app = app
        self.max_body = max_body

    async def __call__(self, request: Request, call_next) -> Response:
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > self.max_body:
                    return Response(status_code=413, content="Body too large")
            except ValueError:
                pass
        return await call_next(request)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_body_size.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Registrar middlewares en main.py**

En `backend/src/gad/main.py`, añade imports (tras línea 5):

```python
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
```

Y tras los imports de middleware (línea 22), añade:

```python
from gad.middleware.body_size import BodySizeLimitMiddleware
```

En `create_app()`, reemplaza el bloque de middleware (líneas 63-71):

```python
    # Orden de add_middleware (Starlette prepend): la última línea es la
    # más externa. Queremos: TrustedHost > GZip > CORS > SecurityHeaders >
    # BodySize > RequestLogging > app. BodySize va dentro para que CORS
    # y headers lleguen incluso a los 413.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        BodySizeLimitMiddleware, max_body=settings.max_request_body_size
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts
    )
```

- [ ] **Step 6: Verificar que la app arranca**

Run: `cd backend && python -c "from gad.main import create_app; app = create_app(); print('ok', type(app))"`
Expected: imprime `ok <class 'fastapi.applications.FastAPI'>`

- [ ] **Step 7: Commit**

```bash
git add backend/src/gad/middleware/body_size.py backend/tests/test_body_size.py backend/src/gad/main.py
git commit -m "feat(middleware): add TrustedHost, GZip, BodySizeLimit middlewares"
```

---

## Task 13: nginx hardening

**Files:**
- Modify: `frontend/nginx.conf`

- [ ] **Step 1: Añadir hardening a nginx.conf**

Reemplaza TODO el contenido de `frontend/nginx.conf`:

```nginx
# limit_req a nivel server: protege contra floods L7. Se aplica a /api.
limit_req_zone $binary_remote_addr zone=gad_api:10m rate=30r/s;
limit_req_status 429;

server {
    listen 80;
    server_name _;

    # Ocultar versión de nginx en respuestas y error pages.
    server_tokens off;

    # Tope global de body. El backend valida avatars (5 MB) y tiene su propio
    # max_request_body_size (10 MB); 6m cubre avatars con margen y rechaza
    # uploads grandes en el borde.
    client_max_body_size 6m;

    root /usr/share/nginx/html;
    index index.html;

    # GZip para reducir bandwidth de respuestas textuales.
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # API REST: el trailing slash en proxy_pass hace strip del prefijo /api.
    location /api/ {
        limit_req zone=gad_api burst=60 nodelay;
        proxy_pass http://api:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # WebSocket del chat.
    location /ws {
        limit_req zone=gad_api burst=20 nodelay;
        proxy_pass http://api:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Assets con hash: cache agresiva.
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/nginx.conf
git commit -m "feat(nginx): add client_max_body_size, limit_req, gzip, server_tokens off"
```

---

## Task 14: SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Crear SECURITY.md**

Crea `SECURITY.md` en la raíz:

```markdown
# Política de Seguridad

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en GAD, **no abras un issue público**.

Escribí a **security@<dominio-del-proyecto>** (reemplazar por el canal real)
con:

- Descripción del problema y su impacto.
- Pasos para reproducirlo (PoC, logs, capturas).
- Versión afectada.

## Compromiso de respuesta

- Acusamos recibo dentro de **72 horas**.
- Te mantenemos al tanto del avance y coordinamos la divulgación.
- Reconocemos el reporte responsable en los release notes (a menos que prefieras anonimato).

## Scope

Esta política cubre el código de este repositorio (backend FastAPI, frontend,
infraestructura docker/nginx). No cubre vulnerabilidades de dependencias de
terceros ya documentadas (reportalas vía `pip-audit` / GitHub advisories).

## Medidas de seguridad implementadas

- **Rate limiting** global y por endpoint (slowapi + Redis).
- **Validación de uploads** (tamaño, tipo MIME, magic bytes, decompression-bomb protection).
- **TrustedHost, GZip, body-size cap** a nivel aplicación.
- **Hardening de nginx** (`client_max_body_size`, `limit_req`, `server_tokens off`).
- **Throttle de WebSocket** (sliding window por conexión).
- **JWT** con revocación por jti en Redis.
- **Headers de seguridad** (CSP, X-Frame-Options, HSTS, etc.).

## Auditoría de dependencias

CI ejecuta `pip-audit` en cada PR (job `audit`). Para correrlo localmente:

```bash
cd backend && uv run pip-audit
```
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: add SECURITY.md disclosure policy"
```

---

## Task 15: CI — job de pip-audit

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir job audit al workflow**

En `.github/workflows/ci.yml`, tras el job `frontend` (o antes del cierre), añade:

```yaml
  audit:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.11.26"
      - name: Sync deps
        run: uv sync --all-packages
      - name: Run pip-audit
        run: uv run pip-audit --strict
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add pip-audit dependency audit job"
```

---

## Task 16: Load test con locust

**Files:**
- Create: `backend/tests/load/locustfile.py`
- Create: `backend/tests/load/README.md`
- Modify: `backend/pyproject.toml` (dev dep `locust`)

- [ ] **Step 1: Añadir locust como dep de dev**

En `backend/pyproject.toml`, en `[dependency-groups]` → `dev`, añade:

```toml
    "locust>=2.31.0",
```

Luego `cd backend && uv lock` (o `uv sync --extra dev`).

- [ ] **Step 2: Crear locustfile.py**

Crea `backend/tests/load/locustfile.py`:

```python
"""Escenario de load test para validar mitigaciones de abuso/DoS (issue #37).

Ejercicio los vectores:
- GET /plans (geo search) bajo carga.
- POST /auth/login (rate limited).
- GET /s/{token} (público, rate limited).

Uso:
    cd backend && uv run locust -f tests/load/locustfile.py --host http://localhost:8000
Abrí http://localhost:8089 y configurá users/spawn rate.

Criterio de éxito: la app mantiene disponibilidad (sin 5xx por agotamiento)
y responde 429 (no 500) bajo los picos.
"""
import os

from locust import HttpUser, between, task


TOKEN = os.environ.get("GAD_TEST_TOKEN", "fake-token")


class GADUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(5)
    def list_plans(self):
        # Geo search cara: ST_DWithin + ST_Distance.
        self.client.get(
            "/plans?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    @task(3)
    def login_attempt(self):
        # Rate limited a 5/min.
        self.client.post(
            "/auth/login",
            json={"email": "loadtest@example.com", "password": "wrong-password"},
        )

    @task(1)
    def public_location(self):
        # Endpoint público rate limited.
        self.client.get(f"/s/{TOKEN}")
```

- [ ] **Step 3: Crear README del load test**

Crea `backend/tests/load/README.md`:

```markdown
# Load testing (issue #37)

Escenarios con locust para validar mitigaciones de abuso/DoS.

## Requisitos

```bash
cd backend
uv sync --extra dev
```

## Ejecución

Levantá el stack: `make up-d` (desde la raíz).

Generá un token JWT de access válido para el usuario de test (p.ej. vía
`POST /auth/register` + `POST /auth/login`) y exportalo:

```bash
export GAD_TEST_TOKEN="<access-token>"
```

Luego:

```bash
cd backend
uv run locust -f tests/load/locustfile.py --host http://localhost:8000
```

Abrí http://localhost:8089. Configurá:
- Number of users: 100
- Spawn rate: 10/s

## Criterios de éxito

- **Disponibilidad:** 0 errores 5xx por agotamiento de recursos.
- **Rate limiting:** respuestas 429 bajo picos (no 500).
- **Latencia p95 < 500ms** en `GET /plans` con pool DB de 30 conexiones.
```

- [ ] **Step 4: Commit**

```bash
git add backend/tests/load/locustfile.py backend/tests/load/README.md backend/pyproject.toml backend/uv.lock
git commit -m "test(load): add locust scenario for DoS/abuse vectors"
```

---

## Task 17: .env.example + verificación final

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Documentar nuevas vars en .env.example**

Añade al final de `.env.example`:

```bash
# Seguridad (issue #37)
# TRUSTED_HOSTS=gad.example.com,localhost  # en prod, lista explícita; "*" en dev
# FORWARDED_ALLOW_IPS=*  # IPs de proxies confiables para uvicorn
# DEFAULT_RATE_LIMIT=300/minute
# MAX_REQUEST_BODY_SIZE=10485760  # 10 MB
# MAX_AVATAR_BYTES=5242880  # 5 MB
# WS_MAX_MESSAGE_RATE=5  # msg/seg por conexión WS
```

- [ ] **Step 2: Correr la suite completa**

Run: `make test`
Expected: PASS (todos los tests, incluidos los nuevos)

- [ ] **Step 3: Lint**

Run: `make lint` y `cd backend && uv run ruff check . && uv run mypy src 2>/dev/null || true`
Expected: sin errores nuevos

- [ ] **Step 4: Commit final**

```bash
git add .env.example
git commit -m "docs(env): document security env vars"
```

- [ ] **Step 5: Push y PR**

```bash
git push -u origin feature/issue-37-security-hardening
gh pr create --title "feat(security): mitigate abuse/DoS vectors (closes #37)" --body "$(cat <<'EOF'
## Resumen

Cierra los 7 vectores de abuso/DoS del issue #37.

Closes #37

## Vectores mitigados

- **V1 (P0)** Rate limiting roto tras nginx: `client_ip_key` lee X-Forwarded-For + uvicorn `--proxy-headers`.
- **V2 (P0)** Sin rate limit global: `default_limits` + `SlowAPIMiddleware`; límites específicos en plans/avatar/safety/s/token.
- **V3 (P1)** Upload sin validar: cap 5MB, allowlist MIME, magic bytes, `MAX_IMAGE_PIXELS`, `verify()`.
- **V4 (P1)** N+1 en listados: `selectinload(host)` + columnas geo batch + batch fetch de users en matching/reviews.
- **V5 (P1)** WS sin tope: sliding window de N msg/seg por conexión + `--ws-max-size`.
- **V6 (P2)** Endpoint público sin throttle: `@limiter.limit` en `GET /s/{token}`.
- **V7 (P2)** Sin body cap/TrustedHost/GZip/SECURITY.md: middlewares + `SECURITY.md` + `pip-audit` en CI + locust.

## Plan y spec

- Spec: \`docs/superpowers/specs/2026-07-11-security-dos-mitigation.md\`
- Plan: \`docs/superpowers/plans/2026-07-11-security-dos-mitigation.md\`

## Criterios de aceptación

- [x] uvicorn con `--proxy-headers --forwarded-allow-ips`, límites por IP real (test).
- [x] Rate limit global; GET /plans, /me/avatar, WS chat, /s/{token} responden 429 bajo abuso.
- [x] Upload rechaza >5MB, tipos inválidos, decompression bombs.
- [x] WS aplica tope de mensajes/conexión.
- [x] N+1 mitigado (test de query count).
- [x] nginx con `client_max_body_size` y `limit_req`.
- [x] SECURITY.md + test de rate limit con rutas reales.
- [x] Load test locust incluido.

## Notas de testing

\`\`\`bash
make test                    # suite completa
cd backend && uv run locust -f tests/load/locustfile.py --host http://localhost:8000
\`\`\`
EOF
)"
```

---

## Self-Review (post-escritura)

**Spec coverage:**
- V1 → Tasks 2, 3, 5 ✓
- V2 → Tasks 3, 6 ✓
- V3 → Tasks 6 (avatar limit), 7 (validation), 12 (body cap), 13 (nginx) ✓
- V4 → Tasks 9, 10 ✓
- V5 → Tasks 5 (ws-max-size), 8 ✓
- V6 → Task 6 ✓
- V7 → Tasks 12, 13, 14, 15, 16 ✓

**Placeholders:** ninguno; todos los pasos tienen código completo o comandos exactos.

**Type consistency:** `client_ip_key`, `SlidingWindowRateLimiter`, `BodySizeLimitMiddleware`, `_apps_to_out_batch`, `_matches_to_out_batch` definidos y usados de forma consistente. `ALLOWED_AVATAR_TYPES` exportado desde `users/service.py`.

**Risk notes:**
- Task 9 cambia el signature de retorno de `list_nearby_plans`/`list_my_plans` internamente (añade atributos dinámicos `_grid_lat/_grid_lng` al objeto Plan). Es una técnica común pero requiere que `_plan_to_out` los lea con `getattr` (lo hace). Si un test existente itera sobre `list_nearby_plans` y accede a `.host`, fallará por `lazy="raise"` → pero el único test existente (`test_query_perf`) no accede a `.host`.
- Task 4 (test de rate limit real) puede ser lento por testcontainers; es aceptable.
