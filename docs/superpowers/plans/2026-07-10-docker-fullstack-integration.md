# Plan: Integración del frontend a Docker + integración full-stack con datos de prueba y E2E

> **Estado**: Spec / pendiente de implementación.
> **Fecha**: 2026-07-10
> **Issue**: se crea al publicar este plan.

## Decisiones confirmadas con el usuario

- **Red**: Nginx reverse proxy como único punto de entrada (sirve estático + proxy `/api` y `/ws`).
- **Perfil**: Ambos — `docker-compose.yml` (prod-like, default) + `docker-compose.dev.yml` (override con Vite HMR).
- **Datos**: Dataset rico (usuarios, planes, postulaciones, matches, reseñas, notificaciones, 1 admin).
- **Tests**: E2E con Playwright contra el stack completo.

---

## Contexto técnico clave (de la exploración del codebase)

1. **`frontend/src/api/client.ts`** usa `BASE_URL = VITE_API_URL ?? 'http://localhost:8000'`. Hoy todas las llamadas son absolutas (`apiGet('/plans')` → `http://localhost:8000/plans`). **Para que nginx funcione, `VITE_API_URL` debe quedar vacío en el build** → URLs relativas (`/plans`) → el navegador las manda al origen que lo sirvió (nginx) → proxy a `api:8000`. **No se tocan las calls**, solo el valor del env en build-time.
2. **WS**: `ENV.wsUrl` existe pero **no se usa** todavía (F5 chat omitido). El proxy `/ws` se deja en nginx/dev por adelantado.
3. **Backend `entrypoint.sh`** corre `alembic upgrade head` + uvicorn. El seed correrá **después** de migraciones (servicio `seed` one-shot con `condition: service_healthy` sobre `api`).
4. **`backend/scripts/make_admin.py`** es el patrón de referencia: script async con `gad.db.async_session_maker`. El seed lo replica con funciones de servicio (`register`, `create_plan`, etc.).
5. **CORS**: con nginx como único origen no hace falta para prod-like. Para dev (vite:5173 → api:8000) el proxy de Vite ya resuelve; igual se deja `CORS_ORIGINS` apuntando a los dos por robustez.
6. **Node 22** local; el Dockerfile de frontend usa `node:22-alpine` para el build del estático.
7. **Modelos** (`backend/src/gad/models/`): `User`, `UserPreferences`, `Plan`, `PlanApplication`, `Match`, `MatchParticipant`, `Message`, `Block`, `Notification`, `PushSubscription`, `Review`, `TrustedContact`, `SafetySession`, `SafetyEvent`, `Availability`, `Report`. PostGIS (`Geography POINT`) en `Plan.location_grid`, etc.
8. **Servicios reutilizables para seed** (ORM directo, no HTTP, evita rate-limit y necesidad de Redis):
   - `gad.auth.service.register(session, RegisterIn)` → hashea argon2, crea `User`.
   - `gad.plans.service.create_plan(session, host, PlanIn)` → gestiona `location_grid` (snap_to_grid) y `expires_at`.
   - `gad.matching.service`: `apply_to_plan`, `accept_application`, `complete_match`.
   - Enums: importar de `gad.models.enums` (`UserStatus` no está en `models/__init__.__all__`).

---

## Archivos nuevos y modificados

### A. Frontend — Dockerización

**`frontend/Dockerfile`** (multi-stage, prod-like)
- Stage `build`: `node:22-alpine`, `npm ci`, copia `src/`, build con `npm run build` (`tsc --noEmit && vite build`).
- Stage `runtime`: `nginx:alpine`, copia `dist/` a `/usr/share/nginx/html`, copia `frontend/nginx.conf`.
- `VITE_API_URL` vacío en build → URLs relativas.
- `EXPOSE 80`.

**`frontend/nginx.conf`**
- Sirve `dist/` (SPA fallback `try_files ... /index.html`).
- `location /api/` → `proxy_pass http://api:8000/` (strip `/api`).
- `location /ws` → `proxy_pass http://api:8000/ws` + headers WS upgrade.
- Headers de proxy estándar (`Host`, `X-Real-IP`, `X-Forwarded-*`).

**`frontend/.dockerignore`**
- `node_modules`, `dist`, `coverage`, `.env*` (salvo example), `e2e`.

**`frontend/Dockerfile.dev`** (override HMR)
- `node:22-alpine`, `npm install`, `WORKDIR /app`, `CMD ["npm","run","dev"]`. No copia código (montado como volumen).

### B. Compose — principal + override

**`docker-compose.yml`** (modificar existente)
- Servicio `web` (build `./frontend`, depende de `api` healthy, puerto `5173:80`).
- Servicio `seed` (build `./backend`, `depends_on: api healthy`, `restart: "no"`, corre `python -m scripts.seed`).
- `db`, `redis`, `api` como están.

