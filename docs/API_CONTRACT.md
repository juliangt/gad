# GAD — Contrato API (Backend → Frontend)

Contrato completo de la API REST + WebSocket del backend de GAD. Fuente de verdad para construir el frontend.

- **Base URL**: por defecto `http://localhost:8000` (sin prefijo global).
- **CORS**: el backend permite por defecto `http://localhost:5173` (Vite). Configurable vía `CORS_ORIGINS`.
- **Codificación**: JSON UTF-8 en todos los cuerpos (salvo `multipart` en avatar y `text/plain` en `/metrics`).
- **Fechas**: ISO 8601 (UTC con offset Z). Ej: `2026-07-09T18:30:00Z`.
- **IDs**: UUID v4 en formato string.

---

## 1. Autenticación

### Mecanismo
- Cabecera HTTP: `Authorization: Bearer <access_token>` (Bearer con B mayúscula y un espacio).
- Solo se aceptan tokens **access** (claim `type == "access"`). Los refresh tokens no sirven como Bearer.
- Al cambiar la contraseña, **todos los access tokens previos quedan invalidados** → forzar re-login.

### Tokens (JWT HS256)
| Token | TTL | Uso |
|-------|-----|-----|
| Access | 15 min (`access_token_expire_minutes`) | Bearer en cada request autenticada |
| Refresh | 7 días (`refresh_token_expire_days`) | Solo en `POST /auth/refresh` |

Claims: `sub` (user UUID), `type`, `iat`, `exp`, `jti` (id de revocación). El cliente puede leer `exp` para refrescar proactivamente, o reaccionar a 401.

### Manejo de sesión recomendado
1. Guardar `access_token` + `refresh_token` al login/register.
2. Programar refresh antes de `exp` (o interceptar 401 → llamar `/auth/refresh` → reintentar una vez).
3. En logout, llamar `POST /auth/logout` con el `access_token`.
4. Tras cambio de contraseña: descartar tokens y redirigir a login.

---

## 2. Formato de errores

Todos los errores de dominio (`GADError`) devuelven:

```json
{ "detail": "<mensaje en español>", "code": "<code>" }
```

Los errores de validación de Pydantic (422) usan el formato estándar de FastAPI (`detail` como array).

### Códigos y status
| code | status | Significado |
|------|--------|-------------|
| `auth_error` | 401 | No autenticado / token faltante |
| `invalid_credentials` | 401 | Credenciales incorrectas |
| `invalid_token` | 401 | Token inválido, expirado o revocado |
| `forbidden` | 403 | Sin permisos (ej. no es admin) |
| `not_found` | 404 | Recurso inexistente |
| `conflict` | 409 | Conflicto (duplicado, estado inválido) |
| `email_already_exists` | 409 | Email en uso |
| `validation_error` | 422 | Validación de negocio |
| `oauth_error` | 400 | Fallo OAuth |
| `rate_limit_exceeded` | 429 | Límite de tasa excedido |
| `error` | 400 | Error genérico |

Los límites de tasa (429) devuelven cabeceras estándar `Retry-After`.

---

## 3. Rate limits relevantes
| Endpoint | Límite |
|----------|--------|
| `POST /auth/register` | 5/min |
| `POST /auth/login` | 5/min |
| `POST /auth/oauth/google` | 5/min |
| `POST /auth/refresh` | 30/min |
| `POST /auth/password-reset/request` | 3/min |
| `POST /plans` | 10/hora |
| `POST /reviews` | 20/día |
| `POST /users/{user_id}/report` | 10/día |

---

## 4. Paginación

Endpoints de lista con cursor usan `PaginatedOut[T]`:

```json
{ "items": [ ... ], "next_cursor": "2026-07-09T18:00:00Z" | null }
```

- Query params: `limit` (con `ge`/`le` propios de cada endpoint) y `before: datetime` (ISO).
- `next_cursor` es el timestamp del último item cuando se alcanzó `limit`; pasarlo como `before` en la siguiente página. `null` = no hay más.

---

## 5. Enums

String-backed. Enviar/recibir los **valores** literales.

### `ActivityType`
`coffee`, `drinks`, `food`, `walk`, `park`, `event`, `other`

