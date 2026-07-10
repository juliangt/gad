# Roadmap: Adaptación del Frontend de GAD al Backend

> **Lectura primero.** Este documento es el índice que ordena los 8 planes detallados que reconstruyen el frontend de GAD conectándolo al backend FastAPI existente (66 endpoints, 11 dominios). Cada plan es independiente y produce software funcional y testeable por sí solo.

**Objetivo global:** transformar el mockup actual de Google AI Studio (datos hardcodeados, sin API client/router/auth) en una SPA completa conectada de punta a punta al backend, cubriendo funcionalidad completa de los 11 dominios.

**Spec de referencia:** `docs/superpowers/specs/2026-07-09-frontend-backend-adaptation-design.md`
**Contrato API (fuente de verdad):** `docs/API_CONTRACT.md`

**Stack:** React 19 + TypeScript + Vite 6 + Tailwind v4 + react-leaflet + TanStack Query v5 + react-router-dom v7 + react-hook-form + zod + date-fns + sonner + Vitest + Playwright. Gestor `npm`.

---

## Estado actual (punto de partida)

- `frontend/` existe pero es un mockup: un único `App.tsx` (~577 líneas) con `MOCK_PLANS` hardcodeados, usuario "Martín" fijo, GPS simulado con `setTimeout`.
- **No hay:** API client, router, autenticación, gestión de estado servidor, WebSocket, service worker.
- Botones "Publicar Plan" y "Postularme" sin handler.
- Deps zombie del scaffold (`@google/genai`, `express`, `dotenv`) declaradas pero sin uso.
- Lo que **sí se reutiliza**: estilos `index.css` (Tailwind v4, tema `brand`, glassmorphism), `MapBackground.tsx`, `cn()` helper, sistema de iconos lucide-react.

---

## Orden recomendado de ejecución

Los planes están ordenados por dependencia técnica y por construcción incremental del flujo de usuario. Cada fase asume las anteriores.

| # | Fase | Archivo | Depende de | ¿Qué habilita para el usuario? |
|---|------|---------|-----------|-------------------------------|
| F0 | **Fundaciones** | `2026-07-09-fase-0-fundaciones-frontend.md` | — | App arranca limpia con infraestructura base (router, React Query, auth provider, design system) |
| F1 | **Auth** | `2026-07-09-fase-1-auth-frontend.md` | F0 | Usuario puede registrarse, loguearse, refrescar sesión, recuperar contraseña |
| F2 | **Perfil** | `2026-07-09-fase-2-perfil-frontend.md` | F1 | Ver/editar perfil, avatar, preferencias, bloqueos, perfil público |
| F3 | **Planes** | `2026-07-09-fase-3-planes-frontend.md` | F1, F2 | Explorar mapa con planes reales (GPS), crear/editar/cancelar planes |
| F4 | **Matching** | `2026-07-09-fase-4-matching-frontend.md` | F3 | Postularse, aceptar/rechazar, ver matches con ubicación exacta |
| F5 | **Chat realtime** | `2026-07-09-fase-5-chat-frontend.md` | F4 | Chat en vivo (WebSocket) durante un match |
| F6 | **Safety + Reviews + Reports + Availability** | `2026-07-09-fase-6-safety-reviews-frontend.md` | F5 | Contactos de confianza, live-tracking, SOS, share-link, reseñas, reportes, modo disponible |
| F7 | **Notifications + Admin + Pulido** | `2026-07-09-fase-7-notif-admin-pulido-frontend.md` | F6 | Web Push, panel admin completo, E2E, performance, a11y |

**MVP usable al final de F5** (auth → perfil → planes → matching → chat). F6-F7 añaden safety, reseñas, notificaciones push y admin.

---

## Resumen por fase

### F0 — Fundaciones frontend
Reestructura el proyecto, instala y configura dependencias (TanStack Query, react-router-dom, react-hook-form, zod, date-fns, sonner), crea el API client con interceptor de auth, el tokenStore (access en memoria + refresh en localStorage), el AuthProvider con bootstrap, los guards, el design system base (`components/ui`), migra `MapBackground`/`index.css`/`cn()`, configura Vite proxy y `.env`. Build verde y tests de utilidades (`lib/geo`, `lib/format`, `api/errors`).

