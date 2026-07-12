# Panel de Administración — Expansión (Spec de diseño)

**Fecha:** 2026-07-12
**Estado:** Diseño (pendiente de aprobación → plan)
**Stack:** Extender el frontend React existente + endpoints/tablas nuevos en el backend FastAPI.

## Contexto y motivación

GAD ya cuenta con un panel de administración dentro del frontend React
(`frontend/src/features/admin/`) que cubre dashboard, reportes, reseñas, una
gestión básica de usuarios (ban/suspender/activar) y venues sponsoreados
(este último completo en el backend). El backend expone `GET /admin/*` tras la
dependencia `require_admin` (verifica `User.is_admin`).

Este spec expande ese panel para convertirlo en una **consola de administración
completa**: gestión avanzada de usuarios, gestión de propuestas/planes,
configuraciones globales editables en caliente (con feature flags y modo
mantenimiento) y consolidación de la carga de venues sponsoreados.

La configuración global **no existe hoy**: toda la configuración vive en
variables de entorno (`backend/src/gad/config.py`), leídas una vez al arranque
vía `pydantic-settings` y cacheadas con `@lru_cache`. Este spec introduce un
sistema de settings persistido en DB que **pisa** los defaults de env-vars en
runtime, sin reinicio.

## Decisión del usuario

- **Stack:** ampliar el frontend React actual (React 19 + React Query + Tailwind
  v4 + react-router v7). No se crea una app jQuery aparte.
- **Alcance funcional:** usuarios (rol admin, edición/reset password, búsqueda,
  detalle 360°), propuestas (listado/filtros, detalle, acciones,
  aplicaciones/matches), configuraciones globales (defaults, parámetros
  operativos, feature flags, mantenimiento+banner) y venues sponsoreados.
- **Modelo de configuración:** tablas por dominio (4 tablas).
- **Enfoque:** incremental por dominio (sub-proyectos) con infraestructura de
  settings como base.

## Arquitectura general

### Principios

1. **Todo endpoint admin exige `require_admin`.** Sin excepciones. El control
   de acceso es binario (`User.is_admin`); no se introduce un sistema de roles
   granular en este spec (YAGNI — uso privado de un único operador).
2. **Patrón existente del módulo admin:** cada dominio expone
   `router.py` (endpoints), `service.py` (lógica DB), `schemas.py` (DTOs
   Pydantic v2), `dependencies.py` (auth). Se replica sin crear un nuevo
   paquete.
3. **Settings con override DB > env-vars:** los defaults siguen siendo
   `config.py` (env vars); la DB solo guarda overrides. El backend lee con un
   `SettingsService` que combina ambos, cacheado en memoria e invalidable.
   Esto permite que un setting vuelva a su default borrando la fila de DB.
4. **No se exponen secretos ni rutas internas** desde el panel. Las
   configuraciones que contienen secretos (`jwt_secret`, `google_client_secret`,
   `database_url`, `redis_url`) **no son editables** desde el panel y no se
   exponen en `GET`.
5. **Auditoría:** toda operación de escritura del admin (ban, reset password,
   cambio de settings, cancelación de plan, etc.) registra un `AuditEvent`.
   Esencial para una consola de uso privado con acciones sensibles.

### División en sub-proyectos

Cada sub-proyecto es independiente (spec → plan → implementación → tests). El
orden resuelve dependencias:

| # | Sub-proyecto | Tablas nuevas | Endpoints | Frontend |
|---|---|---|---|---|
| 0 | **Infraestructura de Settings + Auditoría** | `user_defaults`, `operational_settings`, `feature_flags`, `maintenance_state`, `audit_events` | `GET/PUT /admin/settings/*` | — |
| 1 | **Usuarios admin** | — (modelos existentes) | nuevos sobre `/admin/users/*` | páginas/componentes |
| 2 | **Planes admin** | — | nuevos sobre `/admin/plans/*` | páginas |
| 3 | **Configuraciones globales (UI)** | — | — | página de settings |
| 4 | **Venues admin (UI)** | — | ya existen | página de venues |

---

## Sub-proyecto 0 — Infraestructura de Settings + Auditoría

Es la base. Sin esto no hay feature flags ni modo mantenimiento funcionales.

### 0.1 Modelo de datos — 4 tablas de settings + 1 de auditoría

