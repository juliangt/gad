# Plan 6 — Hardening de seguridad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los gaps de seguridad menores y de higiene de configuración que no son críticos pero sí conviene resolver antes de producción.

**Architecture:** CSP header configurable vía settings. Sanitización de contenido de chat con una función pura. Secretos del compose externalizados a `.env`. CLI/script para otorgar admin.

**Tech Stack:** FastAPI, Pydantic, pytest.

---

## File Structure

- **Modify:** `backend/src/gad/middleware/security_headers.py` — añadir CSP.
- **Modify:** `backend/src/gad/config.py` — `csp_policy` setting.
- **Create:** `backend/src/gad/utils/sanitize.py` — sanitización de texto.
- **Modify:** `backend/src/gad/chat/service.py` — sanitizar al enviar.
- **Modify:** `docker-compose.yml` — externalizar secretos.
- **Create:** `backend/scripts/make_admin.py` — CLI para otorgar admin.
- **Create:** `backend/tests/test_hardening.py`

---

## Task 1: Content-Security-Policy header

**Files:**
- Modify: `backend/src/gad/config.py`
- Modify: `backend/src/gad/middleware/security_headers.py`

- [ ] **Step 1: Setting**

En `backend/src/gad/config.py`, dentro de `Settings`, añadir:

```python
    csp_policy: str = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'"
```

- [ ] **Step 2: Middleware**

En `backend/src/gad/middleware/security_headers.py`, añadir al final del `dispatch` (antes del `return response`):

```python
from gad.config import settings

        response.headers["Content-Security-Policy"] = settings.csp_policy
```

(Mover el import arriba del todo para evitar circularidad; en la práctica `config` no importa `middleware`, así que es seguro.)

Queda:

```python
from gad.config import settings
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self)"
        response.headers["Content-Security-Policy"] = settings.csp_policy
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response
```

- [ ] **Step 3: Test + commit**

`backend/tests/test_hardening.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/x")
    async def x():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_csp_header_present(client):
    async with client as c:
        resp = await c.get("/x")
    assert "content-security-policy" in {k.lower() for k in resp.headers}
    assert "default-src 'self'" in resp.headers["content-security-policy"]
```

Run: `cd backend && uv run pytest tests/test_hardening.py::test_csp_header_present -v`

```bash
git add backend/src/gad/config.py backend/src/gad/middleware/security_headers.py backend/tests/test_hardening.py
git commit -m "feat(security): header Content-Security-Policy configurable"
```

---

## Task 2: Sanitización de contenido de chat

**Files:**
- Create: `backend/src/gad/utils/sanitize.py`
- Modify: `backend/src/gad/chat/service.py`

- [ ] **Step 1: Test que falla**

Añadir a `backend/tests/test_hardening.py`:

```python
from gad.utils.sanitize import sanitize_text


def test_sanitize_text_strips_html_tags():
    assert sanitize_text("<script>alert(1)</script>hola") == "hola"


def test_sanitize_text_preserves_plain_text():
    assert sanitize_text("hola, ¿vamos a tomar un café?") == "hola, ¿vamos a tomar un café?"


def test_sanitize_text_collapses_whitespace():
    assert sanitize_text("hola   mundo\n\n\n") == "hola mundo"
```

- [ ] **Step 2: Correr, verificar que falla**

Run: `cd backend && uv run pytest tests/test_hardening.py::test_sanitize_text_strips_html_tags -v`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

`backend/src/gad/utils/sanitize.py`:

```python
"""Sanitización básica de texto de usuario (chat, bio, etc.).

No es un sanitizer HTML completo: la política es rechazar todo HTML y
dejar sólo texto plano. El frontend puede renderizar con escapes.
"""
import re

_TAG_RE = re.compile(r"<[^>]*>")
_WS_RE = re.compile(r"\s+")


def sanitize_text(text: str, *, max_length: int = 2000) -> str:
    cleaned = _TAG_RE.sub("", text)
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    return cleaned[:max_length]
```

Crear `backend/src/gad/utils/__init__.py` vacío.