### `PlanMode`
`now`, `scheduled`

### `PlanStatus`
`open`, `matched`, `closed`, `cancelled`, `expired`

### `ApplicationStatus`
`pending`, `accepted`, `rejected`, `withdrawn`

### `MatchStatus`
`active`, `completed`, `cancelled`

### `MatchRole`
`host`, `participant`

### `Gender`
`male`, `female`, `nonbinary`, `undisclosed`

### `VerificationLevel`
`none`, `email`, `google`

### `GroupSizePreference`
`one_on_one`, `small_group`, `either`

### `GenderPreference`
`any`, `same`, `mixed`, `specific`

### `ContactType`
`email`, `phone`

### `NotificationType`
`new_application`, `match`, `new_message`, `safety`, `review`, `plan_alert`

### `ReviewFlag`
`no_show`, `inappropriate`, `false_info`

### `UserStatus`
`active`, `suspended`, `deleted`

---

## 6. Schemas comunes

```ts
// Genérico de paginación
PaginatedOut<T> { items: T[]; next_cursor: string | null }

// Mensaje simple
OKMessage { message: string }

// Error
ErrorOut { detail: string; code: string | null }
```

---

# Endpoints

## Auth (`/auth`)

### `POST /auth/register` · 201 · rate-limit 5/min
Crea cuenta y devuelve tokens.

**Body** `RegisterIn`:
```ts
{ email: string; password: string /* 8..128 */; display_name: string /* 1..100 */ }
```
**Response** `TokenOut`:
```ts
{ access_token: string; refresh_token: string; token_type: "bearer"; expires_in: int; user_id: UUID }
```
Errores: `409 email_already_exists`.

---

### `POST /auth/login` · 200 · rate-limit 5/min
**Body** `LoginIn`: `{ email: string; password: string }`
**Response**: `TokenOut`.
Errores: `401 invalid_credentials`.

> Nota de seguridad: el login siempre computa el hash (timing-safe) aunque el usuario no exista. El mensaje de error es genérico.

---

### `POST /auth/oauth/google` · 200 · rate-limit 5/min
Login/registro con Google. El `refresh_token` del body transporta el **código de autorización** de Google.

**Body** `RefreshIn`: `{ refresh_token: string /* = Google auth code */ }`
**Response**: `TokenOut`.
Errores: `400 oauth_error`.

> Disponible solo si el backend tiene configurado `GOOGLE_CLIENT_ID`/`SECRET`. Si están vacíos, el flujo falla en servidor.

---

### `POST /auth/refresh` · 200 · rate-limit 30/min
Renueva tokens a partir de un refresh token. **No requiere** Bearer.

**Body** `RefreshIn`: `{ refresh_token: string }`
**Response**: `TokenOut` (nueva pareja).
Errores: `401 invalid_token`.

---

### `POST /auth/logout` · 200
Revoca el access token (lo añade a la lista de revocados por `jti`).

**Body** `LogoutIn`: `{ access_token: string }`
**Response**: `{ message: "Logout OK" }`.

---

### `POST /auth/change-password` · 200 · 🔒 auth
**Body** `ChangePasswordIn`:
```ts
{ old_password: string; new_password: string /* 8..128 */ }
```
**Response**: `{ message: "Contraseña actualizada" }`.
Errores: `401 invalid_credentials`.
> ⚠️ Invalida los access tokens previos. Forzar re-login en el frontend.

---

### `POST /auth/password-reset/request` · 202 · rate-limit 3/min
Inicia reset por email. Respuesta siempre 202 (no filtra si el email existe).

**Body** `PasswordResetRequestIn`: `{ email: string }`
**Response**: `{ message: "Si el email existe, recibirás instrucciones" }`.

---

### `POST /auth/password-reset/confirm` · 200
**Body** `PasswordResetConfirmIn`:
```ts
{ token: string; new_password: string /* 8..128 */ }
```
**Response**: `{ message: "Contraseña restablecida" }`.
Errores: `401 invalid_token`.

---

### `GET /auth/me` · 200 · 🔒 auth
**Response** `UserPublic`:
```ts
{ id: UUID; email: string; display_name: string; verification_level: string; reputation_score: float }
```

