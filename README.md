# GAD

> No tomes algo solo. GAD te conecta con gente cercana dispuesta a sumarse a una salida corta — ahora mismo o agendada.

## ¿Qué es?

GAD es una webapp para encontrar **compañía puntual para una salida casual** (un café, una cerveza, comer algo, un paseo). No es una app de citas — el objetivo es simple: no ir a tomar algo solo, sin la presión social de un encuentro romántico ni el compromiso de una amistad de largo plazo.

Publicás un **Plan** ("café en Palermo, ahora, 1 persona") y gente cercana dentro del radio que elijas puede verlo en el mapa, postularse y, si aceptás, salir. Si no hay nadie disponible cuando querés salir, activás el **modo disponible** y recibís una alerta cuando aparezca un Plan compatible cerca.

## ¿Por qué es diferente?

| App | Foco | Diferencia con GAD |
|---|---|---|
| Tinder / Bumble | Citas | Match basado en atracción, foco romance |
| Bumble BFF / Meetup | Amistad o eventos largos | No es espontáneo, no es salida puntual |
| happn | Citas por cruce | Match-based, sin intención explícita |
| **GAD** | **Compañía puntual + espontánea + geolocalizada** | **Espacio no cubierto** |

El nicho es el cruce entre *compañía espontánea de corta duración*, *ubicación en tiempo real* y *seguridad*: salir con un desconocido a tomar algo, con confianza.

## Funcionalidades principales

- **Registro y perfil** con Google o email.
- **Mapa interactivo** con gente y planes cercanos, slider de radio.
- **Crear Plan**: tipo de actividad, ahora o agendado, cuánta gente, dónde, radio de búsqueda.
- **Postularse y aceptar**: conexión por postulación (no swipe).
- **Modo disponible**: recibí alertas cuando aparezca un plan compatible cerca.
- **Chat** en tiempo real una vez confirmado el match.
- **Seguridad**:
  - Ubicación aproximada (~150m) hasta que hay match confirmado.
  - Ubicación compartida en vivo durante la salida.
  - Contacto de confianza que recibe tu ubicación si lo activás.
  - Botón de SOS en el chat del match.
  - Bloqueo de usuarios.
- **Sistema de reseñas** post-salida con reputación visible.

## Casos de uso

### Identidad y acceso
- **Registro** — darse de alta con email + password y obtener tokens.
- **Login** — entrar con credenciales (comparación timing-safe anti-timing-attack).
- **Login con Google** — registrarse/entrar vía OAuth.
- **Renovar token** — refrescar el access token con el refresh token.
- **Logout** — cerrar sesión y revocar el token activo.
- **Cambiar contraseña** — actualiza la clave e invalida otras sesiones.
- **Recuperar contraseña** — flujo request/confirm por email con token.
- **Ver mi perfil** — consultar datos propios y preferencias.

### Perfil y preferencias
- **Editar perfil** — nombre, bio, género, fecha de nacimiento.
- **Subir avatar** — procesado y optimizado en el servidor.
- **Configurar preferencias** — radio, actividades, tamaño de grupo, rango etario, género, notificaciones.
- **Ver perfil público** — consultar el perfil de otro usuario.
- **Darse de baja** — eliminar cuenta (soft delete + revocación de tokens).

### Planes
- **Crear plan** — publicar una salida (actividad, ahora/agendado, ubicación, radio, cupo).
- **Buscar planes** — ver planes cercanos en el mapa con filtros.
- **Ver detalle de plan** — información completa de una salida.
- **Editar plan** — modificar un plan propio abierto.
- **Cancelar plan** — dar de baja un plan propio.

### Matching
- **Postularse a un plan** — pedir sumarse a una salida.
- **Ver postulaciones recibidas** — (host) listar quién se postuló.
- **Aceptar/Rechazar postulación** — generar match o declinar.
- **Retirar postulación** — cancelar la propia antes de que se decida.
- **Ver mis matches** — listar y consultar salidas confirmadas.
- **Ver ubicación exacta** — revelar la ubicación real solo tras ser participante.
- **Completar/Cancelar match** — cerrar o dar por terminada la salida.

