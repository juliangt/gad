# Mis Planes — Design Spec

> **Feature:** El usuario puede ver y gestionar los planes que creó, desde una nueva pestaña "Planes" en la barra de navegación inferior.

**Fecha:** 2026-07-10
**Autor:** Julián Garcia Tuñón

---

## Objetivo

Dar al host (creador de un plan) un espacio central para gestionar sus propios planes: verlos, editar sus datos, eliminarlos, y consultar si tiene postulantes. Hoy la app solo permite *descubrir* planes ajenos cercanos (`GET /plans`), pero no hay forma de listar los propios ni de gestionarlos en conjunto.

## Decisiones clave (validadas con el usuario)

| Tema | Decisión |
|---|---|
| Pestaña "Planes" | Unificada: dos sub-tabs internos — "Creados por mí" y "Postulaciones" |
| Bottom nav | 4 tabs: Explorar, Planes, Matches, Perfil |
| Campos editables | `title`, `description`, `scheduled_at` (actuales) **+ `max_participants` + `search_radius_m`** |
| Postulantes | Contador en la tarjeta + link a la página existente `/plans/:id/applications` |
| Eliminar | Soft-cancel (`status=cancelled`) + flag `hidden_by_host=true` (oculta de la vista del host) |
| Arquitectura backend | Enfoque A: endpoint dedicado `GET /me/plans` + columna `hidden_by_host` |

## Fuera de alcance (YAGNI)

- Gestión inline de postulantes (aceptar/rechazar sin salir de la lista). Se reutiliza la página existente.
- Hard delete de planes (rompería integridad referencial con matches, applications y notificaciones).
- Filtros avanzados (por actividad, fecha, radio) más allá del filtro por status. Se pueden sumar después.
- Notificaciones push sobre nuevos postulantes (ya existe el sistema de `Notification` in-app).

---

## 1. Base de datos

### Migración Alembic `0003_plan_hidden_flag`

Nueva columna en la tabla `plans`:

| Columna | Tipo | Constraints |
|---|---|---|
| `hidden_by_host` | `Boolean` | `nullable=False, default=False` |

No se agregan índices extra: las consultas de `/me/plans` filtran por `host_id` (ya indexado en `plan.py:31-36`) + `hidden_by_host`.

**Sin otros cambios estructurales.** El contador de postulantes pendientes se computa con un subquery sobre `plan_applications` (no requiere columna nueva). `Plan.current_participants` ya cuenta los aceptados; los pendientes se cuentan al vuelo.

**Justificación del flag:** permite el "doble paso" pedido — cancelar el plan (efecto: deja de ser visible para otros en `/plans`) y ocultarlo de la vista del host (efecto: no aparece en `/me/plans`) — en una sola operación, sin borrar datos.

---

## 2. Backend / API

### Modelo (`backend/src/gad/models/plan.py`)

- Agregar `hidden_by_host: Mapped[bool]` con `mapped_column(Boolean, nullable=False, default=False)`.

### Nuevo endpoint `GET /me/plans`

Se agrega al `matching/router.py` (donde ya vive `/me/applications`, `matching/router.py:165`), para mantener la consistencia del namespace `/me/*`.

| Método | Path | Auth | Query params |
|---|---|---|---|
| GET | `/me/plans` | `get_current_user` | `status?` (csv de estados), `page` (default 1), `page_size` (default 20, máx 50) |

**Comportamiento:**
- Lista planes donde `host_id == current_user.id` AND `hidden_by_host == False`.
- Orden: `created_at desc`.
- Filtro opcional por `status` (uno o varios estados separados por coma: `open,matched,closed,cancelled,expired`).
- Paginación estándar (usa `PaginatedOut[T]` de `schemas/pagination.py`).
- Para cada plan, computa `pending_applications_count` = cantidad de `PlanApplication` con `status == pending` para ese plan (subquery).

**Nuevo schema `MyPlanItem`** (`backend/src/gad/plans/schemas.py`):
- Todos los campos de `PlanOut` (title, description, activity_type, mode, scheduled_at, status, current_participants, max_participants, location_label, expires_at, created_at, host, location_lat, location_lng).
- `+ pending_applications_count: int`

### Modificación `PATCH /plans/{id}`

Ampliar `PlanUpdateIn` (`backend/src/gad/plans/schemas.py:34-37`) para aceptar:
- `max_participants: int | None` — validar rango `1..10`; rechazar (`ConflictError`) si es menor a `current_participants` actual del plan.
- `search_radius_m: int | None` — validar rango `100..50000`.