---

## Usuarios (sin prefijo) · 🔒 auth en todos

### `GET /me` · 200
**Response** `UserDetail`:
```ts
{
  id: UUID; email: string; display_name: string;
  avatar_url: string | null; bio: string | null; birth_date: string | null;
  gender: Gender; reputation_score: float; verification_level: VerificationLevel;
  preferences: PreferencesOut
}
```

### `PATCH /me` · 200
**Body** `UserUpdateIn` (todos opcionales):
```ts
{
  display_name?: string /* 1..100 */;
  bio?: string /* ..500 */;
  birth_date?: string /* date */ | null;
  gender?: Gender | null;
  locale?: string | null;
  timezone?: string | null
}
```
**Response**: `UserDetail`.

### `DELETE /me` · 204
Borrado de cuenta (soft delete). Sin cuerpo.

### `PUT /me/preferences` · 200
**Body** `PreferencesIn`:
```ts
{
  default_search_radius_m?: int /* 100..50000, default 2000 */;
  activity_types?: string[] /* default [] */;
  group_size_preference?: GroupSizePreference /* default "either" */;
  age_range_min?: int /* 18..99, default 18 */;
  age_range_max?: int /* 18..99, default 99 */;
  gender_preference?: GenderPreference /* default "any" */;
  notify_new_plans?: bool /* default true */;
  notify_messages?: bool /* default true */;
  notify_pending_alerts?: bool /* default true */
}
```
**Response** `PreferencesOut` (mismos campos).

### `POST /me/avatar` · 200
**Body**: `multipart/form-data` con campo `file: UploadFile` (imagen).
**Response**: `UserDetail`.

### `GET /users/{user_id}` · 200
**Path**: `user_id: UUID`.
**Response** `UserPublicProfile`:
```ts
{
  id: UUID; display_name: string; avatar_url: string | null; bio: string | null;
  reputation_score: float; verification_level: VerificationLevel
}
```
Errores: `404 not_found`.

### `POST /users/{user_id}/block` · 201
Bloquear usuario. **Path**: `user_id: UUID`.
**Response** `BlockOut`: `{ blocked_id: UUID; created_at: datetime }`.
Errores: `409 conflict` (bloquearse a sí mismo, duplicado).

### `GET /me/blocks` · 200
**Response**: `BlockOut[]`.

### `DELETE /me/blocks/{user_id}` · 200
Desbloquear. **Path**: `user_id: UUID`.
**Response**: `{ message: string }`.
Errores: `404 not_found`.

---

## Planes (`/plans`) · 🔒 auth en todos

### `POST /plans` · 201 · rate-limit 10/hora
**Body** `PlanIn`:
```ts
{
  activity_type: ActivityType;
  mode: PlanMode;
  scheduled_at?: datetime | null;        // obligatorio si mode == "scheduled"
  window_minutes?: int /* 15..1440, default 120 */;
  max_participants?: int /* 1..10, default 1 */;
  title: string /* 1..200 */;
  description?: string | null /* ..1000 */;
  location: { lat: float /* -90..90 */; lng: float /* -180..180 */; label: string /* 1..200 */ };
  search_radius_m?: int /* 100..50000, default 2000 */
}
```
Validación: si `mode == "scheduled"` y `scheduled_at` es null → `422`.
**Response** `PlanOut`:
```ts
{
  id: UUID; activity_type: ActivityType; mode: PlanMode;
  scheduled_at: datetime | null; window_minutes: int; max_participants: int;
  current_participants: int; title: string; description: string | null;
  location_label: string; location_lat: float; location_lng: float;
  search_radius_m: int; status: PlanStatus; expires_at: datetime;
  host: HostSummary; created_at: datetime
}
```
`HostSummary`: `{ id: UUID; display_name: string; avatar_url: string | null; reputation_score: float; verification_level: string }`.

### `GET /plans` · 200
Búsqueda geográfica de planes cercanos.
**Query**:
```ts
lat: float;          // -90..90, obligatorio
lng: float;          // -180..180, obligatorio
radius?: int;        // 100..50000, default 2000 (metros)
activity?: ActivityType;
mode?: PlanMode
```
**Response**: `PlanListItem[]` (= `PlanOut[]`). Sin cursor.

