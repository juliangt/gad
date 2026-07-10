# GAD — Adaptación del Frontend al Backend

**Estado:** Borrador
**Fecha:** 2026-07-09
**Autor:** Equipo GAD

---

## 1. Contexto y problema

El backend de GAD (FastAPI) está completo: 66 endpoints en 11 dominios (auth, users, plans, matching, chat, notifications, safety, reviews, reports, availability, admin) + 1 WebSocket. El frontend actual (`frontend/`, commit `fc1350c`) es un **mockup de Google AI Studio** que no está conectado a ningún backend:

- Todo en un único `App.tsx` (~577 líneas) con datos 100% hardcodeados (`MOCK_PLANS`, usuario "Martín", match con "Julieta").
- **No existe** API client, router, autenticación, gestión de estado servidor, ni cliente WebSocket.
- Los botones "Publicar Plan" y "Postularme" no tienen handler.
- GPS simulado con `setTimeout` (no usa `navigator.geolocation`).
- Dependencias zombie del scaffold (`@google/genai`, `express`, `dotenv`) declaradas pero sin uso.

**Objetivo:** reconstruir el frontend como una SPA completa, conectada de punta a punta al backend existente, cubriendo los 10 dominios con funcionalidad completa por dominio.

### Decisiones de diseño (ya validadas con el usuario)

| Decisión | Elección |
|---|---|
| Alcance | **Cobertura completa** — los 10 dominios del backend |
| Arquitectura | **Reestructurar a feature-based** + reutilizar la UI/styling existente (MapBackground, glassmorphism, BottomNav) |
| Almacenamiento de tokens | **Access en memoria + refresh en storage** con refresh automático ante 401 |
| Profundidad por dominio | **Funcionalidad completa**, incluyendo Web Push y SOS/live-tracking |

### Decisiones técnicas (criterio de implementación)

| Decisión | Elección | Razón |
|---|---|---|
| Estado de servidor | **TanStack Query (React Query) v5** | Caché, refetch en background, mutaciones optimistas, invalidación por query key. Estándar para SPAs. Evita reescribir lógica de caché manual. |
| Enrutamiento | **react-router-dom v7** (modo data/declarativo) | De facto en React. Guards via loaders/wrappers. Deep-linking para `/s/<token>` (share-link público). |
| Cliente HTTP | **fetch nativo** con wrapper propio | Sin dependencia extra. El interceptor de auth vive en el wrapper. |
| Formato de fechas | **date-fns v4** | Tree-shakeable, locale `es`. |
| Toasts | **sonner** | Ligero, API simple, stacking, ya usa estilos compatibles. |
| Validación de formularios | **react-hook-form + zod** | Tipado end-to-end con los schemas; zod puede derivarse de los tipos TS del contrato. |
| WebSocket | **wrapper propio sobre `WebSocket` nativo** | Reconexión con backoff, cola de envío, mapeo close-codes (4401/4403). |
| Service Worker (Push) | **Vite PWA plugin (`vite-plugin-pwa`)** | Genera SW, manifest, maneja `PushManager` y notificaciones. |
| Almacenamiento del refresh token | **`localStorage`** con clave `gad:refresh_token` | El refresh token es de larga duración (7 días) y no viaja en cada request. Acceso 15min vive solo en memoria. |
| Puerto del dev server | **Mover dev server a `5173`** | Coincide con el CORS por defecto del backend (`http://localhost:5173`). Menos fricción de config. Alternativamente, proxy de Vite `/api` → `:8000`. |
| Comunicación backend | **Vite proxy `/api → :8000`** + `VITE_API_URL`/`VITE_WS_URL` | Evita problemas de CORS en dev y permite apuntar a otros entornos en prod. |
| Idioma de UI | **Español (es-AR)** | Coincide con el tono del mockup y los mensajes del backend. |

---

## 2. Arquitectura

### 2.1 Estructura de carpetas (feature-based)

Cada dominio del backend se mapea a una carpeta `src/features/<dominio>/` autónoma: sus tipos, hooks de datos (React Query), componentes y páginas. La UI compartida vive en `src/components/`. La infraestructura transversal (API client, auth, router) en sus propias carpetas.