Restricciones existentes que se mantienen:
- Solo editable si `status == open` (service `update_plan`, `plans/service.py:75-86`).
- `scheduled_at` requerido solo si `mode == scheduled`.

**Inconsistencia a corregir:** unificar `description` `max_length` entre `PlanIn` (1000) y `PlanUpdateIn` (2000) — usar 2000 en ambos.

### Modificación `DELETE /plans/{id}` (cancel)

`cancel_plan` (`plans/service.py:68-72`) ahora además de `status = cancelled` setea `hidden_by_host = True`. Esto implementa el "eliminar" del host: el plan se cancela y deja de aparecer en su propia lista.

### Opción de ocultar un plan no-open

Permitir setear `hidden_by_host=true` vía `PATCH /plans/{id}` sin requerir `status == open`, ya que no cambia el estado del plan (solo la visibilidad para el host). Caso de uso: ocultar un plan `expired` o `cancelled` sin cancelarlo de nuevo.

### Service layer

- Nuevo `list_my_plans(session, host_id, status_filter, page, page_size)` en `plans/service.py` con el query + subquery de `pending_applications_count`.
- `cancel_plan` actualizado para setear ambos campos.
- `update_plan` actualizado para aceptar y validar `max_participants` y `search_radius_m`, y permitir setear `hidden_by_host` independientemente del status.

### Tests (`backend/tests/`)

- Listar mis planes: visibilidad correcta, paginación, exclusión de `hidden_by_host=true`.
- Filtro por `status` (uno y múltiples).
- `pending_applications_count` correcto (mix de pending/accepted/rejected).
- Editar `max_participants`: válido, menor a `current_participants` (rechazado), fuera de rango (rechazado).
- Editar `search_radius_m`: válido y fuera de rango.
- Cancel: verifica `status=cancelled` AND `hidden_by_host=true`.
- Ocultar un plan `expired` vía PATCH sin cancelar.

---

## 3. Frontend

### Bottom nav (`src/components/layout/MainLayout.tsx`)

- Pasa de 3 a 4 tabs: **Explorar, Planes, Matches, Perfil**.
- Ícono Planes: `ClipboardList` de `lucide-react`.
- La cápsula se ensancha para acomodar 4 items manteniendo el mismo estilo visual (`rounded-full`, backdrop blur, activos `text-brand-600`).

### Nueva página `PlansPage` (route `/plans`)

- Dentro de `MainLayout` (muestra bottom nav), route `/plans` en `router.tsx`.
- **Sub-tabs superiores:** "Creados por mí" / "Postulaciones".

**Sección "Creados por mí":**
- Hook `useMyPlans()` → `GET /me/plans`, query key `['me', 'plans']`.
- Cada tarjeta (`PlanCard` ampliado o nuevo `MyPlanCard`) muestra:
  - Datos del plan: icono de actividad, título, modo (Ahora/Agendado), `location_label`, expira.
  - Badge de estado: Abierto / Matcheado / Cancelado / Expirado.
  - Contador de cupo: `current_participants / max_participants`.
  - Contador de postulantes pendientes (ej. "3 postulantes") → al tocar, navega a `/plans/:id/applications`. Resaltado (badge) si hay pendientes.
  - Acciones: **Editar** (abre `EditPlanSheet`) y **Eliminar** (`ConfirmDialog` → DELETE).
- Estados: `isLoading` → `Spinner`; `isError` → `ErrorState`; lista vacía → `EmptyState` con CTA "Crear plan" → `/plans/new`.

**Sección "Postulaciones":**
- Reutiliza hook `useMyApplications` existente (`features/matching/hooks.ts`).
- Cada item linka al detalle del plan `/plans/:id`.

### Ampliación `EditPlanSheet`

Hoy edita `title`, `description`, `scheduled_at`. Se suman:
- `max_participants`: stepper 1–10, bloqueado a no menos de `current_participants`.
- `search_radius_m`: slider o select (100 m – 50 km).
- Valida con `zod` (`planUpdateSchema` extendido).

### Nuevos hooks (`src/features/plans/hooks.ts`)

- `useMyPlans(params?)` → `GET /me/plans`, key `['me', 'plans', params]`.
- `useDeletePlan()` → `DELETE /plans/{id}` (extiende o reemplaza `useCancelPlan`), invalida `['me','plans']` y `['plans']` al confirmar.

### Flujo de "Eliminar"

`ConfirmDialog` ("¿Eliminar este plan? Se cancelará y dejará de ser visible para otros") → `DELETE /plans/{id}` → toast éxito + refresco.