Resuelto por el usuario: **tablas por dominio**. Cada tabla es una fila única
(singleton de dominio) o filas por clave, según la naturaleza del dominio.

#### `user_defaults` (singleton: una fila, id fijo `1`)

Defaults aplicados a nuevos usuarios y, opcionalmente, como fallback cuando un
`UserPreferences` no define un valor. Hoy estos valores son defaults
hardcodeados en el modelo `UserPreferences`.

```python
class UserDefaults(Base, TimestampMixin):
    __tablename__ = "user_defaults"
    id: int  # PK fija = 1 (singleton)
    default_plan_validity_mins: int      # hoy 120 en UserPreferences
    default_search_radius_m: int         # hoy 2000
    age_range_min: int                   # hoy 18
    age_range_max: int                   # hoy 99
    group_size_preference: str           # GroupSizePreference
    gender_preference: str               # GenderPreference
    activity_types: list[str]            # JSONB; tipos de actividad disponibles
```

`activity_types` actúa también como catálogo de actividades **disponibles** en
la app: el frontend lista estos valores en los selectores.

#### `operational_settings` (singleton: una fila, id fijo `1`)

Parámetros operativos. **Clasificación crítica:** algunos aplican en caliente,
otros no.

```python
class OperationalSettings(Base, TimestampMixin):
    __tablename__ = "operational_settings"
    id: int  # PK fija = 1
    # --- aplican en caliente (leídos por request vía SettingsService) ---
    rate_limit_enabled: bool
    default_rate_limit: str              # "300/minute"
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    max_avatar_bytes: int
    ws_max_message_rate: int
    # --- NO aplican en caliente (informativos; requieren reinicio) ---
    # Estos se marcan como read-only en la UI con una nota.
    # No se persisten acá: se muestran desde config.py para referencia.
```

**Decisión técnica importante — qué es "en caliente" vs "requiere reinicio":**

| Setting | En caliente | Nota |
|---|---|---|
| `rate_limit_enabled` | Sí | `SettingsService.rate_limit_enabled()` se lee en el middleware de rate limit por request. |
| `default_rate_limit` | Sí | slowapi permite cambiar el límite default por request. |
| `access_token_expire_minutes` | Sí | se aplica en `create_access_token` al firmar. Afecta tokens nuevos; los ya emitidos conservan su exp. |
| `refresh_token_expire_days` | Sí | idem al emitir refresh tokens. |
| `max_avatar_bytes` | Sí | se valida por request en el endpoint de avatar. |
| `ws_max_message_rate` | Sí | el `SlidingWindowRateLimiter` del WS lo lee por conexión nueva. |
| `jwt_secret`, `cors_origins`, `trusted_hosts`, `database_url`, `redis_url`, `google_*`, `csp_policy`, `forwarded_allow_ips`, `max_request_body_size` | **No** | Se cargan al arranque y/o son secretos. **No editables** desde el panel. Se muestran como read-only en la UI (excepto secretos, que se ocultan). |

#### `feature_flags` (muchas filas, una por flag)

```python
class FeatureFlag(Base, TimestampMixin):
    __tablename__ = "feature_flags"
    key: str          # PK (ej. "venues_sponsors", "reviews", "availability", "google_oauth")
    enabled: bool
    description: str | None
```

Lista inicial de flags (todos arrancan `enabled=True` para no romper la app):

- `venues_sponsors` — módulo de venues/ofertas.
- `reviews` — sistema de reseñas.
- `availability` — modo disponible.
- `google_oauth` — login con Google (si `google_client_id` está vacío, queda
  forzado a `False` sin importar la DB).
- `safety_sos` — botón de SOS.
- `maintenance_block` — complementa al `maintenance_state.enabled` (ver 0.1.4).

**Semántica de lectura:** `SettingsService.is_feature_enabled(key)` devuelve
`False` si la fila existe y `enabled=False`, o si el flag no existe (fail-closed
sólo para `maintenance_block`; los demás defaultean a `True` para no romper
funcionalidad existente — fail-open controlado). El seed crea las filas en
`True`.

#### `maintenance_state` (singleton: una fila, id fijo `1`)

```python
class MaintenanceState(Base, TimestampMixin):
    __tablename__ = "maintenance_state"
    id: int  # PK fija = 1
    enabled: bool
    message: str        # texto del banner / mensaje de mantenimiento
    banner_active: bool # banner global independiente del modo mantenimiento
    banner_message: str
    banner_level: str   # "info" | "warning"
    updated_by: UUID    # FK users.id (auditoría)
```

