# Roadmap: Cierre y Hardening del Backend

> **Lectura primero.** Este documento es el índice que ordena los 6 planes detallados que cierran los huecos detectados en la auditoría del backend de GAD. Cada plan es independiente y produce software testeable por sí solo.

**Objetivo global:** dejar el backend completo, seguro, observable y consistente antes de empezar el frontend.

**Stack:** Python 3.12 + FastAPI + SQLAlchemy async + PostgreSQL/PostGIS + Redis + pytest + testcontainers. Gestor `uv`. Migraciones Alembic (única fuente de verdad: `Base.metadata`).

---

## Orden recomendado de ejecución

Los planes están ordenados por (a) impacto en seguridad/riesgo y (b) dependencias entre ellos.

| # | Plan | Archivo | Prioridad | ¿Bloquea a otros? |
|---|------|---------|-----------|-------------------|
| 1 | **Auth crítico** | `2026-07-08-plan1-auth-critico.md` | Alta | Plan 6 depende de `token_store` para logout real |
| 2 | **Observabilidad** | `2026-07-08-plan2-observabilidad.md` | Alta | No |
| 3 | **Paginación** | `2026-07-08-plan3-paginacion.md` | Media | No |
| 4 | **Cierre de CRUDs** | `2026-07-08-plan4-cierre-cruds.md` | Media | No |
| 5 | **Admin** | `2026-07-08-plan5-admin.md` | Media | Requiere `UserStatus` de Plan 1 (ban usa el flag de estado) |
| 6 | **Hardening** | `2026-07-08-plan6-hardening.md` | Media | Reusa `token_store` de Plan 1 y `UserStatus` |

---

## Resumen por plan

### Plan 1 — Auth crítico
Cierra los huecos de seguridad más serios detectados:
- **Revocación real de tokens** vía `token_store` en Redis (logout invalida el access; `jti` se persiste y verifica).
- **Cambio de contraseña** (`POST /auth/change-password`).
- **Recuperación de contraseña** (`POST /auth/password-reset/request` + `POST /auth/password-reset/confirm` con token de un solo uso en Redis).
- **Baja de cuenta** (`DELETE /me` con soft-delete: `UserStatus` enum `active`/`suspended`/`deleted`; soft-delete anonimiza email).
- Rate limit en `/auth/refresh` y `/auth/oauth/google`.

**Crea:** `backend/src/gad/auth/token_store.py`, `backend/src/gad/auth/password_reset.py`. **Modifica:** `auth/router.py`, `auth/service.py`, `auth/jwt.py`, `auth/dependencies.py`, `models/user.py`, `models/enums.py`, migración `0002`.

### Plan 2 — Observabilidad
Activa el logging que ya está cableado pero sin usar, y añade métricas:
- Usar `structlog.get_logger()` en todos los servicios (auth, plans, matching, safety, etc.).
- Middleware de logging de requests (latencia, status, path) estructurado.
- `prometheus_client`: endpoint `GET /metrics` con contador de requests y histograma de latencia.
- Logging de eventos de seguridad (login ok/fail, SOS, ban).

**Crea:** `backend/src/gad/middleware/request_logging.py`, `backend/src/gad/middleware/metrics.py`. **Modifica:** `main.py` (registrar middlewares), todos los `service.py` (añadir logger).

### Plan 3 — Paginación
Unifica el patrón de cursor (ya existe en `chat/service.py`) en los listados que hoy devuelven todo o solo 50 sin cursor:
- `GET /notifications`: añadir `limit` + `before` (por `created_at`).
- `GET /reviews`: añadir `limit` + `before`.
- `GET /admin/reports`: añadir `limit` + `before`.
- `GET /matches`: añadir `limit` + `before`.
- `GET /me/applications`: añadir `limit` + `before`.

Devuelve `{items: [...], next_cursor: <iso8601|null>}`. **Modifica** los `service.py` y `router.py` correspondientes + sus schemas de salida.

### Plan 4 — Cierre de CRUDs
Añade los endpoints que faltan para un CRUD completo:
- `PATCH /plans/{id}` (host edita título/descripción/schedule si el plan sigue `open`).
- `DELETE /me/blocks/{user_id}` (desbloquear).
- `DELETE /messages/{message_id}` (borrar mensaje propio).
- `POST /notifications/read-all` (marcar todas leídas).
- `DELETE /notifications` (borrar todas las propias).
- `DELETE /notifications/subscription` (desuscribir push).
- `DELETE /safety/{match_id}/share-link` (revocar share-link).
- `DELETE /reviews/{review_id}` (borrar reseña propia).

### Plan 5 — Admin
Amplía el panel admin (hoy solo stats + reports):
- `GET /admin/users` (listado paginado con filtros por estado).
- `POST /admin/users/{id}/ban` / `POST /admin/users/{id}/suspend` / `POST /admin/users/{id}/activate` (usa `UserStatus` de Plan 1).
- `POST /admin/plans/{id}/cancel` (forzar cancelación).
- `GET /admin/reviews` (listar reviews flagueadas para moderación).
- `DELETE /admin/reviews/{id}` (eliminar review en moderación).
- `require_admin` devuelve **403 Forbidden** (nueva excepción `ForbiddenError`).

### Plan 6 — Hardening
Cierra los gaps de seguridad menores y la higiene de config:
- **Content-Security-Policy** header (mitiga XSS almacenado en chat).
- **Timing-safe login** (hash dummy cuando usuario no existe).
- **Sanitización básica** de contenido de chat (escapar/limitar HTML, no Markdown crudo).
- Secretos del `docker-compose.yml` externalizados a `.env` (sin hardcodeo).
- Validar y documentar cómo otorgar `is_admin` (script/CLI o endpoint bootstrap).
- `require_admin` → 403 (compartido con Plan 5; se define aquí si Plan 5 aún no corrió).

---

## Convenciones (para todos los planes)

- **Tests:** patrón `tests/test_*.py` con httpx `AsyncClient` + `ASGITransport`, override de `get_session` con el engine de testcontainers (ver `tests/conftest.py`). Tests de servicio llaman directo al `service.py` con `db_session`. TDD: test rojo → implementación mínima → verde → commit.
- **Migraciones:** nueva revisión Alembic `0002_*` que altera tablas existentes (ALTER TABLE) con `upgrade()` y `downgrade()` simétricos. Los modelos SQLAlchemy siguen siendo la fuente de verdad para tablas nuevas; los ALTER van explícitos en la migración.
- **Commits:** convención existente del repo (`feat:`, `test:`, `fix:`, `perf:`, `refactor:`). Un commit por paso atómico.
- **Rate limiting:** decorador `@limiter.limit("...")` de slowapi en el router; requestúa `request: Request` como primer parámetro.
- **Schemas:** Pydantic v2 con `Field(ge=, le=, min_length=, max_length=)` para validación.
- **Errores de dominio:** heredan de `GADError` en `exceptions.py` con `status_code` y `code`. Nunca levantar `HTTPException` crudo en servicios.