```
frontend/
├── index.html
├── .env.example                      # VITE_API_URL, VITE_WS_URL, VITE_OAUTH_GOOGLE_CLIENT_ID
├── vite.config.ts                    # proxy /api → :8000; plugin PWA; elimina deps zombie
├── tsconfig.json
├── package.json                      # sin @google/genai, express, dotenv
├── src/
│   ├── main.tsx                      # bootstrap: ReactDOM + QueryClient + Router + Auth + Toaster
│   ├── App.tsx                       # <RouterProvider router={router}/>
│   ├── index.css                     # (migrado sin cambios: Tailwind v4 + tema brand + glass)
│   ├── vite-env.d.ts                 # tipos import.meta.env
│   │
│   ├── lib/                          # utilidades puras sin dependencias de React
│   │   ├── utils.ts                  # cn() existente (clsx + tailwind-merge)
│   │   ├── format.ts                 # formatRelativeTime, formatDistance, formatRating (date-fns/locale es)
│   │   └── geo.ts                    # getCurrentPosition() promise wrapper, haversine distance
│   │
│   ├── api/                          # capa HTTP transversal
│   │   ├── client.ts                 # apiGet/apiPost/apiPatch/apiDelete con baseURL, JSON, parseo de ErrorOut
│   │   ├── errors.ts                 # clase ApiError(code, status, detail), mapeo a mensajes es-AR
│   │   ├── auth-interceptor.ts       # 401 → refresh → retry una vez; logout si refresh falla
│   │   └── ws.ts                     # clase ChatSocket: connect/reconnect/cola/close-codes
│   │
│   ├── types/                        # tipos compartidos (espejo del contrato)
│   │   ├── common.ts                 # PaginatedOut<T>, ErrorOut, OKMessage, HostSummary, UserSummary
│   │   └── enums.ts                  # 15 enums string-backed del backend
│   │
│   ├── auth/                         # dominio de autenticación (transversal)
│   │   ├── tokenStore.ts             # access en memoria + refresh en localStorage
│   │   ├── AuthProvider.tsx          # contexto: user, status, login, register, logout, refresh
│   │   ├── useAuth.ts                # hook del contexto
│   │   ├── RequireAuth.tsx           # <Outlet/> guard; redirect a /login si no auth
│   │   ├── RequireAdmin.tsx          # guard admin
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── RegisterPage.tsx
│   │       ├── ForgotPasswordPage.tsx
│   │       └── ResetPasswordPage.tsx
│   │
│   ├── features/                     # un dominio por carpeta
│   │   ├── plans/
│   │   │   ├── types.ts              # PlanIn, PlanOut, PlanListItem, PlanUpdateIn
│   │   │   ├── hooks.ts              # usePlans(lat,lng), usePlan(id), useCreatePlan, useUpdatePlan, useCancelPlan
│   │   │   ├── components/           # PlanCard (migrado), PlanDetailSheet, ActivityPicker, GpsIndicator (migrado)
│   │   │   └── pages/                # ExplorePage, PlanDetailPage, CreatePlanPage
│   │   ├── matching/
│   │   │   ├── types.ts              # ApplicationOut, MatchOut, ApplicationIn
│   │   │   ├── hooks.ts              # useApply, useApplications, useMyApplications, useMatches, useMatch, useAccept, useReject, useComplete, useCancel
│   │   │   └── pages/                # ApplicationsPage, MatchesPage, MatchDetailPage
│   │   ├── chat/
│   │   │   ├── types.ts              # MessageOut, WsIncoming, WsOutgoing
│   │   │   ├── hooks.ts              # useMessages(matchId), useMarkRead, useDeleteMessage, useChatSocket(matchId)
│   │   │   └── ChatWindow.tsx        # lista de mensajes + input + scroll automático
│   │   ├── notifications/
│   │   │   ├── types.ts              # NotificationOut, PushSubscriptionIn
│   │   │   ├── hooks.ts              # useNotifications, useUnreadCount, useMarkRead, useMarkAllRead
│   │   │   ├── push.ts               # subscribePush(), requestNotificationPermission()
│   │   │   ├── sw.ts                 # registro del service worker (vite-plugin-pwa)
│   │   │   └── components/           # NotificationBell, NotificationList
│   │   ├── safety/
│   │   │   ├── types.ts              # TrustedContactOut, PeerLocationOut, SosOut, PublicLocationOut
│   │   │   ├── hooks.ts              # useTrustedContacts, usePing, usePeerLocation, useShareLink, useSos
│   │   │   ├── LiveTracker.tsx       # loop de ping periódico mientras match activo
│   │   │   └── pages/                # TrustedContactsPage, SafetyPage, ShareLinkView (público /s/:token)
│   │   ├── reviews/
│   │   │   ├── types.ts              # ReviewIn, ReviewOut, ReviewWithReviewer
│   │   │   ├── hooks.ts              # useReviews(userId), useCreateReview, useDeleteReview
│   │   │   └── components/           # ReviewForm, ReviewList, StarRating
│   │   ├── users/
│   │   │   ├── types.ts              # UserDetail, UserUpdateIn, PreferencesIn/Out, UserPublicProfile, BlockOut
│   │   │   ├── hooks.ts              # useMe, useUpdateMe, useDeleteMe, usePreferences, useAvatar, useUser, useBlock, useBlocks, useUnblock
│   │   │   └── pages/                # ProfilePage (migrado), EditProfilePage, UserPublicPage, BlockedUsersPage
│   │   ├── reports/
│   │   │   ├── hooks.ts              # useReportUser
│   │   │   └── components/           # ReportModal
│   │   ├── availability/
│   │   │   ├── types.ts              # AvailabilityIn, AvailabilityOut
│   │   │   ├── hooks.ts              # useAvailability, useSetAvailability, useDeleteAvailability
│   │   │   └── components/           # AvailabilityToggle
│   │   └── admin/
│   │       ├── types.ts              # AdminStatsOut, AdminUserOut, ReportOut
│   │       ├── hooks.ts              # useAdminStats, useAdminReports, useAdminUsers, useBan/Suspend/Activate, useCancelPlan, useAdminReviews, useDeleteReview
│   │       ├── RequireAdminRoute.tsx
│   │       └── pages/                # DashboardPage, ReportsAdminPage, UsersAdminPage
│   │
│   ├── components/                    # UI compartida (design system)
│   │   ├── ui/                        # Button, Input, Textarea, Modal, BottomSheet, Spinner, EmptyState, Avatar, Badge, StarRating, ErrorState, ConfirmDialog
│   │   ├── layout/                    # AppShell, BottomNav (migrado), Header, PageContainer
│   │   └── MapBackground.tsx          # (migrado de src/components/)
│   │
│   └── router.tsx                    # definición de rutas con guards
```