### Modo disponible
- **Activar modo disponible** — recibir alertas de planes compatibles cercanos.
- **Consultar estado** — ver si el modo está activo.
- **Desactivar modo disponible** — dejar de recibir alertas.

### Chat
- **Conectar al chat** — unirse por WebSocket al match.
- **Enviar mensajes** — chatear en tiempo real (Redis pub/sub).
- **Ver historial** — consultar mensajes pasados (paginado).
- **Marcar como leído** — marcar mensajes como vistos.
- **Borrar mensaje** — eliminar un mensaje propio.

### Seguridad
- **Gestionar contactos de confianza** — agregar/eliminar contactos.
- **Compartir ubicación en vivo** — enviar pings de ubicación durante la salida.
- **Ver ubicación del peer** — consultar ubicación (aproximada pre-match, exacta post-match).
- **Generar link de ubicación** — crear enlace público y revocable.
- **Disparar SOS** — alertar a contactos de confianza y registrar evento.
- **Bloquear/Desbloquear usuarios** — impedir contacto con alguien.

### Reputación y moderación
- **Dejar reseña** — puntuar post-salida (1-5) + comentario + flag opcional.
- **Ver reseñas de un usuario** — consultar historial y reputación.
- **Borrar reseña propia** — eliminar y recalcular reputación.
- **Reportar usuario** — reportar comportamiento inadecuado.

### Panel de administración

Consola de uso privado para un operador (rol `is_admin`). Todo endpoint exige `require_admin` y toda escritura registra un `AuditEvent`.

- **Dashboard** — estadísticas (usuarios, planes, matches, reportes abiertos).
- **Reportes** — revisar y resolver reportes de usuarios.
- **Reseñas** — moderar y eliminar reseñas.
- **Usuarios** — búsqueda/filtros (`q`, `status`, `is_admin`), gestionar rol admin (`grant`/`revoke` con protección de auto-revocado y último admin), editar datos (`PATCH`), reset password con contraseña temporal fuerte (revoca sesiones), y **detalle 360°** con historial (planes, matches, reportes recibidos/emitidos, reseñas dadas/recibidas, agregados).
- **Planes** — listado con filtros (status, actividad, host, rango de fechas, búsqueda), detalle sin anonimizar (host completo + ubicación del grid ~150m, `exact_location` siempre `None`), aplicaciones y matches, y acciones (cancelar, ocultar/mostrar, cerrar, cancelar match).
- **Configuración global** — defaults de usuarios, parámetros operativos en caliente, feature flags, modo mantenimiento + banner global, y **auditoría** filtrable. Los settings persistidos en DB pisan los defaults de env-vars en runtime (override DB > env-var, cache invalidable); los secretos nunca son editables.
- **Venues sponsoreados** — listado con filtros por estado, alta/edición de venues, flujo de aprobación (approve/pause/revoke) y CRUD de ofertas.
- **Gestión de admin** — otorgar/revocar rol admin vía CLI (`scripts/make_admin.py`).

### Notificaciones
- **Recibir notificaciones in-app** — postulaciones, matches, mensajes, seguridad, alertas.
- **Gestionar notificaciones** — listar, marcar leídas, borrar.
- **Suscripción push** — registrarse/desuscribirse de Web Push notifications.

## Stack técnico

- **Backend:** Python 3.12 + FastAPI (API monolítica, REST + WebSocket), Uvicorn.
- **ORM / migraciones:** SQLAlchemy 2.0 (async) + GeoAlchemy2, Alembic.
- **Base de datos:** PostgreSQL + PostGIS (queries geográficas).
- **Cache/realtime:** Redis (pub/sub de chat, tokens revocados, rate limiting).
- **Auth:** JWT (access + refresh) + OAuth Google; hashing Argon2.
- **Rate limiting:** slowapi (backed por Redis).
- **Notificaciones push:** Web Push API (pywebpush + VAPID).
- **Jobs:** APScheduler (expiración periódica de planes y disponibilidad).
- **Observabilidad:** structlog (logging) + Prometheus (métricas).
- **Configuración en caliente:** settings persistidos en DB (override DB > env-vars, cache invalidable), feature flags con fail-open controlado y modo mantenimiento (middleware 503 con exenciones).
- **Auditoría:** toda escritura del panel admin registra un `AuditEvent` (actor, acción, target, detalle).
- **Frontend:** React 19 + Vite 6 + TypeScript + Tailwind v4, TanStack Query v5, react-router-dom v7, Leaflet + OpenStreetMap.