Dos conceptos independientes:
- **Modo mantenimiento** (`enabled`): bloquea los endpoints no-admin (devuelve
  503 con `message`) excepto `/health*`, `/metrics`, `/auth/login` (para que el
  admin pueda entrar), `/auth/me`, `/auth/refresh` y todo `/admin/*`.
- **Banner global** (`banner_active`): un aviso no bloqueante que el frontend
  muestra a todos los usuarios (vía `GET /auth/me` o un endpoint público).

#### `audit_events` (muchas filas)

```python
class AuditEvent(Base, TimestampMixin):
    __tablename__ = "audit_events"
    id: UUID            # PK
    actor_id: UUID | None  # FK users.id; None para acciones de sistema
    action: str         # ej. "user.ban", "user.set_admin", "settings.update", "plan.cancel"
    target_type: str    # "user" | "plan" | "venue" | "settings" | "feature_flag"
    target_id: str | None
    detail: dict        # JSONB; snapshot del cambio (before/after, reason, etc.)
```

Registran acciones sensibles del admin. No es un log de todos los requests
(para eso están las métricas Prometheus), sino de **acciones administrativas**.

### 0.2 `SettingsService`

Clase singleton con cache en memoria (TTL corto, ej. 15 s) o invalidación
explícita. Toda lectura de settings en runtime pasa por aquí.

```python
class SettingsService:
    async def get_user_defaults(self) -> UserDefaults: ...
    async def get_operational(self) -> OperationalSettings: ...
    async def is_feature_enabled(self, key: str) -> bool: ...
    async def get_maintenance(self) -> MaintenanceState: ...
    async def invalidate(self) -> None: ...   # tras un PUT de settings

# Dependencia FastAPI
async def get_settings_service() -> SettingsService: ...
```

**Lecturas de los defaults de env-vars:** `SettingsService` recibe el objeto
`config.Settings` y lo usa como fallback. Si una fila de DB no existe o un
campo es `None`, se usa el valor de `config.py`. Esto permite "resetear" un
setting borrándolo (o seteándolo a `None`).

**Integración en runtime (en caliente):**

- **Rate limiting** (`middleware/rate_limit.py`): el middleware consulta
  `SettingsService` para saber si está habilitado y el límite default. Como el
  middleware no es `async`-consciente del DI de FastAPI, lee de un singleton
  módulo-level inicializado en `lifespan`.
- **Creación de tokens** (`auth/jwt.py`): `create_access_token` /
  `create_refresh_token` reciben la expiración como parámetro (inyectado por el
  caller, que a su vez la lee de `SettingsService`), en vez de leer
  `settings.access_token_expire_minutes` directo.
- **Avatar** (`users/router.py`): valida `max_avatar_bytes` contra
  `SettingsService`.
- **WebSocket** (`chat/websocket.py`): el rate limiter lee
  `ws_max_message_rate` de `SettingsService`.
- **Feature flags:** nueva dependencia
  `require_feature(key)` → lanza `ServiceUnavailableError(503)` si el flag está
  off. Los routers de venues, reviews, availability, safety y el botón Google
  la usan.
- **Mantenimiento:** nuevo middleware `MaintenanceMiddleware` que devuelve 503
  para rutas no exceptuadas cuando `maintenance_state.enabled` es `True`.

**Seed e inicialización:** un job de arranque (en `lifespan`, best-effort como
los existentes) crea los singletons (`user_defaults`, `operational_settings`,
`maintenance_state`) si no existen, copiando los defaults de `config.py`. Las
feature flags se seedean desde una lista constante.

### 0.3 Endpoints (todos `require_admin`)

```
GET    /admin/settings/user-defaults          → UserDefaultsOut
PUT    /admin/settings/user-defaults          → UserDefaultsOut   (body UserDefaultsIn)

GET    /admin/settings/operational            → OperationalSettingsOut
PUT    /admin/settings/operational            → OperationalSettingsOut

GET    /admin/settings/feature-flags          → list[FeatureFlagOut]
PUT    /admin/settings/feature-flags/{key}    → FeatureFlagOut     (body {enabled: bool})

GET    /admin/settings/maintenance            → MaintenanceStateOut
PUT    /admin/settings/maintenance            → MaintenanceStateOut (body MaintenanceIn)

GET    /admin/settings/audit                  → PaginatedOut[AuditEventOut]   (filtros: actor, action, target, before)
```