### F1 — Auth completa
Páginas de login, registro, forgot/reset password, logout, change-password. OAuth Google (condicional a `VITE_OAUTH_GOOGLE_CLIENT_ID`). Manejo de rate limits (5/min login). Sesión persistente vía refresh token.

### F2 — Perfil de usuario
ProfilePage (migrado del mockup con datos reales vía `GET /me`), EditProfilePage (`PATCH /me`, avatar multipart, `PUT /me/preferences`), soft-delete (`DELETE /me`), perfil público (`GET /users/{id}`), gestión de bloqueos.

### F3 — Planes
ExplorePage con mapa real (GPS vía `navigator.geolocation`) + `GET /plans?lat=&lng=`, CreatePlanPage (react-hook-form + zod validando `PlanIn`), PlanDetailPage, editar (`PATCH`) y cancelar (`DELETE`). FAB funcional.

### F4 — Matching
Postularse (`POST /plans/{id}/applications`), listar postulaciones recibidas (host), aceptar/rechazar, retirar. MatchesPage paginado, MatchDetailPage con ubicación exacta (solo participantes), complete/cancel.

### F5 — Chat realtime
`ChatSocket` (WebSocket con reconexión exponencial, cola de envío, close-codes 4401/4403). Historial paginado por cursor. Envío, borrado, mark-read. ChatWindow con scroll automático y estado de conexión.

### F6 — Safety + Reviews + Reports + Availability
Trusted contacts CRUD (máx 2), live-tracking periódico, ubicación del par, SOS, share-link + vista pública `/s/:token`. Reseñas post-match (StarRating + flags). Reportes de usuarios. Modo disponibilidad toggle.

### F7 — Notifications + Admin + Pulido
Web Push (VAPID + service worker vía vite-plugin-pwa), notifications list + unread badge. Panel admin: dashboard, gestión de reports, usuarios (ban/suspend/activate), cancelar planes, moderar reviews. Lazy-loading/code-split, E2E Playwright del flujo crítico, accessibility pass.

---

## Convenciones (para todos los planes)

- **Tipos TS:** cada feature define sus tipos en `features/<dominio>/types.ts`, derivados del contrato en `docs/API_CONTRACT.md`. Tipos compartidos en `src/types/common.ts` y `src/types/enums.ts`.
- **Hooks de datos:** TanStack Query v5. Query keys jerárquicas (`['plans']`, `['plans', id]`). Mutaciones invalidan queries relacionadas. Paginación por cursor con `useInfiniteQuery`.
- **API client:** wrapper sobre `fetch` en `src/api/client.ts`. El interceptor (`src/api/auth-interceptor.ts`) maneja 401 → refresh → retry (con mutex). Errores como `ApiError(code, status, detail)`.
- **Forms:** react-hook-form + zod. Schemas zod validan lo mismo que el backend (lengths, rangos, enums).
- **Tests:** Vitest + @testing-library/react + jsdom para unit/integración. TDD donde aplique (utilidades puras). Playwright para E2E en F7. Patrón: test rojo → implementación → verde → commit.
- **Commits:** convención existente del repo (`feat:`, `test:`, `fix:`, `refactor:`, `chore:`, `docs:`). Un commit por paso atómico.
- **Estilos:** Tailwind v4 existente. Reutilizar clases `glass-panel`, `glass-button`, tema `brand`. Nuevos componentes en `components/ui/` siguen el mismo lenguaje visual.
- **Idioma UI:** español (es-AR). date-fns locale `es`.
- **Migración de UI:** el `App.tsx` actual se desmonta progresivamente; sus componentes migran a `features/` o `components/` según la tabla del spec §7. `MOCK_PLANS` se elimina en F3.
- **Dev server:** puerto `5173` (alineado con CORS por defecto del backend). Vite proxy `/api` → `:8000`.