### 2.2 Diagrama de capas

```
┌──────────────────────────────────────────────────────────┐
│                     Páginas / Componentes                 │
│  features/*/pages · features/*/components · components/   │
└───────────────────────────┬──────────────────────────────┘
                            │ consumen
                            ▼
┌──────────────────────────────────────────────────────────┐
│        Hooks de datos (React Query)                      │
│  features/*/hooks.ts (usePlans, useMatches, useMe...)    │
└──────────┬───────────────────────────────┬───────────────┘
           │ HTTP                          │ WS
           ▼                               ▼
┌─────────────────────────┐  ┌─────────────────────────────┐
│   api/client.ts         │  │   api/ws.ts                 │
│   fetch wrapper         │  │   ChatSocket                │
│   + auth-interceptor    │  │   reconnect + cola          │
│   (401 → refresh)       │  │                             │
└──────────┬──────────────┘  └──────────┬──────────────────┘
           │ token                        │ token (query param)
           ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│              auth/tokenStore.ts                           │
│   access en memoria  ·  refresh en localStorage          │
│   AuthProvider (contexto React)                           │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Autenticación y sesión

### 3.1 Almacenamiento de tokens

- **Access token** (TTL 15 min): variable en memoria dentro de `tokenStore.ts` (módulo singleton, no React state). Se pierde al recargar — aceptable porque el refresh token (7 días) permite recuperar sesión sin re-login.
- **Refresh token** (TTL 7 días): `localStorage` bajo clave `gad:refresh_token`.
- Al cargar la app, `AuthProvider` intenta `GET /auth/me` con el access token en memoria; si no hay o está expirado, llama `POST /auth/refresh` con el refresh token. Si ambos fallan → estado `unauthenticated` → redirect a `/login`.

### 3.2 Flujo del interceptor (401 → refresh → retry)

```
request → 401 invalid_token?
  ├─ no  → devolver respuesta normalmente
  └─ sí → POST /auth/refresh (con refresh token)
          ├─ éxito → guardar nuevo access, REINTAR request original 1 sola vez
          └─ fallo → limpiar tokens, AuthProvider → unauthenticated, redirect /login