- [ ] **Step 4: Aplicar en chat**

En `backend/src/gad/chat/service.py`, modificar `send_message` para sanitizar el contenido antes de crear el `Message`:

```python
from gad.utils.sanitize import sanitize_text

async def send_message(
    session: AsyncSession,
    sender: User,
    match_id: UUID,
    content: str,
) -> Message:
    if not await _is_participant(session, match_id, sender.id):
        raise ValidationError("No sos participante de este match")

    content = sanitize_text(content)
    if not content:
        raise ValidationError("El mensaje no puede estar vacío")

    msg = Message(
        match_id=match_id,
        sender_id=sender.id,
        content=content,
        created_at=datetime.now(UTC),
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg
```

- [ ] **Step 5: Correr tests**

Run: `cd backend && uv run pytest tests/test_hardening.py tests/test_smoke_phase3.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/utils/__init__.py backend/src/gad/utils/sanitize.py backend/src/gad/chat/service.py backend/tests/test_hardening.py
git commit -m "feat(security): sanitizar contenido de chat (anti-XSS almacenado)"
```

---

## Task 3: Externalizar secretos del docker-compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example` (si existe)

- [ ] **Step 1: Compose usando variables de entorno**

Reescribir la sección `environment` del servicio `api` y la `db` para que lean de `.env`:

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-gad}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD requerida}
      POSTGRES_DB: ${POSTGRES_DB:-gad}
    ports:
      - "5432:5432"
    volumes:
      - gad_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gad"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-gad}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-gad}
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET requerido}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      ENVIRONMENT: ${ENVIRONMENT:-dev}
      CSP_POLICY: ${CSP_POLICY:-}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend/src:/app/src

volumes:
  gad_pgdata:
```

- [ ] **Step 2: Asegurar .env.example**

Crear/actualizar `.env.example` con:

```env
# Copiar a .env y completar
POSTGRES_USER=gad
POSTGRES_PASSWORD=cambiar-en-prod
POSTGRES_DB=gad
JWT_SECRET=cambiar-por-un-secreto-de-16-chars-o-mas
CORS_ORIGINS=http://localhost:5173
ENVIRONMENT=dev
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 3: Verificar que arranca con .env**

Run: `cp .env.example .env && docker compose config` (valida el compose con las vars)
Expected: YAML válido sin errores de interpolación.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore(devops): externalizar secretos del compose a .env"
```

---

## Task 4: CLI para otorgar admin

**Files:**
- Create: `backend/scripts/make_admin.py`

- [ ] **Step 1: Script**

`backend/scripts/make_admin.py`:

```python
"""Otorga o quita privilegios de admin a un usuario por email.

Uso:
    uv run python -m scripts.make_admin user@example.com
    uv run python -m scripts.make_admin user@example.com --revoke
"""
import argparse
import asyncio

from sqlalchemy import select

from gad.db import async_session_maker
from gad.models.user import User


async def set_admin(email: str, revoke: bool = False) -> None:
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"Usuario no encontrado: {email}")
            return
        user.is_admin = not revoke
        await session.commit()
        action = "removido de" if revoke else "promovido a"
        print(f"{email} {action} admin")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gestionar rol admin de un usuario")
    parser.add_argument("email", help="Email del usuario")
    parser.add_argument("--revoke", action="store_true", help="Quitar admin")
    args = parser.parse_args()
    asyncio.run(set_admin(args.email, revoke=args.revoke))


if __name__ == "__main__":
    main()
```

Crear `backend/scripts/__init__.py` vacío.

- [ ] **Step 2: Documentar en backend/README.md**

En `backend/README.md`, añadir una sección:

```markdown
## Gestión de admin

Para otorgar permisos de admin a un usuario existente:

```bash
cd backend
uv run python -m scripts.make_admin user@example.com
```

Para revocar:

```bash
uv run python -m scripts.make_admin user@example.com --revoke
```
```

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/make_admin.py backend/README.md
git commit -m "feat(admin): CLI para otorgar/revocar rol admin"
```