Todo `PUT` invalida el cache del `SettingsService`, escribe un `AuditEvent` y
devuelve el estado nuevo.

### 0.4 Migración Alembic

Una migración `0005_admin_settings_and_audit` crea las 5 tablas. Los
singletons se inicializan por código (lifespan) o por un step de migración con
`op.bulk_insert` — se opta por **lifespan best-effort** (consistente con el
patrón del proyecto) más seed idempotente.

### 0.5 Tests

- `SettingsService`: override DB > env-var, cache, invalidación, fail-open de
  flags.
- Endpoints: autorización (403 sin admin), round-trip PUT, auditoría escrita.
- Middleware de mantenimiento: rutas exceptuadas pasan, resto 503.
- Dependencia `require_feature`: 503 cuando flag off.

---

## Sub-proyecto 1 — Usuarios admin

### 1.1 Endpoints nuevos sobre `/admin/users`

**Búsqueda y filtros** (extender el `GET /admin/users` existente con query
params):

```
GET /admin/users?status=&q=&is_admin=&limit=&before=   → PaginatedOut[AdminUserOut]
```

- `q`: búsqueda case-insensitive por `email` o `display_name` (`ILIKE`).
- `is_admin`: filtro booleano.
- Mantiene `status`, `limit`, `before` (paginación por cursor).

**Gestión de rol admin:**

```
POST /admin/users/{user_id}/grant-admin   → AdminUserOut   (is_admin = True)
POST /admin/users/{user_id}/revoke-admin  → AdminUserOut   (is_admin = False)
```

Restricción: **un admin no puede quitarse `is_admin` a sí mismo** (evita
quedarse sin acceso). El último admin no puede ser revocado (validación:
`SELECT count(*) WHERE is_admin AND status='active'`). Ambas escriben
`AuditEvent`.

**Edición de datos:**

```
PATCH /admin/users/{user_id}              → AdminUserDetailOut (body AdminUserUpdateIn)
```

`AdminUserUpdateIn`: `display_name?`, `email?`, `locale?`, `timezone?`,
`verification_level?`. Cambiar `email` dispara la misma lógica de unicidad que
el registro. `verification_level` solo puede subirse (`none → email → google`),
no bajarse de `google` a `none` sin confirmación explícita (reflejado en el
contract).

**Reset password (admin):**

```
POST /admin/users/{user_id}/reset-password → {temporary_password: str}
```

El admin fuerza un reset generando una contraseña temporal aleatoria, setea
`password_hash` (argon2) y dispara `revoke_user` (invalida sesiones, igual que
`change-password`). La contraseña temporal se devuelve **una sola vez** en la
respuesta y se muestra en el panel. `AuditEvent` con `action="user.reset_password"`.
El usuario debe cambiarla en el próximo login (no se implementa "forzar cambio"
automático en este spec — la contraseña temporal es suficientemente fuerte).

**Detalle / historial 360°:**

```
GET /admin/users/{user_id}               → AdminUserDetailOut
GET /admin/users/{user_id}/plans         → PaginatedOut[PlanListItem]
GET /admin/users/{user_id}/matches       → PaginatedOut[MatchOut]
GET /admin/users/{user_id}/reports       → {filed: ReportOut[], received: ReportOut[]}
GET /admin/users/{user_id}/reviews       → {given: ReviewOut[], received: ReviewWithReviewer[]}
```

`AdminUserDetailOut` extiende `AdminUserOut` con: `bio`, `birth_date`, `gender`,
`locale`, `timezone`, `verification_level`, `last_active_at`, `google_id?`,
`avatar_url?`, y contadores (`plans_count`, `matches_count`, `reports_received`,
`avg_rating`).

### 1.2 Frontend

Páginas bajo `features/admin/pages/`:

- **`UsersAdminPage`** (existe — extender): tabla con búsqueda (`q`), filtros
  (`status`, `is_admin`), acciones por fila (ban/suspend/activate — ya están,
  agregar grant/revoke-admin, reset-password con modal de confirmación que
  muestra la contraseña temporal).
- **`UserDetailAdminPage`** (nueva, ruta `/admin/users/:id`): cabecera con datos
  + edición inline, y secciones de historial (planes, matches, reportes,
  reseñas) consumiendo los endpoints 360°.