### `GET /plans/{plan_id}` · 200
**Response**: `PlanOut`. Errores: `404 not_found`.

### `PATCH /plans/{plan_id}` · 200
Solo el host. **Body** `PlanUpdateIn` (todos opcionales):
```ts
{ title?: string /* 1..200 */; description?: string | null; scheduled_at?: datetime | null }
```
**Response**: `PlanOut`. Errores: `404 not_found` (no eres host).

### `DELETE /plans/{plan_id}` · 200
Cancela el plan (solo host). Devuelve el plan cancelado.
**Response**: `PlanOut`. Errores: `404 not_found`.

---

## Matching (sin prefijo) · 🔒 auth en todos

### `POST /plans/{plan_id}/applications` · 201
Postularse a un plan. **Path**: `plan_id: UUID`.
**Body** `ApplicationIn`: `{ message?: string | null /* ..500 */ }`.
**Response** `ApplicationOut`:
```ts
{
  id: UUID; plan_id: UUID;
  applicant: { id: UUID; display_name: string; avatar_url: string | null; reputation_score: float; verification_level: string };
  status: ApplicationStatus; message: string | null; created_at: datetime; decided_at: datetime | null
}
```
Errores: `409 conflict` (ya postulado), `422 validation_error` (plan cerrado/propio).

### `GET /plans/{plan_id}/applications` · 200
Lista postulaciones a un plan propio.
**Response**: `ApplicationOut[]`.

### `POST /applications/{application_id}/accept` · 200
Aceptar postulación. Crea `Match` si se alcanza `max_participants`.
**Path**: `application_id: UUID`.
**Response**: `MatchOut | null` (null si todavía no se forma match).
Errores: `422 validation_error` (no es host, ya decidida).

### `POST /applications/{application_id}/reject` · 200
**Response**: `{ message: "Postulación rechazada" }`.

### `DELETE /applications/{application_id}` · 200
Retirar postulación propia.
**Response**: `{ message: "Postulación retirada" }`.

### `GET /me/applications` · 200 · paginado
Mis postulaciones. **Query**: `limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response**: `PaginatedOut<ApplicationOut>`.

### `GET /matches` · 200 · paginado
Mis matches. **Query**: `limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response**: `PaginatedOut<MatchOut>`.

### `GET /matches/{match_id}` · 200
**Response** `MatchOut`:
```ts
{
  id: UUID; plan_id: UUID; status: MatchStatus;
  started_at: datetime; ended_at: datetime | null;
  location_sharing_active: bool;
  participants: { user_id: UUID; display_name: string; avatar_url: string | null; role: MatchRole; joined_at: datetime }[];
  exact_location_lat: float | null;   // solo visible para participantes
  exact_location_lng: float | null
}
```
Errores: `404 not_found`.

### `POST /matches/{match_id}/complete` · 200
Finalizar match (participante).
**Response**: `MatchOut`.

### `POST /matches/{match_id}/cancel` · 200
Cancelar match (participante).
**Response**: `MatchOut`.

---

## Chat (sin prefijo)

### `GET /matches/{match_id}/messages` · 200 · 🔒 auth
Historial. **Query**: `limit?: int /* 1..200, default 50 */; before?: datetime`.
**Response** `MessageOut[]`:
```ts
{ id: UUID; match_id: UUID; sender_id: UUID; content: string; created_at: datetime; read_at: datetime | null }
```
Errores: `422 validation_error` (no participante).

### `POST /matches/{match_id}/read` · 200 · 🔒 auth
Marcar mensajes del match como leídos.
**Response**: `{ read: int }`.

### `DELETE /messages/{message_id}` · 200 · 🔒 auth
Borrar mensaje propio. **Response**: `{ message: "Mensaje borrado" }`.
Errores: `404 not_found`, `422 validation_error` (no eres el emisor).

### `WS /chat/{match_id}` · WebSocket
Chat en tiempo real. **Conexión**:
```
ws://<host>/chat/{match_id}?token=<access_token>
```
El JWT va como **query param `token`** (no en header). Debe ser access token válido.