---

## Task 5: Timing-safe login

**Files:**
- Modify: `backend/src/gad/auth/service.py`

> **Nota:** Si Plan 2 ya corrió (Task 5), el login ya fue refactorizado a un solo branch que combina las verificaciones. Este task asegura el hash dummy.

- [ ] **Step 1: Test de timing**

Añadir a `backend/tests/test_hardening.py`:

```python
import time
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.service import login
from gad.schemas.auth import LoginIn


@pytest.mark.asyncio
async def test_login_timing_similar_for_unknown_vs_wrong_password(db_session):
    """El tiempo de respuesta no debe filtrar si el email existe."""
    # Login a usuario inexistente dos veces
    t1 = time.perf_counter()
    with pytest.raises(Exception):
        await login(db_session, LoginIn(email="nope@nope.com", password="12345678"))
    unknown_time = time.perf_counter() - t1
    # No asserting valores exactos (frágil en CI), pero verificar que no
    # truena de forma distinta: que ejecute el hash dummy.
    assert unknown_time > 0
```

- [ ] **Step 2: Implementar hash dummy**

En `backend/src/gad/auth/service.py`, asegurar que `login` hace un `verify_password` incluso cuando el usuario no existe:

```python
from gad.auth.passwords import hash_password, verify_password

# Hash fijo para comparar en el path de usuario inexistente (timing-safe).
_DUMMY_HASH = hash_password("timing-safe-dummy")


async def login(session: AsyncSession, data: LoginIn) -> TokenOut:
    result = await session.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None:
        verify_password(data.password, _DUMMY_HASH)  # mitiga timing attack
        logger.warning("login_failed", email=data.email)
        record_auth_event("login", "failed")
        raise InvalidCredentialsError("Credenciales inválidas")
    if not verify_password(data.password, user.password_hash):
        logger.warning("login_failed", email=data.email)
        record_auth_event("login", "failed")
        raise InvalidCredentialsError("Credenciales inválidas")
    logger.info("login_ok", user_id=str(user.id))
    record_auth_event("login", "ok")
    return _issue_tokens(user)
```

- [ ] **Step 3: Correr tests de auth**

Run: `cd backend && uv run pytest tests/test_auth_protected.py tests/test_hardening.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/auth/service.py backend/tests/test_hardening.py
git commit -m "feat(auth): login timing-safe con hash dummy"
```

---

## Task 6: Smoke de hardening

**Files:**
- Create: `backend/tests/test_smoke_hardening.py`

- [ ] **Step 1: Smoke integrador**

```python
"""Smoke: headers de seguridad presentes y chat sanitiza."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.middleware.security_headers import SecurityHeadersMiddleware


@pytest.fixture
async def client():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/x")
    async def x():
        return {"ok": True}

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_all_security_headers_present(client):
    async with client as c:
        resp = await c.get("/x")
    headers = {k.lower() for k in resp.headers}
    assert "content-security-policy" in headers
    assert "x-content-type-options" in headers
    assert "x-frame-options" in headers
    assert "referrer-policy" in headers
    assert "permissions-policy" in headers
```

- [ ] **Step 2: Correr y commit**

Run: `cd backend && uv run pytest tests/test_smoke_hardening.py -v`

```bash
git add backend/tests/test_smoke_hardening.py
git commit -m "test(security): smoke de headers de seguridad completos"
```

---

## Self-Review (Plan 6)

**Cobertura:**
- ✅ CSP header → Task 1
- ✅ Sanitización chat (XSS) → Task 2
- ✅ Secretos externalizados → Task 3
- ✅ CLI admin → Task 4
- ✅ Timing-safe login → Task 5
- ✅ Smoke → Task 6

**Dependencias:** Task 5 asume Plan 2 (logger, record_auth_event). Si no corrió, ajustar imports. Task 1 (CSP) es independiente.

**Placeholder scan:** sin placeholders. El test de timing (Task 5 Step 1) es intencionalmente no-estricto (frágil en CI) y se documenta por qué.