- Componentes: `AdminUserSearchBar`, `UserDetailSections`, `ResetPasswordModal`.
- Hooks en `features/admin/hooks.ts`:
  `useAdminUsersSearch`, `useGrantAdmin`, `useRevokeAdmin`, `useUpdateUserAdmin`,
  `useResetUserPassword`, `useAdminUserDetail`, `useAdminUserPlans`, etc.

### 1.3 Tests

- Backend: búsqueda `ILIKE`, restricción de auto-revocado, último admin,
  reset password (revoca sesiones), detalle 360°.
- Frontend: `hooks.test.tsx` con los nuevos hooks (patrón existente).

---

## Sub-proyecto 2 — Planes admin

### 2.1 Endpoints nuevos sobre `/admin/plans`

```
GET /admin/plans?status=&activity=&host_id=&q=&from=&to=&limit=&before=
    → PaginatedOut[AdminPlanListItem]

GET /admin/plans/{plan_id}             → AdminPlanOut
POST /admin/plans/{plan_id}/cancel     → {message}        (ya existe)
POST /admin/plans/{plan_id}/hide       → AdminPlanOut     (hidden_by_host = True)
POST /admin/plans/{plan_id}/unhide     → AdminPlanOut     (hidden_by_host = False)
POST /admin/plans/{plan_id}/close      → AdminPlanOut     (fuerza status=closed)

GET /admin/plans/{plan_id}/applications → list[ApplicationOut]
GET /admin/plans/{plan_id}/matches      → list[MatchOut]
POST /admin/matches/{match_id}/cancel   → MatchOut
```

`AdminPlanOut` extiende el `PlanOut` de usuario pero **sin anonimizar**: incluye
`host` completo (`AdminUserOut` reducido), `exact_location` (lat/lng reales, no
el grid), y `hidden_by_host`. Filtros: `status` (PlanStatus), `activity`
(ActivityType), `host_id`, `q` (búsqueda en title/description/location_label),
rango `from`/`to` sobre `created_at`.

`AdminPlanListItem`: `id, title, activity_type, status, mode, host_summary,
current/max_participants, created_at, expires_at, hidden_by_host`.

### 2.2 Frontend

- **`PlansAdminPage`** (nueva, ruta `/admin/plans`): tabla con filtros
  (status, activity, host, rango fechas, búsqueda), acciones por fila
  (ver, cancelar, ocultar/mostrar, cerrar).
- **`PlanDetailAdminPage`** (nueva, `/admin/plans/:id`): detalle sin anonimizar,
  mapa Leaflet con `exact_location`, lista de aplicaciones, lista de matches
  con acción de cancelar match.
- Hooks: `useAdminPlans`, `useAdminPlanDetail`, `useAdminPlanApplications`,
  `useAdminPlanMatches`, `useAdminCancelMatch`, `useAdminHidePlan`, etc.

### 2.3 Tests

- Backend: filtros compuestos, `exact_location` expuesto solo en admin, acciones
  (hide/close idempotentes), cancel de match.
- Frontend: hooks.

---

## Sub-proyecto 3 — Configuraciones globales (UI)

### 3.1 Frontend

Una sola página **`SettingsAdminPage`** (ruta `/admin/settings`) con tabs:

1. **Defaults de usuarios:** formulario editable (validez de plan, radio, rango
   edad, tamaño grupo, preferencia género, tipos de actividad multiselect).
2. **Parámetros operativos:** formulario con los settings en caliente
   editables + sección read-only de los que requieren reinicio (con nota).
3. **Feature flags:** lista de toggles.
4. **Mantenimiento & banner:** toggle de modo mantenimiento + mensaje, toggle
   de banner + mensaje + nivel (info/warning), con confirmación para activar
   mantenimiento (muestra advertencia de que bloqueará usuarios).
5. **Auditoría:** tabla filtrable de `AuditEvent` (por actor, acción, target).

Cada tab usa un `useMutation` que pega al `PUT` correspondiente, invalida la
query de lectura y muestra toast (`sonner`). El tab de mantenimiento tiene
feedback reforzado por el riesgo (confirmación doble).

### 3.2 Tests

- Frontend: render de cada tab, round-trip edit→save→invalidate, confirmación
  de mantenimiento.

---

## Sub-proyecto 4 — Venues admin (UI)