## Estado del proyecto

El **backend está implementado**: autenticación completa, planes geolocalizados, matching por postulación, chat en tiempo real (WebSocket), modo disponible con alertas, seguridad (ubicación en vivo, contactos de confianza, SOS), reseñas y reputación, reportes, notificaciones in-app y push, rate limiting, headers de seguridad y observabilidad. El **panel de admin** del backend cubre moderación (reportes, reseñas, ban/suspender/reactivar usuarios), gestión avanzada de usuarios (rol admin, edición, reset password, detalle 360°), gestión de planes (listado, detalle sin anonimizar, acciones, aplicaciones/matches) y **configuración global** (defaults, parámetros operativos, feature flags, mantenimiento + banner, auditoría) con override DB > env-vars.

El **frontend está implementado** (fases F0–F7) en [`frontend/`](frontend/): autenticación (email + Google), perfil y preferencias, planes (explorar/crear/editar/cancelar), matching (postularse, aceptar/rechazar, matches), seguridad (contactos, live-tracking, peer, SOS, share-link + QR, vista pública), reseñas, reportes, modo disponible, notificaciones (lista, badge con polling, marcar/borrar) y **panel de admin** (dashboard, reportes, usuarios con detalle 360°, planes con detalle y acciones, configuración global con 5 tabs, venues sponsoreados, reseñas). Build de producción verde, tests unitarios con Vitest y E2E con Playwright.

### Pendiente / Fuera de alcance

Lo siguiente **no** está implementado y queda como trabajo futuro:

- **F5 — Chat realtime (WebSocket):** conexión WS, mensajería en vivo dentro del match. Actualmente no hay cliente de chat.
- **F7 — PWA / Web Push:** `vite-plugin-pwa`, service worker custom (`src/sw.ts`), `PushManager.subscribe` y VAPID. Los hooks de push (`useVapidPublicKey`, `useRegisterPush`, `useUnregisterPush`) existen en `features/notifications/hooks.ts` pero no hay UI ni SW que los consuma; las notificaciones operan vía HTTP poll.

## Estructura