```

- Se usa un **mutex** (promise compartida) para evitar múltiples refreshes simultáneos cuando varias requests reciben 401 al mismo tiempo.
- Endpoints públicos (`/auth/login`, `/auth/register`, `/auth/refresh`, `/s/:token`, `/health`) no pasan por el interceptor.

### 3.3 OAuth Google

- Botón "Continuar con Google" en login/register usando Google Identity Services (GIS).
- El `credential`/auth code se envía a `POST /auth/oauth/google` con body `{ refresh_token: <auth_code> }`.
- Solo se muestra si `VITE_OAUTH_GOOGLE_CLIENT_ID` está configurado (feature flag).

### 3.4 Guards

- `RequireAuth`: wrapper que checks `useAuth().status === 'authenticated'`; si no, `<Navigate to="/login" state={{from}}/>`.
- `RequireAdmin`: anidado en `RequireAuth`, verifica `user.is_admin`.
- La ruta pública `/s/:token` (share-link) NO requiere auth.

---

## 4. Gestión de datos (React Query)

### 4.1 Convenciones

- **Query keys** jerárquicas: `['plans']`, `['plans', planId]`, `['matches']`, `['messages', matchId]`, `['notifications']`, `['me']`, etc. Permite invalidación granular.
- **`staleTime`** por defecto 30s (datos de listados); 0 para datos que cambian con alta frecuencia (mensajes se cargan por WS).
- **Mutaciones** invalidan las queries relacionadas y usan `onSuccess` para toasts.
- **Paginación por cursor**: hook `useInfiniteQuery` donde el backend soporta `next_cursor` (matches, applications, notifications, reviews, admin). `getNextPageParam` devuelve `next_cursor` o `undefined`.

### 4.2 Manejo de errores

- El wrapper `api/client.ts` parsea `ErrorOut {detail, code}` y lanza `ApiError`.
- React Query lo expone en `error`. Los componentes muestran `ErrorState` con mensaje en es-AR y botón de reintentar.
- Códigos específicos (`conflict`, `rate_limit_exceeded` con `Retry-After`) se manejan en los formularios con mensajes contextuales.

### 4.3 GPS y geolocalización

- `lib/geo.ts::getCurrentPosition()` envuelve `navigator.geolocation.getCurrentPosition` en una Promise con timeout de 10s.
- `ExplorePage` pide permiso al montar; estados `searching → fixed | denied` (migrando el `GpsIndicator` existente).
- Si se deniega, se ofrece fallback: input manual de ubicación (barrio/ciudad → geocode vía Nominatim, ya previsto en el spec de diseño del backend) o usar última conocida.
- Los hooks de planes toman `lat`/`lng` de la ubicación del usuario para `GET /plans?lat=&lng=`.

---

## 5. Dominios — alcance por feature

Cada feature cubre funcionalidad **completa** contra su sección del contrato. Resumen:

### 5.1 Plans
- `GET /plans` (con filtros activity/mode/radius) → lista + markers en mapa.
- `POST /plans` (CreatePlanPage migrado del `CreatePlanModal`, ahora con handler real) → mutation.
- `GET /plans/{id}` → detalle (PlanDetailSheet migrado).
- `PATCH /plans/{id}` (host edita), `DELETE /plans/{id}` (host cancela).
- Validación con zod de `PlanIn` (location, scheduled_at obligatorio si mode=scheduled, etc.).

### 5.2 Matching
- Postularse (`POST /plans/{id}/applications`), listar postulaciones recibidas (host), aceptar/rechazar.
- `GET /me/applications` (mis postulaciones, paginado), `DELETE /applications/{id}` (retirar).
- `GET /matches` (paginado), `GET /matches/{id}`, complete/cancel.
- MatchDetailPage muestra ubicación exacta (solo participantes) + abre chat + safety.

### 5.3 Chat
- `GET /matches/{id}/messages` (historial, paginado con cursor `before`).
- WebSocket `ws://.../chat/{match_id}?token=<access>` con `ChatSocket`:
  - Reconexión exponencial (1s → 2s → 4s → max 30s).
  - Cola de mensajes salientes mientras desconectado.
  - Close codes 4401 (token inválido → forzar re-auth), 4403 (no participante → volver).
  - Mensaje entrante `{type:"message",...}` → inserta en caché de React Query + toast si no focused.
  - `{type:"error"}` → toast sin cerrar.