- Rechazo por token inválido → close code **4401**.
- Rechazo por no participante → close code **4403**.

**Cliente → servidor** (`MessageIn`):
```json
{ "content": "<texto 1..2000 chars>" }
```
Mensaje inválido → servidor envía `{ "type": "error", "detail": "Mensaje inválido" }` (sin cerrar).

**Servidor → cliente** (broadcast del match):
```json
{
  "type": "message",
  "id": "<uuid>",
  "match_id": "<uuid>",
  "sender_id": "<uuid>",
  "content": "<texto saneado>",
  "created_at": "<ISO 8601>"
}
```

> El contenido se sanea en servidor antes de persistir/broadcast.

---

## Notificaciones (`/notifications`) · 🔒 auth salvo donde se indique

### `GET /notifications` · 200 · paginado
**Query**: `unread_only?: bool /* default false */; limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response** `NotificationOut`:
```ts
{
  id: UUID; type: NotificationType;
  payload: Record<string, any> | null;
  read_at: datetime | null; created_at: datetime
}
```

### `GET /notifications/unread/count` · 200
**Response**: `{ count: int }`.

### `PATCH /notifications/{notification_id}/read` · 200
**Response**: `{ message: "Notificación marcada como leída" }`.

### `POST /notifications/read-all` · 200
**Response**: `{ marked: int }`.

### `DELETE /notifications` · 200
Borra todas las notificaciones del usuario.
**Response**: `{ deleted: int }`.

### `GET /notifications/vapid-public-key` · 200 · 🔓 público
Clave pública VAPID para push web.
**Response**: `{ public_key: string }` (vacío si no hay `vapid_public.pem`).

### `POST /notifications/register` · 201 · 🔒 auth
Registrar suscripción push (Web Push).
**Body** `PushSubscriptionIn`:
```ts
{ endpoint: string; keys: Record<string, string> /* espera p256dh y auth */ }
```
**Response**: `{ message: "Suscripción push registrada" }`.

### `DELETE /notifications/subscription` · 200 · 🔒 auth
**Query**: `endpoint?: string /* default "" */`. Si se pasa, borra solo esa; si no, todas.
**Response**: `{ deleted: int }`.

---

## Seguridad (sin prefijo) · 🔒 auth salvo público

### `GET /me/trusted-contacts` · 200
**Response** `TrustedContactOut[]`:
```ts
{ id: UUID; contact_type: ContactType; contact_value: string; label: string; created_at: datetime }
```

### `POST /me/trusted-contacts` · 201
Máx. 2 contactos por usuario.
**Body** `TrustedContactIn`:
```ts
{ contact_type: ContactType; contact_value: string /* 3..255 */; label: string /* 1..100 */ }
```
**Response**: `TrustedContactOut`.
Errores: `409 conflict` (máx 2 alcanzado, duplicado).

### `DELETE /me/trusted-contacts/{contact_id}` · 200
**Response**: `{ message: "Contacto eliminado" }`. Errores: `404 not_found`.

### `POST /safety/{match_id}/ping` · 200
Actualizar ubicación compartida en un match. **Path**: `match_id: UUID`.
**Body** `PingIn`: `{ lat: float /* -90..90 */; lng: float /* -180..180 */ }`.
**Response**: `{ message: "Ubicación actualizada" }`.
Errores: `422 validation_error` (no participante).

### `GET /safety/{match_id}/peer` · 200
Ubicación del par. **Response** `PeerLocationOut`:
```ts
{ lat: float | null; lng: float | null; last_ping_at: datetime | null }
```
Errores: `422 validation_error`.

### `POST /safety/{match_id}/share-link` · 200
Genera link público de seguimiento.
**Response**: `{ token: string; url: "/s/<token>" }`.

### `DELETE /safety/{match_id}/share-link` · 200
Revoca link. **Query**: `token: string` (requerido). Idempotente.
**Response**: `{ message: "Link revocado" }`.

### `POST /safety/{match_id}/sos` · 200
Dispara alerta SOS: crea evento y notifica al resto de participantes.
**Body** `PingIn`.
**Response** `SosOut`: `{ event_id: UUID; message: string }`.
Errores: `422 validation_error`.

### `GET /s/{token}` · 200 · 🔓 público
Vista pública de ubicación vía share-link.
**Response** `PublicLocationOut`:
```ts
{
  match_id: UUID; user_display_name: string;
  lat: float | null; lng: float | null;
  last_ping_at: datetime | null; expired: bool
}
```
Errores: `401 invalid_token` (link inválido/expirado), `404 not_found`.

---

## Reseñas (sin prefijo) · 🔒 auth en todos

### `POST /reviews` · 201 · rate-limit 20/día
Solo sobre un match `completed` en el que participaste, dentro de 7 días desde `ended_at`, una reseña por par.
**Body** `ReviewIn`:
```ts
{
  match_id: UUID; reviewee_id: UUID;
  rating: int /* 1..5 */;
  comment?: string | null /* ..1000 */;
  flag?: ReviewFlag | null
}
```
**Response** `ReviewOut`:
```ts
{
  id: UUID; match_id: UUID; reviewer_id: UUID; reviewee_id: UUID;
  rating: int; comment: string | null; flag: ReviewFlag | null; created_at: datetime
}
```
Errores: `404 not_found`, `409 conflict` (ya reseñado), `422 validation_error`.

### `GET /reviews` · 200 · paginado
**Query**: `user_id: UUID` (obligatorio); `limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response** `PaginatedOut<ReviewWithReviewer>`:
```ts
ReviewWithReviewer = ReviewOut & {
  reviewer: { id: UUID; display_name: string; avatar_url: string | null; reputation_score: float; verification_level: string }
}
```