Los endpoints **ya existen** completos (`POST/GET/PATCH /admin/venues/*`,
approve/pause/revoke, offers CRUD). Este sub-proyecto es puramente UI: traer
la carga/gestión de venues sponsoreados al panel consolidado.

### 4.1 Frontend

- **`VenuesAdminPage`** (nueva, ruta `/admin/venues`): listado con filtros por
  `status`, botón "Nuevo venue" (modal/form con `VenueCreateIn`), acciones por
  fila (approve/pause/revoke según estado), y "Gestionar ofertas" →
  sub-vista/off-canvas con CRUD de `VenueOffer`.
- Reutiliza los hooks existentes (`useAdminVenues`, `useCreateVenue`, etc.) y
  añade los falten (`useUpdateVenue`, `useCreateVenueOffer`, `useUpdateVenueOffer`,
  `useDeleteVenueOffer`) si no están.
- **`VenueDetailAdminPage`** (opcional, `/admin/venues/:id`): detalle + mapa +
  gestión de ofertas. Se decide en el plan si vale como página aparte o como
  panel deslizable.

### 4.2 Tests

- Frontend: render, flujo create→approve→pause→revoke, CRUD offers.

---

## Navegación

El `AdminNav` existente se amplía con entradas: **Dashboard, Usuarios, Planes,
Venues, Configuración, Reportes, Reseñas.** El dashboard (`DashboardPage`)
gana widgets de estado (mantenimiento activo, flags apagados, contadores) para
dar visibilidad rápida.

## Endpoints resumen (nuevos)

```
# Settings
GET/PUT /admin/settings/user-defaults
GET/PUT /admin/settings/operational
GET     /admin/settings/feature-flags
PUT     /admin/settings/feature-flags/{key}
GET/PUT /admin/settings/maintenance
GET     /admin/settings/audit

# Users (ampliación)
GET     /admin/users  (+ q, is_admin)
POST    /admin/users/{id}/grant-admin
POST    /admin/users/{id}/revoke-admin
PATCH   /admin/users/{id}
POST    /admin/users/{id}/reset-password
GET     /admin/users/{id}
GET     /admin/users/{id}/plans
GET     /admin/users/{id}/matches
GET     /admin/users/{id}/reports
GET     /admin/users/{id}/reviews

# Plans
GET     /admin/plans
GET     /admin/plans/{id}
POST    /admin/plans/{id}/hide
POST    /admin/plans/{id}/unhide
POST    /admin/plans/{id}/close
GET     /admin/plans/{id}/applications
GET     /admin/plans/{id}/matches
POST    /admin/matches/{id}/cancel
# (cancel ya existe)
```

## Decisiones técnicas registradas

1. **No hay roles granulares.** Sólo `is_admin`. Suficiente para uso privado.
2. **Override DB > env-var con fail-open controlado.** Los defaults quedan en
   `config.py`; la DB solo guarda overrides. Borrar una fila = volver al default.
3. **Secretos nunca editables ni exponibles** desde el panel.
4. **Parámetros "en caliente" vs "reiniciables"** diferenciados explícitamente
   (tabla en 0.1). Los reiniciables son read-only en la UI.
5. **Auditoría obligatoria** para toda escritura admin.
6. **Feature flags fail-open** para módulos existentes (default `True`), salvo
   `maintenance_block` que es fail-closed.
7. **Reset password** devuelve contraseña temporal fuerte mostrada una sola vez;
   revoca sesiones. No se implementa "forzar cambio en próximo login" (YAGNI).
8. **Un admin no puede quitarse admin a sí mismo** ni quedar el sistema sin
   admins.
9. **`exact_location`** y datos del host se exponen sin anonimizar **solo** en
   endpoints `/admin/*`.
10. **Stack frontend:** el existente (React 19 + React Query + Tailwind v4).
    No se introduce jQuery ni app aparte.

## No está en el alcance (out of scope)

- Roles/permisos granulares (RBAC).
- Edición de secretos desde el panel.
- Notificaciones push a usuarios desde el admin (masivas).
- Exportación de datos (CSV/Excel) — se puede añadir luego.
- Localización del panel (se mantiene en español, como hoy).
- Tests E2E (Playwright) para admin — se priorizan tests unitarios/hooks.

## Orden de implementación

0 → 1 → 2 → 3 → 4. Cada sub-proyecto tiene su plan de implementación derivado
de este spec. Se puede detener tras cualquiera y el sistema queda coherente.