- `POST /matches/{id}/read` al abrir, `DELETE /messages/{id}` (propios).

### 5.4 Notifications
- `GET /notifications` (paginado, `unread_only`), `GET /notifications/unread/count` (badge en BottomNav).
- Marcar leída / marcar todas / borrar todas.
- **Web Push**: `GET /notifications/vapid-public-key`; si hay key, `push.ts::subscribePush()` registra `PushSubscription` vía `POST /notifications/register`. Service worker generado por `vite-plugin-pwa` muestra notificaciones. Si VAPID key está vacía, feature se omite silenciosamente.

### 5.5 Safety
- Trusted contacts CRUD (máx 2): `GET/POST/DELETE /me/trusted-contacts`.
- Durante match activo: `LiveTracker` envía `POST /safety/{match_id}/ping` cada 60s con `navigator.geolocation.watchPosition`.
- `GET /safety/{match_id}/peer` muestra ubicación del par en mapa.
- Botón SOS: `POST /safety/{match_id}/sos`.
- Share-link: `POST/DELETE /safety/{match_id}/share-link`.
- Vista pública `/s/:token` → `GET /s/{token}` (sin auth), mapa con ubicación + estado expired.

### 5.6 Reviews
- `POST /reviews` (solo post-completed, 7 días), `GET /reviews?user_id=` (perfil público), `DELETE /reviews/{id}`.
- `ReviewForm` con StarRating y flag opcional (`no_show`, `inappropriate`, `false_info`).

### 5.7 Users
- `GET /me`, `PATCH /me`, `DELETE /me` (soft-delete → logout), `PUT /me/preferences`, `POST /me/avatar` (multipart).
- `GET /users/{id}` (perfil público con reputación), `POST /users/{id}/block`, `GET /me/blocks`, `DELETE /me/blocks/{id}`.

### 5.8 Reports
- `POST /users/{id}/report` desde `ReportModal` (con reasons predefinidos + descripción).

### 5.9 Availability
- `POST /availability` (activar modo disponible), `GET /availability/me`, `DELETE /availability/me`.
- `AvailabilityToggle` en ExplorePage; al activar, el backend emite alertas a usuarios cercanos (vía notificaciones).

### 5.10 Admin
- Rutas bajo `/admin/*` con `RequireAdmin`.
- Dashboard (`GET /admin/stats`), gestión de reports (listar + cambiar estado), gestión de usuarios (listar + ban/suspend/activate), cancelar planes, moderar reviews (listar flagged + eliminar).

---

## 6. Enrutamiento

```
Públicas (sin auth):
  /login                          LoginPage
  /register                       RegisterPage
  /forgot-password                ForgotPasswordPage
  /reset-password                 ResetPasswordPage
  /s/:token                       ShareLinkView (público)

Protegidas (RequireAuth):
  /                               → redirect /explore
  /explore                        ExplorePage (mapa + lista planes + FAB crear + availability toggle)
  /plans/new                      CreatePlanPage
  /plans/:planId                  PlanDetailPage
  /plans/:planId/applications     ApplicationsPage (host)
  /matches                        MatchesPage
  /matches/:matchId               MatchDetailPage (detalle + chat + safety)
  /matches/:matchId/chat          ChatPage (pantalla completa de chat)
  /matches/:matchId/safety        SafetyPage (live-tracking + SOS + share)
  /me                             ProfilePage
  /me/edit                        EditProfilePage (datos + avatar + preferences)
  /me/trusted-contacts            TrustedContactsPage
  /me/blocks                      BlockedUsersPage
  /users/:userId                  UserPublicPage (perfil público + reviews + report/block)
  /notifications                  NotificationsPage

Protegidas admin (RequireAdmin):
  /admin                          DashboardPage
  /admin/reports                  ReportsAdminPage
  /admin/users                    UsersAdminPage
```