### `DELETE /reviews/{review_id}` · 200
Solo el autor. **Response**: `{ message: "Reseña eliminada" }`.
Errores: `404 not_found`, `422 validation_error` (no eres el autor).

---

## Reportes (sin prefijo) · 🔒 auth en todos

### `POST /users/{user_id}/report` · 201 · rate-limit 10/día
Reportar usuario. No se puede reportar a uno mismo.
**Path**: `user_id: UUID`.
**Body** `ReportIn`:
```ts
{ reason: string /* 1..50 */; description?: string | null /* ..1000 */ }
```
**Response** `ReportOut`:
```ts
{
  id: UUID; reporter_id: UUID; reported_id: UUID;
  reason: string; description: string | null; status: string;
  payload: Record<string, any> | null; created_at: datetime
}
```
Errores: `404 not_found`, `422 validation_error`.

---

## Disponibilidad (`/availability`) · 🔒 auth en todos

Modo "disponible ahora": el usuario se publica como buscando match inmediato por geolocalización.

### `POST /availability` · 201
**Body** `AvailabilityIn`:
```ts
{
  location: { lat: float /* -90..90 */; lng: float /* -180..180 */ };
  radius_m?: int /* 100..50000, default 2000 */;
  activity_filter?: ActivityType[] | null;
  window_minutes?: int /* 15..1440, default 120 */
}
```
**Response** `AvailabilityOut`:
```ts
{ id: UUID; radius_m: int; activity_filter: string[] | null; expires_at: datetime; active: bool; created_at: datetime }
```

### `GET /availability/me` · 200
Disponibilidad activa del usuario. **Response**: `AvailabilityOut | null` (null si no hay).

### `DELETE /availability/me` · 200
Desactiva disponibilidad. **Response**: `{ message: "Modo disponible desactivado" }`.

---

## Admin (`/admin`) · 🔒 auth + rol admin (`require_admin`)

Requieren `Authorization: Bearer` con token de un usuario `is_admin = true`. Si no → `403 forbidden`.

### `GET /admin/stats` · 200
**Response** `AdminStatsOut`:
```ts
{ total_users: int; total_plans: int; total_matches: int; open_reports: int }
```

### `GET /admin/reports` · 200 · paginado
**Query**: `status?: string; limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response**: `PaginatedOut<ReportOut>`.

### `PATCH /admin/reports/{report_id}` · 200
Cambiar estado de un reporte. **Body**: `ReportStatusUpdate`: `{ status: string }`.
**Response**: `ReportOut`. Errores: `404 not_found`.

### `GET /admin/users` · 200 · paginado
**Query**: `status?: string; limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response** `PaginatedOut<AdminUserOut>`:
```ts
{ id: UUID; email: string; display_name: string; status: UserStatus; is_admin: bool; reputation_score: float; created_at: datetime }
```