```
gad/
├── docs/
│   └── superpowers/          # spec de diseño + planes por fase
├── Makefile                  # wrappers de docker compose (make help)
├── docker-compose.yml        # db (postgis) + redis + api + web (nginx) + seed
├── docker-compose.dev.yml    # override dev (HMR en web, --reload en api)
├── .env.example              # variables de entorno de ejemplo
├── backend/
│   ├── src/gad/
│   │   ├── main.py           # factory de la app FastAPI + lifespan
│   │   ├── auth/             # registro, login, OAuth, JWT, reset password
│   │   ├── users/            # perfil, preferencias, avatar, bloqueos
│   │   ├── plans/            # crear/listar/editar/cancelar planes
│   │   ├── matching/         # postulaciones, matches, completar/cancelar
│   │   ├── chat/             # mensajes REST + WebSocket
│   │   ├── availability/     # modo disponible + alertas geográficas
│   │   ├── safety/           # contactos, ubicación en vivo, share-link, SOS
│   │   ├── reviews/          # reseñas + reputación
│   │   ├── reports/          # reportes de usuarios
│   │   ├── notifications/    # notificaciones in-app + Web Push
│   │   ├── admin/            # panel de moderación + usuarios/planes/settings
│   │   ├── middleware/       # mantenimiento (503 con exenciones), rate limit
│   │   ├── feature_flags.py  # dependencia require_feature (fail-open controlado)
│   │   ├── settings_cache.py # SettingsService (override DB > env-var, cache)
│   │   └── models/           # modelos SQLAlchemy + GeoAlchemy2 (settings, audit)
│   ├── alembic/              # migraciones
│   ├── scripts/make_admin.py # CLI para otorgar/revocar rol admin
│   └── scripts/seed.py       # CLI para poblar datos de prueba
│   └── tests/                # suite con testcontainers (Postgres/Redis reales)
└── frontend/
    ├── index.html            # entry point
    ├── vite.config.ts        # Vite + proxy /api y /ws al backend
    ├── vitest.config.ts      # Vitest (jsdom + coverage)
    └── src/
        ├── main.tsx          # bootstrap (QueryClient, router, AuthProvider)
        ├── router.tsx        # rutas con lazy/code-split + guards (auth/admin)
        ├── api/              # cliente HTTP (fetch wrapper, ApiError, types)
        ├── auth/             # login, registro, OAuth Google, rate limit
        ├── lib/              # geo (haversine/geo), format, env feature flags
        ├── components/       # UI primitives (Button, Modal, Avatar…) y layout
        ├── pages/            # landing y rutas top-level
        └── features/         # dominios (feature-sliced)
            ├── plans/        # explorar, crear, editar, cancelar
            ├── matching/     # postularse, aceptar/rechazar, matches
            ├── users/        # perfil, preferencias, avatar, bloqueos
            ├── safety/       # contactos, live-tracking, peer, SOS, share-link
            ├── reviews/      # reseñas + reputación
            ├── reports/      # reportes de usuarios
            ├── availability/ # modo disponible
            ├── notifications/# lista, badge, marcar/borrar
            └── admin/        # dashboard, reportes, usuarios (+detalle 360°),
                              # planes (+detalle/acciones), configuración global,
                              # venues sponsoreados, reseñas
```

## Comandos (Makefile)

Hay un `Makefile` en la raíz que envuelve los comandos habituales de Docker Compose para el stack full-stack. Lista completa con `make help` (o simplemente `make`).

```bash
cp .env.example .env   # solo la primera vez; completar POSTGRES_PASSWORD y JWT_SECRET
make up-d              # levanta el stack prod-like en background
make up-dev-d          # levanta el stack de desarrollo (HMR + reload) en background
```

| Target | Acción |
|---|---|
| `make up` / `make up-d` | Levanta el stack prod-like (foreground / background). |
| `make up-dev` / `make up-dev-d` | Levanta el stack de desarrollo (Vite HMR + `uvicorn --reload`). |
| `make down` | Frena y elimina contenedores (mantiene los datos/volumen). |
| `make stop` / `make start` | Frena / reanuda contenedores sin borrarlos. |
| `make restart` / `make restart-api` / `make restart-web` | Reinicia todos / solo API / solo frontend. |
| `make ps` / `make logs` / `make logs-api` | Estado / logs de todos / logs de un servicio. |
| `make health` | Comprueba el endpoint `/health` de la API. |
| `make build` / `make pull` | Reconstruye imágenes / descarga imágenes base nuevas. |
| `make migrate` / `make migrate-new NAME=...` | Aplica migraciones / crea una migración vacía. |
| `make seed` / `make seed-reset` | Aplica el seed (idempotente) / trunca y resiembra. |
| `make db-shell` | Abre un `psql` interactivo contra la base de datos. |
| `make db-reset` | **Destructivo:** borra el volumen de DB y la vuelve a crear (migraciones + seed). |
| `make shell-api` / `make shell-web` | Shell dentro del contenedor de la API / frontend. |
| `make test` / `make test-fe` / `make test-e2e` | Tests backend / tests frontend (Vitest) / E2E (Playwright). |
| `make clean` | Elimina contenedores e imágenes locales (sin tocar volúmenes). |
| `make nuke` | **Destructivo:** borra contenedores, imágenes **y volúmenes** (datos incluidos). |

Para forzar el perfil de dev en un comando puntual, usar `DEV=1` (p. ej. `make DEV=1 logs-api`). El flujo recomendado es usar directamente los targets `up-dev*`.