**`docker-compose.dev.yml`** (override, nuevo)
- `web`: build con `Dockerfile.dev`, monta `./frontend:/app` + volumen anónimo en `/app/node_modules`, `5173:5173`, env `VITE_PROXY_TARGET=http://api:8000`.
- `api`: añade `--reload` a uvicorn.
- `seed`: disponible vía `--profile seed`.

### C. Backend — script de seed

**`backend/scripts/seed.py`** (nuevo, patrón de `make_admin.py`)
- Async, `gad.db.async_session_maker`.
- **Idempotente**: comprueba si `admin@gad.test` existe antes de insertar. Flag `--reset` opcional (truncate en orden FK inverso).
- Crea vía funciones de servicio:
  - Usuarios: `admin@gad.test`, `alice@`, `bob@`, `carol@`, `diana@` (password `Test1234`).
  - Promueve admin sobre `admin@gad.test`.
  - Preferencias variadas por usuario.
  - Planes: 4-5 con `create_plan` (coffee, walk, food, drinks; `now`/`scheduled`; ubicaciones CABA).
  - Postulaciones + aceptar 1 → `Match` + participantes.
  - Reseña en match completado.
  - Notificaciones, trusted contacts, availability (ORM directo).
- Imprime resumen con cuentas/credenciales.

### D. Playwright E2E

**`frontend/playwright.config.ts`**
- `baseURL` configurable (`E2E_BASE_URL`, default `http://localhost:5173` o el de nginx). Sin `webServer` (gestiona docker-compose).

**`frontend/e2e/`**
- `helpers.ts` — cuentas sembradas, `loginAs(page, email)`.
- `auth.spec.ts`, `plans.spec.ts`, `matching.spec.ts`, `admin.spec.ts`, (opcional) `safety-reviews.spec.ts`.

**`frontend/package.json`** — `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`.

### E. Docs y env

- **`.env.example`** (raíz) — `VITE_API_URL=` (vacío prod-like), documentar `CORS_ORIGINS`.
- **`frontend/.env.example`** — aclarar `VITE_API_URL` vacío = URLs relativas.
- **`README.md`** (raíz) — sección "Entorno Docker (full-stack)", cuentas del seed, comandos dev/prod, `npm run test:e2e`. Quitar E2E de "Pendiente".
- **`backend/README.md`** — nota sobre `scripts.seed`.

---

## Orden de ejecución (cada fase verificable de forma independiente)

### Fase 1 — Frontend en Docker (prod-like)
1. `frontend/Dockerfile` (multi-stage) + `nginx.conf` + `.dockerignore`.
2. Servicio `web` en `docker-compose.yml`.
3. **Verificación**: `docker compose up --build db redis api web` → `curl localhost:5173/` sirve index, `/api/...` pasa al backend, login desde navegador funciona.

### Fase 2 — Seed
4. `backend/scripts/seed.py` (idempotente, dataset rico).
5. Servicio `seed` en `docker-compose.yml`.
6. **Verificación**: `docker compose up --build seed` → log con cuentas; login con `admin@gad.test/Test1234`; datos visibles en explore/perfil.

### Fase 3 — Override dev con HMR
7. `frontend/Dockerfile.dev`.
8. `docker-compose.dev.yml`.
9. **Verificación**: override up → HMR funciona (cambio de texto visible sin rebuild).

### Fase 4 — E2E Playwright
10. `frontend/playwright.config.ts`.
11. `e2e/helpers.ts` + specs.
12. Script `test:e2e`.
13. **Verificación**: stack levantado → `npm run test:e2e` verde contra el dataset sembrado.

### Fase 5 — Docs y cierre
14. `.env.example` (raíz + frontend), `README.md` (raíz), `backend/README.md`.
15. **Verificación final**:
    - `docker compose down -v && docker compose up --build` arranca limpio + seed puebla.
    - `cd frontend && npm test` (Vitest) verde.
    - `npm run test:e2e` verde.
    - Smoke manual: register→plan→postular→aceptar→match→reseña→panel admin.

---

## Notas y límites

- **No se toca la lógica de negocio** del backend ni del frontend (solo el valor default de `VITE_API_URL` vía env, no código).
- El **seed es idempotente**; `--reset` queda opcional.
- **E2E depende del seed**: los specs asumen las cuentas/planes del dataset. Si el seed cambia, los helpers se actualizan en `e2e/helpers.ts`.
- **Google OAuth** deshabilitado en Docker (sin `GOOGLE_CLIENT_ID`/`SECRET`), como hoy.
- **Rate limiting**: `RATE_LIMIT_ENABLED=false` en entorno E2E si interfiere.
- No se hace commit/push salvo lo descrito; el plan deja todo listo para revisión local.