### `POST /admin/users/{user_id}/ban` · 200
**Response**: `AdminUserOut`. Errores: `404`.

### `POST /admin/users/{user_id}/suspend` · 200
> ⚠️ Implementación actual reusa el mismo `ban_user`. Comportamiento equivalente a ban.
**Response**: `AdminUserOut`.

### `POST /admin/users/{user_id}/activate` · 200
**Response**: `AdminUserOut`.

### `POST /admin/plans/{plan_id}/cancel` · 200
Cancelación por moderación.
**Response**: `{ message: "Plan cancelado por moderación" }`. Errores: `404`.

### `GET /admin/reviews` · 200 · paginado
Reseñas marcadas con flag.
**Query**: `limit?: int /* 1..100, default 50 */; before?: datetime`.
**Response**: `PaginatedOut<Record<string, any>>` (items son dicts crudos de reseñas con flag).

### `DELETE /admin/reviews/{review_id}` · 200
Elimina reseña por moderación.
**Response**: `{ message: "Reseña eliminada por moderación" }`. Errores: `404`.

---

## Salud y Observabilidad · 🔓 público

### `GET /health` · 200
**Response**: `{ status: "ok" }`.

### `GET /health/ready` · 200 / **503**
Comprueba DB y Redis.
**Response**: `{ db: "ok" | "error"; redis: "ok" | "error" }`. Status **503** si alguno falla.

### `GET /metrics` · 200
Métricas Prometheus (formato `text/plain`). Métricas disponibles:
- `gad_http_requests_total{method,path,status}`
- `gad_http_request_duration_seconds{method,path}`
- `gad_auth_events_total{event,outcome}`

---

## Apéndice — Resumen de endpoints por método