> Los targets asumen que la herramienta `make` está instalada (incluida por defecto en macOS/Linux). No requieren GNU make específicamente.

## Desarrollo

```bash
cd backend
uv sync                              # instala dependencias
uv run pytest                        # corre los tests
uv run uvicorn gad.main:app --reload # levanta la API en :8000
```

Variables de entorno en `.env` (ver `.env.example`). El `entrypoint.sh` espera a la DB, corre las migraciones (`alembic upgrade head`) y arranca la API.

### Frontend

```bash
cd frontend
npm install                 # instala dependencias
npm run dev                 # dev server en :5173 (proxy /api y /ws al backend)
npm test                    # tests unitarios (Vitest)
npm run build               # build de producción
npm run test:e2e            # tests E2E (Playwright) — requiere el stack Docker levantado
```

El dev server de Vite hace proxy de `/api` y `/ws` al backend (`http://localhost:8000` por defecto, configurable con `VITE_PROXY_TARGET`). Los tests E2E de Playwright corren contra el stack Docker prod-like; ver la sección [Entorno Docker (full-stack)](#entorno-docker-full-stack) para levantarlo y los comandos detallados.

### Entorno Docker (full-stack)

El stack completo corre en Docker: `db` (Postgres+PostGIS), `redis`, `api` (FastAPI en `:8000`), `web` (nginx en `:5173` que sirve el frontend y hace de reverse proxy `/api` → api) y `seed` (puebla datos de prueba una sola vez).

#### Producción-like (default)

```bash
# Copiar .env.example a .env y ajustar POSTGRES_PASSWORD y JWT_SECRET
cp .env.example .env

docker compose up --build
```

- Frontend: <http://localhost:5173> (nginx sirve el build de Vite + proxy `/api` y `/ws` al backend).
- API: <http://localhost:8000> (directo; el navegador usa `:5173`).
- El servicio `seed` corre automáticamente la primera vez (y es idempotente: no duplica si ya se aplicó).

#### Desarrollo con HMR

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Override para desarrollo: `web` pasa a ser el dev server de Vite (HMR, puerto `:5173`) y `api` arranca con `--reload`. Las migraciones de Alembic corren automáticamente al levantar (via `entrypoint.dev.sh`). Los cambios en `frontend/` y `backend/src/` se reflejan en caliente (montados como volúmenes).

#### Datos de prueba (seed)

El seed crea 5 usuarios y un dataset rico (planes, un match completado con reseñas, notificaciones, contactos de confianza, availability):

| Usuario | Email | Password | Rol |
|---|---|---|---|
| Admin | `admin@example.com` | `Test1234` | admin |
| Alice | `alice@example.com` | `Test1234` | user |
| Bob | `bob@example.com` | `Test1234` | user |
| Carol | `carol@example.com` | `Test1234` | user |
| Diana | `diana@example.com` | `Test1234` | user |

Para re-sembrar desde cero:

```bash
docker compose run --rm seed python -m scripts.seed --reset
```

#### Tests E2E (Playwright)

Con el stack prod-like levantado (`docker compose up`):

```bash
cd frontend
npx playwright install chromium   # solo la primera vez
npm run test:e2e                  # corre los specs contra localhost:5173
npm run test:e2e:ui               # inspector interactivo
```

Los specs asumen el seed aplicado (login con cuentas sembradas, flujo de admin, smoke de explore/matches).

### Tests en Docker

Los tests usan [testcontainers](https://testcontainers.com/) con Postgres/Redis reales. Para correrlos dentro de Docker (sin instalar nada local):

```bash
./run-tests-docker.sh                       # suite completa
./run-tests-docker.sh tests/test_auth.py -v # un subset
NO_BUILD=1 ./run-tests-docker.sh            # saltar rebuild
```

### Gestión de admin

```bash
cd backend
uv run python -m scripts.make_admin user@example.com            # otorgar
uv run python -m scripts.make_admin user@example.com --revoke   # revocar
```

Más detalle en [`backend/README.md`](backend/README.md).