- Navegación principal: `BottomNav` con tabs **Explorar** (`/explore`), **Matches** (`/matches`), **Perfil** (`/me`) — migrado del mockup. Badge de notificaciones en el header o en Matches tab.

---

## 7. Migración de UI existente

Se reutiliza el sistema de diseño del mockup. Mapeo de componentes existentes → nueva estructura:

| Componente actual (App.tsx) | Destino | Acción |
|---|---|---|
| Estilos `index.css` (Tailwind v4, tema `brand`, glassmorphism, safe-area) | `src/index.css` | Mover sin cambios |
| `MapBackground.tsx` | `src/components/MapBackground.tsx` | Mover; tipar props con `PlanListItem` |
| `cn()` (`lib/utils.ts`) | `src/lib/utils.ts` | Sin cambios |
| `GpsIndicator` | `features/plans/components/GpsIndicator.tsx` | Extraer a componente propio |
| `PlanCard` | `features/plans/components/PlanCard.tsx` | Re-tipar con `PlanListItem`; distancia calculada vía haversine |
| `BottomNav` | `components/layout/BottomNav.tsx` | Re-tipar; usar `NavLink` de react-router |
| `ExploreView` | `features/plans/pages/ExplorePage.tsx` | Reescribir con datos reales |
| `MatchesView` | `features/matching/pages/MatchesPage.tsx` | Reescribir con `useMatches` |
| `ProfileView` | `features/users/pages/ProfilePage.tsx` | Reescribir con `useMe` |
| `CreatePlanModal` | `features/plans/pages/CreatePlanPage.tsx` | Reescribir con react-hook-form + zod + `useCreatePlan` |
| Plan detail sheet (inline) | `features/plans/components/PlanDetailSheet.tsx` + `PlanDetailPage` | Extraer |
| Iconos lucide-react | mantener | — |
| `MOCK_PLANS` | **eliminar** | reemplazado por `usePlans` |

---

## 8. Testing

- **Unitario** de utilidades puras: `lib/format.ts`, `lib/geo.ts` (haversine), `api/errors.ts` (mapeo de códigos). Vitest.
- **Integración de hooks** con React Query: mocks de `api/client.ts` con fixtures del contrato. `@testing-library/react` + `renderHook`.
- **Componente**: componentes clave (PlanCard, ChatWindow, StarRating, forms con validación). `@testing-library/react`.
- **E2E** (fase final): Playwright cubriendo el flujo crítico register → crear plan → postular (segunda sesión) → aceptar → chat → complete → review. Contra backend real en docker-compose.
- **Stack de test:** Vitest + @testing-library/react + jsdom; Playwright para E2E. Cobertura inicial sin umbral estricto, subiendo por feature.

---

## 9. Configuración y DevOps

### 9.1 `.env.example` (frontend, NUEVO)
```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_OAUTH_GOOGLE_CLIENT_ID=
```

### 9.2 Vite proxy
`vite.config.ts` añade `server.proxy['/api'] → http://localhost:8000` y `/ws` para el WebSocket, eliminando fricción de CORS en dev. El dev server se mantiene en `5173` (alineado con el CORS por defecto del backend).

### 9.3 Limpieza de dependencias
- Eliminar de `package.json`: `@google/genai`, `express`, `dotenv` (no usadas en `src/`).
- Eliminar `metadata.json` (metadato de AI Studio).
- Quitar `server.js` reference del script `clean` si no aplica.

### 9.4 CI
- Añadir job al workflow `.github/workflows/` para el frontend: `npm ci`, `npm run lint` (`tsc --noEmit`), `npm run build`, y `npm test` (Vitest) cuando existan tests.

### 9.5 Build/Deploy
- `npm run build` → `dist/` estático, servible por cualquier CDN/static host o por el propio FastAPI (montaje de `StaticFiles`) si se prefiere monolito. Queda fuera del scope de este plan la decisión de hosting, pero el build debe ser estándar.