| Método | Path | Status | Auth | Descripción |
|--------|------|--------|------|-------------|
| POST | `/auth/register` | 201 | — | Registro |
| POST | `/auth/login` | 200 | — | Login |
| POST | `/auth/oauth/google` | 200 | — | Login/registro Google |
| POST | `/auth/refresh` | 200 | — | Refrescar tokens |
| POST | `/auth/logout` | 200 | — | Logout (revoca access) |
| POST | `/auth/change-password` | 200 | 🔒 | Cambiar contraseña |
| POST | `/auth/password-reset/request` | 202 | — | Solicitar reset |
| POST | `/auth/password-reset/confirm` | 200 | — | Confirmar reset |
| GET | `/auth/me` | 200 | 🔒 | Perfil mínimo |
| GET | `/me` | 200 | 🔒 | Perfil completo |
| PATCH | `/me` | 200 | 🔒 | Editar perfil |
| DELETE | `/me` | 204 | 🔒 | Borrar cuenta |
| PUT | `/me/preferences` | 200 | 🔒 | Preferencias |
| POST | `/me/avatar` | 200 | 🔒 | Subir avatar |
| GET | `/users/{user_id}` | 200 | 🔒 | Perfil público |
| POST | `/users/{user_id}/block` | 201 | 🔒 | Bloquear |
| GET | `/me/blocks` | 200 | 🔒 | Lista bloqueos |
| DELETE | `/me/blocks/{user_id}` | 200 | 🔒 | Desbloquear |
| POST | `/users/{user_id}/report` | 201 | 🔒 | Reportar usuario |
| POST | `/plans` | 201 | 🔒 | Crear plan |
| GET | `/plans` | 200 | 🔒 | Buscar planes |
| GET | `/plans/{plan_id}` | 200 | 🔒 | Detalle plan |
| PATCH | `/plans/{plan_id}` | 200 | 🔒 | Editar plan |
| DELETE | `/plans/{plan_id}` | 200 | 🔒 | Cancelar plan |
| POST | `/plans/{plan_id}/applications` | 201 | 🔒 | Postularse |
| GET | `/plans/{plan_id}/applications` | 200 | 🔒 | Lista postulaciones |
| POST | `/applications/{application_id}/accept` | 200 | 🔒 | Aceptar |
| POST | `/applications/{application_id}/reject` | 200 | 🔒 | Rechazar |
| DELETE | `/applications/{application_id}` | 200 | 🔒 | Retirar postulación |
| GET | `/me/applications` | 200 | 🔒 | Mis postulaciones |
| GET | `/matches` | 200 | 🔒 | Mis matches |
| GET | `/matches/{match_id}` | 200 | 🔒 | Detalle match |
| POST | `/matches/{match_id}/complete` | 200 | 🔒 | Completar match |
| POST | `/matches/{match_id}/cancel` | 200 | 🔒 | Cancelar match |
| GET | `/matches/{match_id}/messages` | 200 | 🔒 | Historial chat |
| POST | `/matches/{match_id}/read` | 200 | 🔒 | Marcar leídos |
| DELETE | `/messages/{message_id}` | 200 | 🔒 | Borrar mensaje |
| WS | `/chat/{match_id}` | — | token query | Chat tiempo real |
| GET | `/notifications` | 200 | 🔒 | Lista notifs |
| GET | `/notifications/unread/count` | 200 | 🔒 | Contador no leídas |
| PATCH | `/notifications/{id}/read` | 200 | 🔒 | Marcar leída |
| POST | `/notifications/read-all` | 200 | 🔒 | Marcar todas |
| DELETE | `/notifications` | 200 | 🔒 | Borrar todas |
| GET | `/notifications/vapid-public-key` | 200 | — | Clave VAPID |
| POST | `/notifications/register` | 201 | 🔒 | Suscripción push |
| DELETE | `/notifications/subscription` | 200 | 🔒 | Borrar suscripción |
| GET | `/me/trusted-contacts` | 200 | 🔒 | Contactos de confianza |
| POST | `/me/trusted-contacts` | 201 | 🔒 | Añadir contacto |
| DELETE | `/me/trusted-contacts/{contact_id}` | 200 | 🔒 | Borrar contacto |
| POST | `/safety/{match_id}/ping` | 200 | 🔒 | Ping ubicación |
| GET | `/safety/{match_id}/peer` | 200 | 🔒 | Ubicación del par |
| POST | `/safety/{match_id}/share-link` | 200 | 🔒 | Crear share-link |
| DELETE | `/safety/{match_id}/share-link` | 200 | 🔒 | Revocar share-link |
| POST | `/safety/{match_id}/sos` | 200 | 🔒 | SOS |
| GET | `/s/{token}` | 200 | — | Ubicación pública |
| POST | `/reviews` | 201 | 🔒 | Crear reseña |
| GET | `/reviews` | 200 | 🔒 | Reseñas de un user |
| DELETE | `/reviews/{review_id}` | 200 | 🔒 | Borrar reseña |
| POST | `/availability` | 201 | 🔒 | Activar disponibilidad |
| GET | `/availability/me` | 200 | 🔒 | Mi disponibilidad |
| DELETE | `/availability/me` | 200 | 🔒 | Desactivar |
| GET | `/admin/stats` | 200 | 🔒 admin | Estadísticas |
| GET | `/admin/reports` | 200 | 🔒 admin | Reportes |
| PATCH | `/admin/reports/{report_id}` | 200 | 🔒 admin | Estado reporte |
| GET | `/admin/users` | 200 | 🔒 admin | Usuarios |
| POST | `/admin/users/{user_id}/ban` | 200 | 🔒 admin | Banear |
| POST | `/admin/users/{user_id}/suspend` | 200 | 🔒 admin | Suspender |
| POST | `/admin/users/{user_id}/activate` | 200 | 🔒 admin | Activar |
| POST | `/admin/plans/{plan_id}/cancel` | 200 | 🔒 admin | Cancelar plan |
| GET | `/admin/reviews` | 200 | 🔒 admin | Reseñas con flag |
| DELETE | `/admin/reviews/{review_id}` | 200 | 🔒 admin | Borrar reseña |
| GET | `/health` | 200 | — | Liveness |
| GET | `/health/ready` | 200/503 | — | Readiness |
| GET | `/metrics` | 200 | — | Prometheus |