### Manejo de estados de plan (prevención proactiva)

- "Editar" se deshabilita si `status != open`.
- "Eliminar" se oculta/deshabilita si el plan ya está `cancelled` o `hidden`.
- Si el backend rechaza igualmente (race condition), se muestra error inline.

---

## 4. Flujo de extremo a extremo

### Ver mis planes creados
1. Usuario toca tab **Planes** → `/plans`.
2. `PlansPage` carga `useMyPlans()` → `GET /me/plans` → lista de planes creados (excluye ocultos).
3. Lista vacía → EmptyState con CTA "Crear plan" → `/plans/new`.

### Ver postulantes
1. En cada tarjeta de plan, contador de postulantes pendientes.
2. Tocar el contador → `/plans/:id/applications` (página existente) → host acepta/rechaza.
3. Al volver a `/plans`, el contador se actualiza (invalidación de cache `['me','plans']`).

### Editar un plan
1. Tocar **Editar** → `EditPlanSheet`.
2. Edita title, description, scheduled_at, max_participants, search_radius_m.
3. Guardar → `PATCH /plans/{id}` → toast éxito + refresco. Si el plan no está `open`, el backend devuelve error y se muestra inline.

### Eliminar un plan
1. Tocar **Eliminar** → `ConfirmDialog`.
2. Confirmar → `DELETE /plans/{id}` → backend setea `status=cancelled` + `hidden_by_host=true` → toast éxito.
3. El plan desaparece de la lista (`GET /me/plans` no lo retorna).
4. Efecto colateral deseado: deja de aparecer en `GET /plans` para otros (el service ya filtra `status==open`).

### Gestión de postulaciones propias
1. Sub-tab **Postulaciones** → lista planes a los que me postulé.
2. Cada item linka a `/plans/:id` para ver detalle o retirar postulación.

---

## 5. Casos límite

- **Plan que expira mientras el usuario lo ve:** el job `expire_plans` (`jobs/expire_plans.py`) lo pasa a `expired`; el estado se actualiza al refrescar la lista.
- **Editar un plan `matched`/`expired`/`cancelled`:** el backend rechaza (`ConflictError`); el frontend deshabilita "Editar" si `status != open`.
- **Bajar `max_participants` por debajo de `current_participants`:** el backend rechaza con mensaje claro.
- **Eliminar un plan ya cancelado:** el botón no se muestra en la UI; si se llama igualmente, el backend es idempotente (cancel de cancelado = ok).
- **Ocultar un plan expirado:** vía `PATCH /plans/{id}` con `hidden=true`, sin requerir `status == open`.

---

## 6. Componentes afectados

| Archivo | Cambio |
|---|---|
| `backend/alembic/versions/0003_plan_hidden_flag.py` | Nuevo — migración |
| `backend/src/gad/models/plan.py` | + `hidden_by_host` column |
| `backend/src/gad/plans/schemas.py` | + `MyPlanItem`, ampliar `PlanUpdateIn`, corregir `description` max_length |
| `backend/src/gad/plans/service.py` | + `list_my_plans`, ampliar `update_plan`, ampliar `cancel_plan` |
| `backend/src/gad/plans/router.py` | (opcional) ampliar `_plan_to_out` si reusa helper |
| `backend/src/gad/matching/router.py` | + `GET /me/plans` endpoint |
| `backend/tests/` | Nuevos tests |
| `frontend/src/components/layout/MainLayout.tsx` | + tab Planes (4 tabs) |
| `frontend/src/router.tsx` | + route `/plans` → `PlansPage` |
| `frontend/src/features/plans/pages/PlansPage.tsx` | Nuevo — página con dos sub-tabs |
| `frontend/src/features/plans/components/MyPlanCard.tsx` | Nuevo — tarjeta con acciones |
| `frontend/src/features/plans/components/EditPlanSheet.tsx` | + campos max_participants, search_radius_m |
| `frontend/src/features/plans/hooks.ts` | + `useMyPlans`, ampliar `useDeletePlan` |
| `frontend/src/features/plans/schemas.ts` | + `myPlansSchema`, ampliar `planUpdateSchema` |

---

## 7. Testing

**Backend:** pytest. Cobertura del nuevo endpoint, validaciones de edición ampliada, comportamiento de cancel+hidden, ocultar plan no-open.

**Frontend:** Vitest (unit) para hooks y componentes; Playwright (e2e) para el flujo completo de crear → ver en Mis Planes → editar → eliminar.