---

## 10. Consideraciones de seguridad (frontend)

- **XSS**: el contenido del chat viene saneado por el backend; el frontend lo renderiza como texto (`textContent`), nunca con `dangerouslySetInnerHTML`.
- **CSP**: el backend ya emite headers CSP; el frontend coopera no usando inline scripts (Vite no los genera por defecto).
- **Tokens**: access token nunca persiste en storage (solo memoria), minimizando exposición a XSS.
- **Geolocalización**: permiso explícito del usuario; no se envía ubicación al backend sin consentimiento (solo al activar disponibilidad o durante match con sharing activo).
- **Rate limits**: el UI respeta los rate limits del backend mostrando mensajes claros (`rate_limit_exceeded` + `Retry-After`) y deshabilitando botones temporalmente.

---

## 11. Fases de implementación (roadmap)

El trabajo se descompone en **8 fases secuenciales**, cada una entregando software funcional y testeable de forma independiente. Cada fase tendrá su propio plan detallado en `docs/superpowers/plans/`.

| Fase | Nombre | Entrega | Depende de |
|---|---|---|---|
| **F0** | Fundaciones frontend | Proyecto reestructurado, Vite+proxy+TS+Tailwind OK, React Query + Router + AuthProvider configurados, design system base (components/ui), build verde sin features | — |
| **F1** | Auth completa | Login, register, refresh, logout, change-password, forgot/reset password, guards, OAuth Google (si configured). Usuario puede autenticarse de punta a punta. | F0 |
| **F2** | Perfil de usuario | ProfilePage, EditProfilePage (datos + avatar + preferences), soft-delete, perfil público, bloqueos. `useMe` y derivados. | F1 |
| **F3** | Planes | ExplorePage (mapa + lista real con GPS), CreatePlanPage (form validado), PlanDetailPage, editar/cancelar. Botón FAB funcional. | F1, F2 |
| **F4** | Matching | Postulaciones, aceptar/rechazar, retirar, MatchesPage, MatchDetailPage (ubicación exacta). Flujo completo plan→match. | F3 |
| **F5** | Chat realtime | ChatSocket (WS con reconnect), historial, enviar/borrar, mark-read. Chat funcional durante match. | F4 |
| **F6** | Seguridad + Reviews + Reports + Availability | Trusted contacts, live-tracking, SOS, share-link (vista pública), reseñas post-match, reportes de usuarios, modo disponibilidad. | F5 |
| **F7** | Notificaciones + Admin + Pulido | Web Push (VAPID + service worker), panel admin completo (dashboard/users/reports/reviews), optimizaciones (lazy-loading, code-split), E2E con Playwright, accessibility. | F6 |

El orden prioriza construir el flujo principal de usuario (auth → perfil → planes → matching → chat) antes que las features secundarias (safety, reviews, push, admin), de modo que haya un MVP usable al final de F5.

---

## 12. Fuente de verdad

- **Contrato API**: `docs/API_CONTRACT.md` (66 endpoints). Toda firma de tipos TS y validación zod se deriva de ahí.
- **Spec de diseño del producto**: `docs/superpowers/specs/2026-07-05-gad-app-design.md` (visión, modelos, flujos).
- Este spec es la fuente de verdad para la **arquitectura frontend** y el **roadmap de implementación**.

---

## 13. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| WebSocket inestable en redes móviles | Chat se cae | `ChatSocket` con reconexión + cola; UI muestra estado de conexión |
| Web Push requiere HTTPS + VAPID configurado | Notificaciones no funcionan en dev local | Feature flag; degrade elegante; testing en staging HTTPS |
| GPS denegado por usuario | Explore no carga planes | Fallback a geolocalización por IP o input manual |
| Scope grande (8 fases) | Fatiga / abandono | Fases independientes y testeables; MVP usable tras F5 |
| Desalineación contrato ↔ implementación backend | Errores de tipos | Tipos TS generados/validados contra `/openapi.json` del backend al inicio de cada fase |
| Rate limits agresivos (login 5/min) | UX frustrante | Feedback claro + cooldown de botones |
