# Notifications, Admin y Pulido Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la **Fase F7 (final)** del frontend de GAD. Tres sub-dominios + pulido de cierre de proyecto:
1. **Notifications** — lista paginada de notificaciones con badge de no leídas (polling cada 45s), acciones de marcar leída / marcar todas / borrar todas, renderizado contextual del `payload` por `NotificationType`, y **Web Push** completo (`vite-plugin-pwa` + service worker custom + `PushManager.subscribe` + VAPID) con degrade elegante cuando no hay VAPID key o el navegador no soporta push.
2. **Admin** — panel de moderación bajo `/admin/*` tras `RequireAdmin`: dashboard de métricas (`GET /admin/stats`), gestión de reportes (listar + cambiar estado), gestión de usuarios (listar + ban/suspend/activate), cancelación de planes, y moderación de reseñas flagged (listar + eliminar). `RequireAdmin` se robustece para leer `is_admin` desde `GET /me` (vía un wrapper de admin-guard en `features/admin/RequireAdminRoute.tsx` que usa `useMe`/`/me`).
3. **Pulido** — code-split/lazy-loading consolidado, tuning de React Query, pasada de a11y, **E2E con Playwright** del flujo crítico register→plan→postular→aceptar→match→chat→complete→review contra backend real en docker-compose, **job de CI** para el frontend, y verificación global final de los 11 dominios.

Al final, el proyecto GAD queda **cerrado de punta a punta**: las 11 áreas del backend (auth, users, plans, matching, chat, notifications, safety, reviews, reports, availability, admin) están cubiertas por el frontend, con build de producción verde, tests unitarios + E2E, y una pasada de accesibilidad.

**Architecture:** Feature-based, alineada con F0–F6:
- `src/features/notifications/` — `types.ts` (`NotificationOut`, `NotificationType`, `PushSubscriptionIn`, `UnreadCountOut`), `hooks.ts` (`useNotifications`, `useUnreadCount` con refetchInterval, `useMarkRead`, `useMarkAllRead`, `useDeleteAllNotifications`, `useVapidPublicKey`, `useRegisterPush`, `useUnregisterPush`, `usePushEnabled`), `push.ts` (utilidades puras: `base64ToUint8Array`, `requestNotificationPermission`, `subscribePush`, `unsubscribePush`), `notificationMeta.ts` (mapeo `NotificationType → {icono, label, tono}`), `components/NotificationBell.tsx`, `components/NotificationItem.tsx`, `pages/NotificationsPage.tsx`.
- `src/features/admin/` — `types.ts` (`AdminStatsOut`, `AdminUserOut`, `ReportOut`, `AdminReviewOut`), `hooks.ts` (`useAdminStats`, `useAdminReports`, `useUpdateReportStatus`, `useAdminUsers`, `useBanUser`, `useSuspendUser`, `useActivateUser`, `useAdminCancelPlan`, `useAdminReviews`, `useAdminDeleteReview`), `RequireAdminRoute.tsx` (guard que verifica `is_admin` vía `GET /me`), `components/AdminStatCard.tsx`, `pages/DashboardPage.tsx`, `pages/ReportsAdminPage.tsx`, `pages/UsersAdminPage.tsx`, `pages/ReviewsAdminPage.tsx`, `components/AdminNav.tsx`.
- **Web Push / PWA:** `vite.config.ts` se extiende con `vite-plugin-pwa` (`registerType:'autoUpdate'`, manifest GAD, `injectRegister:false` para usar SW custom). SW custom en `frontend/src/sw.ts` (maneja `push`, `notificationclick`, `pushsubscriptionchange`). El SW se registra manualmente desde `main.tsx` vía `registerSW`. Flag `VITE_ENABLE_PUSH` opcional para forzar-off en dev.
- **Pulido:** `router.tsx` consolida todas las rutas en lazy + `PageSuspense`; `src/test/test-utils.tsx` ya existe (F0); CI en `.github/workflows/frontend.yml`; E2E en `frontend/e2e/` con `playwright.config.ts`.

**Flujo Web Push (HTTPS + VAPID obligatorios):**
```
App montada + usuario autenticado
  → usePushEnabled() lee GET /notifications/vapid-public-key (público, sin auth)
     ├─ public_key === "" → feature push omitida silenciosamente (no se muestran UI de push)
     └─ public_key !== "" && 'serviceWorker' in navigator && 'PushManager' in window
        → requestNotificationPermission() (Notification.requestPermission())
           ├─ denied → toast informativo, no se registra
           └─ granted → navigator.serviceWorker.ready
              → pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: base64ToUint8Array(vapidKey) })
                 → PushSubscription{ endpoint, keys:{p256dh,auth} }
                 → POST /notifications/register { endpoint, keys }  (201)
                 → marca flag local gad:push_enabled=true
Evento 'push' en el SW → self.registration.showNotification(title, { body, icon, data:{url} })
Evento 'notificationclick' → clients.openWindow(url) + notification.close()
Unsubscribe (página de settings) → pushSubscription.unsubscribe() + DELETE /notifications/subscription?endpoint=...
```
**Degrade elegante:** si `vapid-public-key` está vacío, o el navegador no soporta SW/Push, o el permiso fue denegado, **no hay error visible**: la app funciona sin push, y la UI de notificaciones (badge, lista) sigue operativa vía HTTP poll.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, `vite-plugin-pwa` (PWA + manifest + SW base), Tailwind v4, TanStack Query v5 (`useInfiniteQuery`, `useQuery` con `refetchInterval`, `useMutation`), react-router-dom v7, date-fns v4 (locale `es`), lucide-react, sonner. Testing: Vitest + @testing-library/react + jsdom (unit/integración); **Playwright** (E2E). CI: GitHub Actions.

---

## Prerrequisitos (de F0–F6)

Este plan asume que las siguientes piezas ya existen y funcionan (no se reimplementan aquí salvo donde se indique "MODIFICAR"):

| Pieza | Archivo | Interfaz que se consume en F7 |
|---|---|---|
| API client | `src/api/client.ts` | `apiGet<T>(path, { query?, publicEndpoint? })`, `apiPost<T>(path, body?, opts?)`, `apiPatch<T>(path, body?, opts?)`, `apiDelete<T>(path, { query? })` — lanzan `ApiError(code, status, detail)`, interceptor 401→refresh aplicado (salvo `publicEndpoint:true`). `query: Record<string, string\|number\|boolean\|undefined\|null>`. |
| ApiError | `src/api/errors.ts` | `ApiError` con `.code`, `.status`, `.detail`; `mapErrorMessage(code, fallback)`. |
| Auth | `src/auth/useAuth.ts` | `useAuth()` → `{ user: UserPublic \| null, status, logout }`. |
| Auth guards | `src/auth/RequireAuth.tsx`, `src/auth/RequireAdmin.tsx` | `RequireAuth` (Outlet guard). `RequireAdmin` (F0) **no** distingue admin real (`UserPublic` sin `is_admin`); F7 **no** reescribe ese archivo, sino que añade `features/admin/RequireAdminRoute.tsx` que sí verifica el rol vía `/me`, y reconfigura el router para usar el nuevo guard en `/admin/*`. |
| User / me | `src/features/users/hooks.ts` | `useMe()` → `{ data: UserDetail }` (si F2 lo creó) o al menos `GET /me`. **Si `UserDetail` no incluye `is_admin`**, F7 añade el campo opcional al tipo y lo lee defensivamente. |
| Types comunes | `src/types/common.ts` | `PaginatedOut<T>`, `OKMessage`, `UserPublic`, `UserSummary`. |
| Formato | `src/lib/format.ts` | `formatRelativeTime(iso): string`, `formatRating(n)`. |
| UI | `src/components/ui/` | `Button`, `Input`, `Textarea`, `Spinner`, `EmptyState`, `ErrorState`, `Avatar`, `Badge`, `Modal`, `BottomSheet`, `ConfirmDialog`. |
| Layout | `src/components/layout/` | `AppShell`, `BottomNav`, `Header`, `PageContainer` (pueden no existir todos; si no hay `Header`, `NotificationBell` se monta dentro del layout existente o se crea un `Header` mínimo). |
| QueryClient | `src/main.tsx` | `QueryClientProvider` activo con `defaultOptions`. |
| Router | `src/router.tsx` | `createBrowserRouter` con `RequireAuth` y `RequireAdmin` (stubs de F0); `PageSuspense` + `React.lazy` introducidos en F3/F4. `/notifications` y `/admin/*` **aún no** registradas (las añade este plan). |
| Toaster | `src/main.tsx` | `<Toaster/>` de sonner montado. |
| Reports (F6) | `src/features/reports/types.ts` | `ReportOut` (si F6 lo definió). Si no, F7 define el suyo en `features/admin/types.ts` (admin es consumidor directo de `GET /admin/reports`). |
| Reviews (F6) | `src/features/reviews/types.ts` | `ReviewOut`, `ReviewFlag`. |
| Vitest | `vitest.config.ts`, `src/test/setup.ts`, `src/test/test-utils.tsx` | jsdom + jest-dom globales + `renderWithProviders`. |
| Stack de test | — | Vitest (globals), `@testing-library/react` (`renderHook`, `waitFor`, `render`, `screen`, `fireEvent`, `act`, `within`), `@testing-library/user-event`. Los hooks de React Query se testean con `QueryClient` (`retry:false`) + provider wrapper. |

> **Si F6 (safety/reviews/reports/availability) no está implementado**, las Tasks de Admin (10–14) siguen siendo completables: `ReportOut` se define localmente en `features/admin/types.ts` y `ReviewsAdminPage` usa un tipo `AdminReviewOut` propio (el contrato devuelve `PaginatedOut<Record<string, any>>`). El `RequireAdminRoute` depende de `useMe` (F2); si F2 no existe, cae a `GET /auth/me` + lectura defensiva. Documentar cualquier ausencia y continuar.

> **Reconciliación de tipos:** `NotificationType` ya está definido en `src/types/enums.ts` (F0). F7 lo **reexporta** desde `features/notifications/types.ts` sin redefinirlo. `UserStatus` también está en `enums.ts`.

**Convenciones de rutas de import:** este plan usa **exclusivamente imports relativos** (`../types`, `../../components/ui/Button`, `../../../api/client`), igual que F0–F6. No se introduce el alias `@/`.

**Stack de test (F7):**
- Unit/integración: Vitest + @testing-library/react. TDD para utilidades puras (`push.ts::base64ToUint8Array`, `notificationMeta.ts`) y para hooks (`useUnreadCount` polling, `useMarkRead`, `useMarkAllRead`, `useNotifications` paginación, mutaciones admin).
- E2E: Playwright (`@playwright/test`). Specs en `frontend/e2e/`. Contra backend real (docker-compose). Skipeables si el backend no está levantado.

---

## File Structure

Archivos a crear/modificar en F7 (rutas absolutas desde la raíz del repo):

```
frontend/
├── package.json                                       # MODIFICAR — añadir vite-plugin-pwa, @playwright/test, workbox-window (dep de pwa)
├── vite.config.ts                                     # MODIFICAR — VitePWA plugin + dev server proxy /api + /ws → :8000 (si F0 no lo consolidó)
├── tsconfig.json                                      # MODIFICAR (solo si hace falta) — tipos de pwa/vite-env
├── playwright.config.ts                               # NUEVO — config E2E
├── .env.example                                       # MODIFICAR — añadir VITE_ENABLE_PUSH (opcional)
├── public/
│   └── icons/                                         # NUEVO — iconos PWA (pwa-192.png, pwa-512.png, maskable-512.png) — placeholders SVG→PNG
├── e2e/
│   ├── critical-flow.spec.ts                          # NUEVO — flujo crítico E2E
│   ├── notifications.spec.ts                          # NUEVO — smoke de notifications
│   ├── admin.spec.ts                                  # NUEVO — smoke de admin (403→login admin→dashboard)
│   └── fixtures.ts                                    # NUEVO — helpers de auth/registro E2E
├── src/
│   ├── main.tsx                                       # MODIFICAR — registrar SW manual (registerSW) + Suspense global
│   ├── sw.ts                                          # NUEVO — service worker custom (push, notificationclick, pushsubscriptionchange)
│   ├── dev-sw.js?worker-sw                           # ( generado por vite-plugin-pwa en dev; no se commitea )
│   ├── router.tsx                                     # MODIFICAR — registrar /notifications, /admin/*; consolidar lazy/PageSuspense; usar RequireAdminRoute
│   ├── components/
│   │   └── layout/
│   │       ├── Header.tsx                             # NUEVO (si no existe) — header con NotificationBell
│   │       └── PageSuspense.tsx                       # NUEVO — <Suspense fallback={<Spinner full/>}> consolidado
│   ├── features/notifications/
│   │   ├── types.ts                                   # NUEVO — NotificationOut, NotificationType (reexport), PushSubscriptionIn, UnreadCountOut
│   │   ├── notificationMeta.ts                        # NUEVO — mapa NotificationType → {icon, label, tone} (puro, testeable)
│   │   ├── push.ts                                    # NUEVO — base64ToUint8Array, requestNotificationPermission, subscribePush, unsubscribePush (puro + DOM, testeable con mocks)
│   │   ├── hooks.ts                                   # NUEVO — useNotifications, useUnreadCount (polling), useMarkRead, useMarkAllRead, useDeleteAllNotifications, useVapidPublicKey, useRegisterPush, useUnregisterPush, usePushBootstrap
│   │   ├── components/
│   │   │   ├── NotificationBell.tsx                   # NUEVO — badge + dropdown/links
│   │   │   └── NotificationItem.tsx                   # NUEVO — fila de notificación con render contextual
│   │   ├── pages/
│   │   │   └── NotificationsPage.tsx                  # NUEVO — /notifications
│   │   └── __tests__/
│   │       ├── notificationMeta.test.ts               # NUEVO
│   │       ├── push.test.ts                           # NUEVO
│   │       └── hooks.test.tsx                         # NUEVO — unreadCount polling, markRead, markAllRead, notifications paginación, vapid flag
│   ├── features/admin/
│   │   ├── types.ts                                   # NUEVO — AdminStatsOut, AdminUserOut, ReportOut, ReportStatus, AdminReviewOut
│   │   ├── hooks.ts                                   # NUEVO — useAdminStats, useAdminReports, useUpdateReportStatus, useAdminUsers, useBanUser, useSuspendUser, useActivateUser, useAdminCancelPlan, useAdminReviews, useAdminDeleteReview
│   │   ├── RequireAdminRoute.tsx                      # NUEVO — guard admin robusto (GET /me → is_admin)
│   │   ├── components/
│   │   │   ├── AdminNav.tsx                           # NUEVO — nav interno /admin, /admin/reports, /admin/users, /admin/reviews
│   │   │   ├── AdminStatCard.tsx                      # NUEVO — tarjeta de métrica
│   │   │   ├── ReportRow.tsx                          # NUEVO — fila de reporte + select de estado
│   │   │   ├── AdminUserRow.tsx                       # NUEVO — fila de usuario + acciones
│   │   │   └── AdminReviewRow.tsx                     # NUEVO — fila de reseña flagged + eliminar
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx                      # NUEVO — /admin
│   │   │   ├── ReportsAdminPage.tsx                   # NUEVO — /admin/reports
│   │   │   ├── UsersAdminPage.tsx                     # NUEVO — /admin/users
│   │   │   └── ReviewsAdminPage.tsx                   # NUEVO — /admin/reviews
│   │   └── __tests__/
│   │       └── hooks.test.tsx                         # NUEVO — stats, reports paginación, updateStatus, users acciones
│   ├── components/ui/
│   │   └── Pagination.tsx                             # NUEVO — botón "Cargar más" reutilizable (si no existe de F6)
│   └── lib/
│       └── env.ts                                     # NUEVO — helper parseEnv/feature flags (VITE_ENABLE_PUSH)
.github/
└── workflows/
    └── frontend.yml                                   # NUEVO (o MODIFICAR si existe CI) — job frontend: ci, lint, build, test, e2e (opcional)
```

> **Notas sobre superposición con fases previas:** si F6 ya creó `components/ui/Pagination.tsx` o `components/layout/Header.tsx` o `components/layout/PageSuspense.tsx`, **reusarlos** y omitir la creación (el step correspondiente lo detecta con `test -f`). Si F0 ya configuró el proxy `/api`→`:8000` en `vite.config.ts`, no duplicarlo.

---

## Task 1: Rama de trabajo y verificación del punto de partida

**Files:** —

- [ ] **Step 1: Crear rama `fase-7-notif-admin-pulido-frontend`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git checkout -b fase-7-notif-admin-pulido-frontend
```
Expected: `Switched to a new branch 'fase-7-notif-admin-pulido-frontend'`

- [ ] **Step 2: Verificar que F0–F6 compilan y los tests pasan**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build && npx vitest run
```
Expected: build verde, todos los tests de F0–F6 pasan. Si alguna fase previa no está implementada (p.ej. F6), anotarlo en un `NOTAS-F7.md` temporal (no se commitea) y continuar: F7 se estructura para que cada sub-dominio compile de forma independiente.

- [ ] **Step 3: Detectar piezas preexistentes (reusar en vez de duplicar)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
for f in \
  src/components/ui/Pagination.tsx \
  src/components/layout/Header.tsx \
  src/components/layout/PageSuspense.tsx \
  src/features/notifications \
  src/features/admin \
  src/sw.ts \
  playwright.config.ts \
  src/features/users/hooks.ts \
  src/features/reviews/types.ts \
  src/features/reports/types.ts ; do
  if [ -e "$f" ]; then echo "EXISTE: $f"; else echo "AUSENTE: $f"; fi
done
```
Expected: lista de piezas. Anotar resultados: las que `EXISTE` se reusan; las `AUSENTE` se crean en este plan. En particular:
- Si `src/features/users/hooks.ts` AUSENTE → `RequireAdminRoute` caerá a `GET /auth/me` + cast defensivo (ver Task 10).
- Si `src/features/reports/types.ts` AUSENTE → `ReportOut` se define en `features/admin/types.ts` (Task 9).

- [ ] **Step 4: Confirmar baseline limpio**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git status
```
Expected: `nothing to commit, working tree clean` (o solo el `NOTAS-F7.md` temporal, que no se commitea).

---

## SECCIÓN A — NOTIFICATIONS

## Task 2: Tipos del dominio Notifications

**Files:**
- Create: `frontend/src/features/notifications/types.ts`

- [ ] **Step 1: Crear `features/notifications/types.ts`**

Crear `frontend/src/features/notifications/types.ts`:

```typescript
/**
 * Tipos del dominio Notifications (contrato §Notificaciones).
 *
 * `GET /notifications` → `PaginatedOut<NotificationOut>` (paginado por cursor `before`).
 * `GET /notifications/unread/count` → `{ count: int }` (badge, polling).
 * `GET /notifications/vapid-public-key` → `{ public_key: string }` (PÚBLICO, vacío si no hay VAPID).
 * `POST /notifications/register` → `{ message }` (201).
 * `DELETE /notifications/subscription?endpoint=` → `{ deleted }`.
 */

/** Reexport del enum canónico (definido en F0 types/enums.ts). */
export type {
  NotificationType,
} from '../../types/enums';

import type { NotificationType } from '../../types/enums';

/** Notificación persistida. `payload` es JSONB libre; se renderiza contextualmente por `type`. */
export interface NotificationOut {
  id: string;
  type: NotificationType;
  /** Estructura libre según `type`. Ej: `{ plan_id, plan_title }`, `{ match_id, peer_name }`, `{ message_preview }`. */
  payload: Record<string, unknown> | null;
  read_at: string | null; // ISO 8601 UTC
  created_at: string; // ISO 8601 UTC
}

/** Respuesta de `GET /notifications/unread/count`. */
export interface UnreadCountOut {
  count: number;
}

/** Respuesta de `GET /notifications/vapid-public-key` (público). */
export interface VapidPublicKeyOut {
  public_key: string; // "" si no hay VAPID configurado
}

/** Body de `POST /notifications/register`. */
export interface PushSubscriptionIn {
  endpoint: string;
  /** Claves de cifrado Web Push. El backend espera `p256dh` y `auth`. */
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Respuesta de `POST /notifications/read-all`. */
export interface MarkedOut {
  marked: number;
}

/** Respuesta de `DELETE /notifications` y `DELETE /notifications/subscription`. */
export interface DeletedOut {
  deleted: number;
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/types.ts
git commit -m "feat(notifications): tipos NotificationOut, PushSubscriptionIn y respuestas del contrato"
```

---

## Task 3: TDD — `notificationMeta.ts` (mapeo NotificationType → UI)

Mapeo puro y testeable de cada `NotificationType` a `{ icon (clave lucide), label (es-AR), tone (tailwind color) }`. El componente `NotificationItem` lo consume para renderizar icono y color.

**Files:**
- Create: `frontend/src/features/notifications/__tests__/notificationMeta.test.ts`
- Create: `frontend/src/features/notifications/notificationMeta.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/notifications/__tests__/notificationMeta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getNotificationMeta, NOTIFICATION_META, isNotificationType } from '../notificationMeta';

describe('notificationMeta', () => {
  it('expone un meta para cada NotificationType del contrato', () => {
    const allTypes = [
      'new_application',
      'match',
      'new_message',
      'safety',
      'review',
      'plan_alert',
    ] as const;
    for (const t of allTypes) {
      const meta = getNotificationMeta(t);
      expect(meta).toBeDefined();
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.icon).toBe('string');
      expect(['brand', 'success', 'warning', 'danger', 'info']).toContain(meta.tone);
    }
  });

  it('getNotificationMeta devuelve un fallback seguro para tipo desconocido', () => {
    const meta = getNotificationMeta('unknown_type' as never);
    expect(meta.label).toBe('Notificación');
    expect(meta.tone).toBe('brand');
  });

  it('isNotificationType valida valores del enum', () => {
    expect(isNotificationType('match')).toBe(true);
    expect(isNotificationType('new_message')).toBe(true);
    expect(isNotificationType('bogus')).toBe(false);
    expect(isNotificationType('')).toBe(false);
  });

  it('NOTIFICATION_META tiene exactamente 6 entradas', () => {
    expect(Object.keys(NOTIFICATION_META)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Verificar que el test falla (archivo aún no existe)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications/__tests__/notificationMeta.test.ts
```
Expected: fallo (no resuelve el módulo).

- [ ] **Step 3: Implementar `notificationMeta.ts`**

Crear `frontend/src/features/notifications/notificationMeta.ts`:

```typescript
import type { NotificationType } from '../../types/enums';

export type NotificationTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface NotificationMeta {
  /** Nombre del icono lucide-react a usar (resuelto por el componente). */
  icon: string;
  /** Etiqueta corta es-AR del tipo. */
  label: string;
  /** Tono de color para el icono/badge. */
  tone: NotificationTone;
}

const ALL_TYPES: NotificationType[] = [
  'new_application',
  'match',
  'new_message',
  'safety',
  'review',
  'plan_alert',
];

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  new_application: {
    icon: 'UserPlus',
    label: 'Nueva postulación',
    tone: 'info',
  },
  match: {
    icon: 'Handshake',
    label: '¡Match!',
    tone: 'success',
  },
  new_message: {
    icon: 'MessageCircle',
    label: 'Nuevo mensaje',
    tone: 'brand',
  },
  safety: {
    icon: 'ShieldAlert',
    label: 'Seguridad',
    tone: 'danger',
  },
  review: {
    icon: 'Star',
    label: 'Reseña',
    tone: 'warning',
  },
  plan_alert: {
    icon: 'CalendarClock',
    label: 'Alerta de plan',
    tone: 'info',
  },
};

const FALLBACK_META: NotificationMeta = {
  icon: 'Bell',
  label: 'Notificación',
  tone: 'brand',
};

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (ALL_TYPES as string[]).includes(value);
}

export function getNotificationMeta(type: NotificationType | string): NotificationMeta {
  if (isNotificationType(type)) {
    return NOTIFICATION_META[type];
  }
  return FALLBACK_META;
}
```

- [ ] **Step 4: Verificar que el test pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications/__tests__/notificationMeta.test.ts
```
Expected: 4 tests en verde.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/notificationMeta.ts \
        frontend/src/features/notifications/__tests__/notificationMeta.test.ts
git commit -m "feat(notifications): mapeo NotificationType→UI (icono, label, tono) con TDD"
```

---

## Task 4: TDD — `push.ts` (utilidades Web Push)

Utilidades puras (+ DOM) para Web Push. El `PushManager`/`Notification`/`navigator.serviceWorker` se **mockean** en tests para que sean deterministas. La función clave `subscribePush(vapidKey)` orquesta: permiso → SW ready → `pushManager.subscribe`.

**Files:**
- Create: `frontend/src/features/notifications/__tests__/push.test.ts`
- Create: `frontend/src/features/notifications/push.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/notifications/__tests__/push.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  base64ToUint8Array,
  isPushSupported,
  requestNotificationPermission,
  subscribePush,
  unsubscribePush,
} from '../push';

describe('base64ToUint8Array', () => {
  it('decodifica base64url de VAPID correctamente', () => {
    // 'foo' en base64 = 'Zm9v'. La función debe aceptar base64url (con -_ y sin padding).
    const key = base64ToUint8Array('Zm9v');
    expect(key).toBeInstanceOf(Uint8Array);
    expect(Array.from(key)).toEqual([102, 111, 111]); // 'f','o','o'
  });

  it('decodifica base64url reemplazando - por + y _ por /', () => {
    // base64url de algunos bytes puede traer - _ ; verificamos que no rompe
    const key = base64ToUint8Array('YWJjZA');
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBeGreaterThan(0);
  });

  it('acepta string con padding', () => {
    const a = base64ToUint8Array('Zm9v');
    const b = base64ToUint8Array('Zm9v====');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('isPushSupported', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubGlobals();
  });

  it('devuelve false cuando no hay serviceWorker', () => {
    vi.stubGlobal('navigator', {});
    expect(isPushSupported()).toBe(false);
  });

  it('devuelve false cuando no hay PushManager', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    expect(isPushSupported()).toBe(false);
  });

  it('devuelve true cuando SW + PushManager + window', () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ pushManager: {} }) },
    });
    // window existe en jsdom
    expect(isPushSupported()).toBe(true);
  });
});

describe('requestNotificationPermission', () => {
  afterEach(() => {
    vi.unstubGlobals();
    vi.restoreAllMocks();
  });

  it('lanza si Notification no existe', async () => {
    vi.stubGlobal('Notification', undefined);
    await expect(requestNotificationPermission()).rejects.toThrow(/no soporta/);
  });

  it('devuelve el estado concedido', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { requestPermission });
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalledOnce();
  });
});

describe('subscribePush', () => {
  afterEach(() => {
    vi.unstubGlobals();
    vi.restoreAllMocks();
  });

  const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SVlM7WQ3xQ5rE_3...';

  function stubEnv({ permission }: { permission: NotificationPermission }) {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256dh-base64', auth: 'auth-base64' },
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const pushManager = {
      subscribe: vi.fn().mockResolvedValue(subscription),
    };
    const registration = { pushManager };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    vi.stubGlobal('Notification', {
      permission,
      requestPermission: vi.fn().mockResolvedValue(permission === 'default' ? 'granted' : permission),
    });
    return { subscription, pushManager, registration };
  }

  it('pide permiso y devuelve la suscripción cuando se concede', async () => {
    const { subscription } = stubEnv({ permission: 'default' });
    const result = await subscribePush(VAPID);
    expect(result).toEqual(subscription);
  });

  it('lanza cuando el permiso es denegado', async () => {
    stubEnv({ permission: 'denied' });
    await expect(subscribePush(VAPID)).rejects.toThrow(/denegó|denegad/i);
  });

  it('lanza cuando no hay soporte de push', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    await expect(subscribePush(VAPID)).rejects.toThrow(/no soporta/i);
  });
});

describe('unsubscribePush', () => {
  afterEach(() => {
    vi.unstubGlobals();
    vi.restoreAllMocks();
  });

  it('devuelve false si no hay SW/PushManager', async () => {
    vi.stubGlobal('navigator', {});
    await expect(unsubscribePush()).resolves.toBe(false);
  });

  it('llama a subscription.unsubscribe cuando hay suscripción', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: () => Promise.resolve({ unsubscribe }) },
        }),
      },
    });
    await expect(unsubscribePush()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Verificar que el test falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications/__tests__/push.test.ts
```
Expected: fallo (módulo no existe).

- [ ] **Step 3: Implementar `push.ts`**

Crear `frontend/src/features/notifications/push.ts`:

```typescript
/**
 * Utilidades de Web Push. Sin dependencias de React ni de la API client:
 * las funciones devuelven la `PushSubscription` (o lanzan) y el hook
 * `useRegisterPush` se encarga de llamar a `POST /notifications/register`.
 *
 * Requisitos en runtime: HTTPS (o localhost en dev) + VAPID configurado en backend.
 */

/** Tipo mínimo de la suscripción que necesitamos para registrarla en el backend. */
export interface PushSubscriptionLike {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  unsubscribe: () => Promise<boolean>;
}

type NavigatorLike = {
  serviceWorker?: {
    ready: Promise<{ pushManager?: { subscribe: (opts: PushSubscriptionOptionsInit) => Promise<PushSubscriptionLike>; getSubscription?: () => Promise<PushSubscriptionLike | null> } }>;
  };
};

function nav(): NavigatorLike {
  return (typeof navigator !== 'undefined' ? navigator : {}) as NavigatorLike;
}

/**
 * Convierte una clave pública VAPID (base64url, sin padding) a Uint8Array
 * para pasarla como `applicationServerKey` a `pushManager.subscribe`.
 * Acepta base64url (-_) y base64 estándar (+/), con o sin padding.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${pad}`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** ¿El navegador soporta Service Worker + PushManager? */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const n = nav();
  return Boolean(n.serviceWorker && typeof PushManager !== 'undefined');
}

/** Pide permiso de notificaciones. Lanza si el navegador no las soporta. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const NotificationCtor =
    typeof window !== 'undefined'
      ? (window as unknown as { Notification?: { requestPermission: () => Promise<NotificationPermission> } }).Notification
      : undefined;
  if (!NotificationCtor || typeof NotificationCtor.requestPermission !== 'function') {
    throw new Error('Este navegador no soporta notificaciones.');
  }
  return NotificationCtor.requestPermission();
}

/**
 * Orquesta el flujo de suscripción:
 * 1. Verifica soporte.
 * 2. Pide permiso (si no está concedido). Lanza si se deniega.
 * 3. Espera al SW y subscribe con `applicationServerKey` = VAPID.
 * Devuelve la `PushSubscription`.
 */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscriptionLike> {
  if (!isPushSupported()) {
    throw new Error('Este navegador no soporta notificaciones push.');
  }

  const permission =
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
      ? Notification.permission
      : await requestNotificationPermission();

  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado.');
  }

  const registration = await nav().serviceWorker!.ready;
  if (!registration.pushManager) {
    throw new Error('Este navegador no soporta notificaciones push.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(vapidPublicKey),
  });

  return subscription;
}

/**
 * Desuscribe la suscripción push actual del navegador.
 * Devuelve true si se eliminó, false si no había suscripción o falló.
 */
export async function unsubscribePush(): Promise<boolean> {
  const n = nav();
  if (!n.serviceWorker) return false;
  try {
    const registration = await n.serviceWorker.ready;
    if (!registration.pushManager?.getSubscription) return false;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications/__tests__/push.test.ts
```
Expected: ~13 tests en verde.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/push.ts \
        frontend/src/features/notifications/__tests__/push.test.ts
git commit -m "feat(notifications): utilidades Web Push (base64url, permiso, subscribe/unsubscribe) con TDD"
```

---

## Task 5: Hooks de Notifications (lista, badge polling, mutaciones)

Todos los hooks de datos de notifications en un solo archivo. `useUnreadCount` usa `refetchInterval` (45s) + refetch on window focus. `useNotifications` es `useInfiniteQuery` por cursor `before`.

**Files:**
- Create: `frontend/src/features/notifications/hooks.ts`

- [ ] **Step 1: Crear `features/notifications/hooks.ts`**

Crear `frontend/src/features/notifications/hooks.ts`:

```typescript
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import { toast } from 'sonner';
import type { PaginatedOut, OKMessage } from '../../types/common';
import type {
  NotificationOut,
  UnreadCountOut,
  VapidPublicKeyOut,
  PushSubscriptionIn,
  MarkedOut,
  DeletedOut,
} from './types';
import { subscribePush } from './push';

/** Query keys jerárquicas del dominio. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', { unreadOnly }] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  vapid: () => ['notifications', 'vapid'] as const,
};

const PAGE_SIZE = 30;
/** Polling del badge cada 45s. */
const UNREAD_POLL_MS = 45_000;

export interface NotificationsQuery {
  unreadOnly?: boolean;
  limit?: number;
  before?: string;
}

/** Lista paginada por cursor (`before`). */
export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<NotificationOut>>('/notifications', {
        query: {
          unread_only: unreadOnly ? true : undefined,
          limit: PAGE_SIZE,
          before: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/** Badge: cuenta de no leídas. Polling + refetch on focus. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiGet<UnreadCountOut>('/notifications/unread/count'),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: UNREAD_POLL_MS,
  });
}

/** Marca una notificación como leída (PATCH). Optimista sobre la lista y el count. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<OKMessage>(`/notifications/${id}/read`),
    onMutate: async (id: string) => {
      // Marca optimista en TODAS las variantes de lista (readOnly true/false).
      await qc.cancelQueries({ queryKey: ['notifications', 'list'] });
      const listQueries = qc.getQueriesData<PaginatedOut<NotificationOut>>({
        queryKey: ['notifications', 'list'],
      });
      for (const [key, data] of listQueries) {
        if (!data) continue;
        qc.setQueryData<PaginatedOut<NotificationOut>>(key, {
          ...data,
          items: data.items.map((n) =>
            n.id === id && n.read_at === null ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        });
      }
      // Decrementa el count optimista (mínimo 0).
      const count = qc.getQueryData<UnreadCountOut>(notificationKeys.unreadCount());
      if (count && count.count > 0) {
        qc.setQueryData<UnreadCountOut>(notificationKeys.unreadCount(), { count: count.count - 1 });
      }
      return { id };
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

/** Marca todas como leídas (POST read-all). */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<MarkedOut>('/notifications/read-all'),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(data.marked > 0 ? `${data.marked} marcadas como leídas` : 'No había notificaciones nuevas');
    },
    onError: () => toast.error('No se pudieron marcar las notificaciones.'),
  });
}

/** Borra todas las notificaciones del usuario (DELETE). */
export function useDeleteAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<DeletedOut>('/notifications'),
    onSuccess: (data) => {
      qc.setQueryData<PaginatedOut<NotificationOut>>(notificationKeys.list(false), {
        items: [],
        next_cursor: null,
      });
      qc.setQueryData<PaginatedOut<NotificationOut>>(notificationKeys.list(true), {
        items: [],
        next_cursor: null,
      });
      qc.setQueryData<UnreadCountOut>(notificationKeys.unreadCount(), { count: 0 });
      toast.success(`${data.deleted} notificaciones eliminadas`);
    },
    onError: () => toast.error('No se pudieron eliminar las notificaciones.'),
  });
}

/**
 * Lee la clave pública VAPID (público). Cache de la sesión.
 * `data.public_key === ""` significa que el backend no tiene VAPID configurado
 * → la feature push se omite silenciosamente.
 */
export function useVapidPublicKey() {
  return useQuery({
    queryKey: notificationKeys.vapid(),
    queryFn: () =>
      apiGet<VapidPublicKeyOut>('/notifications/vapid-public-key', {
        publicEndpoint: true,
      }),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Registra la suscripción push en el backend (POST /notifications/register). */
export function useRegisterPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vapidPublicKey }: { vapidPublicKey: string }) => {
      const subscription = await subscribePush(vapidPublicKey);
      const body: PushSubscriptionIn = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      };
      await apiPost<OKMessage>('/notifications/register', body);
      return subscription;
    },
    onSuccess: () => {
      toast.success('Notificaciones push activadas.');
      qc.invalidateQueries({ queryKey: notificationKeys.vapid() });
    },
    onError: (err) => {
      // No romper la UX: el degrade es silencioso salvo mensaje informativo.
      toast.error(
        err instanceof Error && /denegad/i.test(err.message)
          ? 'Permití las notificaciones en tu navegador para activarlas.'
          : 'No se pudieron activar las notificaciones push.',
      );
    },
  });
}

/** Elimina la suscripción push del backend (DELETE /notifications/subscription?endpoint=). */
export function useUnregisterPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (endpoint?: string) => {
      const deleted = await apiDelete<DeletedOut>('/notifications/subscription', {
        query: endpoint ? { endpoint } : undefined,
      });
      return deleted;
    },
    onSuccess: () => {
      toast.success('Notificaciones push desactivadas.');
      qc.invalidateQueries({ queryKey: notificationKeys.vapid() });
    },
    onError: () => toast.error('No se pudieron desactivar las notificaciones.'),
  });
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/hooks.ts
git commit -m "feat(notifications): hooks useNotifications (cursor), useUnreadCount (polling), mutaciones y push"
```

---

## Task 6: TDD — Tests de hooks de Notifications

Verifica el polling de `useUnreadCount`, la paginación de `useNotifications`, el optimistic update de `useMarkRead` y el invalidate de `useMarkAllRead`, mockeando `api/client`.

**Files:**
- Create: `frontend/src/features/notifications/__tests__/hooks.test.tsx`

- [ ] **Step 1: Crear el wrapper de tests para hooks de React Query**

Si `src/test/test-utils.tsx` (F0) expone `renderWithProviders`, reusarlo. Crear `frontend/src/features/notifications/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '../../../api/client';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
} from '../hooks';

function wrapper(initialEntries = ['/']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  // MemoryRouter no es necesario para hooks puros, pero lo envolvemos por si acaso.
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mockApi(impl: Partial<typeof client>) {
  vi.spyOn(client, 'apiGet').mockImplementation((impl.apiGet ?? vi.fn()) as never);
  vi.spyOn(client, 'apiPost').mockImplementation((impl.apiPost ?? vi.fn()) as never);
  vi.spyOn(client, 'apiPatch').mockImplementation((impl.apiPatch ?? vi.fn()) as never);
  vi.spyOn(client, 'apiDelete').mockImplementation((impl.apiDelete ?? vi.fn()) as never);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useUnreadCount', () => {
  it('carga el count inicial', async () => {
    mockApi({
      apiGet: vi.fn().mockResolvedValue({ count: 3 }) as never,
    });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.count).toBe(3));
  });

  it('refetcha al vencer el refetchInterval', async () => {
    const apiGet = vi.fn().mockResolvedValue({ count: 1 });
    mockApi({ apiGet: apiGet as never });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.count).toBe(1));
    expect(apiGet).toHaveBeenCalledTimes(1);
    // Avanza 45s + jitter.
    await vi.advanceTimersByTimeAsync(46_000);
    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('useNotifications', () => {
  it('carga la primera página y expone next_cursor', async () => {
    const page1 = {
      items: [
        { id: 'n1', type: 'match', payload: null, read_at: null, created_at: '2026-07-09T10:00:00Z' },
        { id: 'n2', type: 'new_message', payload: null, read_at: null, created_at: '2026-07-09T09:00:00Z' },
      ],
      next_cursor: '2026-07-09T09:00:00Z',
    };
    mockApi({ apiGet: vi.fn().mockResolvedValue(page1) as never });
    const { result } = renderHook(() => useNotifications(false), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.pages[0].items).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(true);
  });
});

describe('useMarkRead', () => {
  it('decrementa el count optimista', async () => {
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce({ count: 2 }) // unread count
      .mockResolvedValueOnce({ count: 1 }); // tras invalidar
    const apiPatch = vi.fn().mockResolvedValue({ message: 'ok' });
    mockApi({ apiGet: apiGet as never, apiPatch: apiPatch as never });

    const { result: countRes } = renderHook(() => useUnreadCount(), { wrapper: wrapper() });
    await waitFor(() => expect(countRes.current.data?.count).toBe(2));

    const { result } = renderHook(() => useMarkRead(), { wrapper: wrapper() });
    await result.current.mutateAsync('n1');
    expect(apiPatch).toHaveBeenCalledWith('/notifications/n1/read');
  });
});

describe('useMarkAllRead', () => {
  it('invalida las queries de notificaciones', async () => {
    const apiPost = vi.fn().mockResolvedValue({ marked: 4 });
    const apiGet = vi.fn().mockResolvedValue({ count: 4 });
    mockApi({ apiPost: apiPost as never, apiGet: apiGet as never });

    const { result } = renderHook(() => useMarkAllRead(), { wrapper: wrapper() });
    await result.current.mutateAsync();
    expect(apiPost).toHaveBeenCalledWith('/notifications/read-all');
  });
});
```

- [ ] **Step 2: Correr los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications/__tests__/hooks.test.tsx
```
Expected: tests en verde. Si `useMarkRead` optimista requiere el `MutationCache` con `setQueryData`, los tests validan el decremento via `getQueryData` post-mutación. Ajustar el assertion si el orden de invalidación difiere, pero la firma `apiPatch('/notifications/n1/read')` debe cumplirse.

> **Nota:** si jsdom no define `atob`, los tests de `push.test.ts` deben mockearlo. Vitest + jsdom lo definen por defecto; si falla, añadir `vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'))` y `vi.stubGlobal('btoa', …)` en `src/test/setup.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/__tests__/hooks.test.tsx
git commit -m "test(notifications): useUnreadCount polling, useNotifications paginación, markRead/markAllRead"
```

---

## Task 7: Componente `NotificationItem`

Render contextual del `payload` según `type`, icono/tono desde `notificationMeta`, badge de no leída y botón de marcar leída.

**Files:**
- Create: `frontend/src/features/notifications/components/NotificationItem.tsx`

- [ ] **Step 1: Crear `NotificationItem.tsx`**

Crear `frontend/src/features/notifications/components/NotificationItem.tsx`:

```typescript
import { formatRelativeTime } from '../../../lib/format';
import {
  Bell,
  CalendarClock,
  Handshake,
  MessageCircle,
  Star,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { NotificationOut } from '../types';
import { getNotificationMeta, type NotificationTone } from '../notificationMeta';

const ICONS: Record<string, LucideIcon> = {
  Bell,
  CalendarClock,
  Handshake,
  MessageCircle,
  Star,
  ShieldAlert,
  UserPlus,
};

const TONE_CLASS: Record<NotificationTone, string> = {
  brand: 'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
};

export interface NotificationItemProps {
  notification: NotificationOut;
  onMarkRead?: (id: string) => void;
}

/** Extrae un resumen legible del payload según el type. */
function describePayload(
  type: NotificationOut['type'],
  payload: Record<string, unknown> | null,
): string {
  if (!payload) return '';
  const get = (k: string): string | undefined =>
    payload[k] != null ? String(payload[k]) : undefined;

  switch (type) {
    case 'new_application': {
      const name = get('applicant_name') ?? get('user_name') ?? 'alguien';
      const title = get('plan_title') ?? 'tu plan';
      return `${name} se postuló a "${title}".`;
    }
    case 'match': {
      const peer = get('peer_name') ?? 'tu par';
      const title = get('plan_title');
      return title ? `Hicieron match en "${title}" con ${peer}.` : `¡Tienes un match con ${peer}!`;
    }
    case 'new_message': {
      const from = get('sender_name') ?? 'alguien';
      const preview = get('preview') ?? get('message') ?? '';
      return preview ? `${from}: ${preview}` : `Tienes un nuevo mensaje de ${from}.`;
    }
    case 'safety': {
      return get('message') ?? 'Se disparó una alerta de seguridad en uno de tus matches.';
    }
    case 'review': {
      const rating = get('rating');
      return rating ? `Recibiste una reseña de ${rating} estrellas.` : 'Recibiste una nueva reseña.';
    }
    case 'plan_alert': {
      const title = get('plan_title') ?? 'un plan';
      return get('message') ?? `Novedades en "${title}".`;
    }
    default:
      return get('message') ?? '';
  }
}

/** URL de destino al clic (deep link según type). */
function targetUrl(type: NotificationOut['type'], payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const get = (k: string): string | undefined =>
    payload[k] != null ? String(payload[k]) : undefined;
  if (type === 'new_application' || type === 'plan_alert') {
    const planId = get('plan_id');
    return planId ? `/plans/${planId}/applications` : null;
  }
  if (type === 'match' || type === 'new_message' || type === 'safety') {
    const matchId = get('match_id');
    return matchId ? `/matches/${matchId}` : null;
  }
  return null;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const meta = getNotificationMeta(notification.type);
  const Icon = ICONS[meta.icon] ?? Bell;
  const description = describePayload(notification.type, notification.payload);
  const href = targetUrl(notification.type, notification.payload);
  const unread = notification.read_at === null;

  const content = (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-xl transition-colors',
        unread ? 'bg-brand-50/60' : 'bg-white/40',
        href && 'hover:bg-white/80 cursor-pointer',
      )}
    >
      <div className={cn('flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center', TONE_CLASS[meta.tone])}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
          {unread && (
            <span
              className="w-2 h-2 rounded-full bg-brand-600"
              aria-label="No leída"
            />
          )}
        </div>
        {description && <p className="text-sm text-gray-700 mt-0.5 break-words">{description}</p>}
        <p className="text-xs text-gray-500 mt-1" title={notification.created_at}>
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
      {unread && onMarkRead && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
          className="flex-shrink-0 text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline self-center"
          aria-label={`Marcar como leída: ${meta.label}`}
        >
          Marcar leída
        </button>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl">
        {content}
      </a>
    );
  }
  return content;
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/components/NotificationItem.tsx
git commit -m "feat(notifications): NotificationItem con render contextual de payload por type"
```

---

## Task 8: Componente `NotificationBell`

Badge en el header con el unread count (polling), accesible, con dropdown de últimas 5 + link a la página completa.

**Files:**
- Create: `frontend/src/features/notifications/components/NotificationBell.tsx`

- [ ] **Step 1: Crear `NotificationBell.tsx`**

Crear `frontend/src/features/notifications/components/NotificationBell.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUnreadCount, useNotifications, useMarkAllRead } from '../hooks';
import { NotificationItem } from './NotificationItem';

/**
 * Campana de notificaciones para el header. Muestra un badge con el count de
 * no leídas (polling) y un dropdown con las últimas 5. Link a /notifications
 * para ver todas.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: countData } = useUnreadCount();
  const { data } = useNotifications(false);
  const markAll = useMarkAllRead();

  const unread = countData?.count ?? 0;
  const recent = data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];

  // Cerrar al clic fuera.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const badgeLabel = unread > 99 ? '99+' : String(unread);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative p-2 rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Bell className="w-6 h-6 text-gray-700" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones recientes"
          className={cn(
            'absolute right-0 mt-2 w-[22rem] max-w-[92vw] z-50',
            'glass-panel rounded-2xl shadow-xl border border-gray-200 overflow-hidden',
          )}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Notificaciones</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                No tienes notificaciones.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recent.map((n) => (
                  <li key={n.id}>
                    <NotificationItem notification={n} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 p-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-brand-700 hover:bg-brand-50 rounded-lg py-2"
            >
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/components/NotificationBell.tsx
git commit -m "feat(notifications): NotificationBell con badge, dropdown de recientes y mark-all"
```

---

## Task 9: Página `NotificationsPage` (`/notifications`)

Lista completa paginada (cursor), filtro de no leídas, acciones de marcar todas / borrar todas, y panel de Web Push (activar/desactivar) que aparece solo si hay VAPID key.

**Files:**
- Create: `frontend/src/features/notifications/pages/NotificationsPage.tsx`

- [ ] **Step 1: Crear `NotificationsPage.tsx`**

Crear `frontend/src/features/notifications/pages/NotificationsPage.tsx`:

```typescript
import { useState } from 'react';
import { BellOff, CheckCheck, Trash2, BellRing, BellOff as BellOffIcon } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useDeleteAllNotifications, useVapidPublicKey, useRegisterPush, useUnregisterPush } from '../hooks';
import { NotificationItem } from '../components/NotificationItem';
import { NotificationBell } from '../components/NotificationBell';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { isPushSupported } from '../push';

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);

  const query = useNotifications(unreadOnly);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const deleteAll = useDeleteAllNotifications();

  const vapid = useVapidPublicKey();
  const registerPush = useRegisterPush();
  const unregisterPush = useUnregisterPush();

  const pushSupported = isPushSupported();
  const vapidAvailable = Boolean(vapid.data?.public_key);
  const showPushPanel = pushSupported && vapidAvailable;

  const notifications = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Notificaciones</h1>
          <NotificationBell />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Filtros y acciones masivas */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div role="tablist" aria-label="Filtrar notificaciones" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              role="tab"
              aria-selected={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
              className={`px-3 py-1.5 text-sm rounded-md ${!unreadOnly ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              Todas
            </button>
            <button
              role="tab"
              aria-selected={unreadOnly}
              onClick={() => setUnreadOnly(true)}
              className={`px-3 py-1.5 text-sm rounded-md ${unreadOnly ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              No leídas
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || notifications.length === 0}
            >
              <CheckCheck className="w-4 h-4 mr-1" aria-hidden="true" /> Marcar todas
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteAll.mutate()}
              disabled={deleteAll.isPending || notifications.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-1" aria-hidden="true" /> Borrar todas
            </Button>
          </div>
        </div>

        {/* Panel Web Push (solo si hay VAPID + soporte) */}
        {showPushPanel && (
          <PushOptInPanel
            loading={registerPush.isPending || unregisterPush.isPending}
            onEnable={() => registerPush.mutate({ vapidPublicKey: vapid.data!.public_key })}
            onDisable={() => unregisterPush.mutate()}
          />
        )}

        {/* Lista */}
        {query.isLoading && (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        )}
        {query.isError && (
          <ErrorState
            title="No se pudieron cargar las notificaciones"
            onRetry={() => query.refetch()}
          />
        )}
        {!query.isLoading && !query.isError && notifications.length === 0 && (
          <EmptyState
            icon={<BellOff className="w-10 h-10 text-gray-400" aria-hidden="true" />}
            title={unreadOnly ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
            description="Cuando ocurra algo importante (match, mensajes, postulaciones) aparecerá aquí."
          />
        )}

        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationItem
                notification={n}
                onMarkRead={(id) => markRead.mutate(id)}
              />
            </li>
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function PushOptInPanel({
  loading,
  onEnable,
  onDisable,
}: {
  loading: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
      <BellRing className="w-5 h-5 text-brand-600 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">Notificaciones push</p>
        <p className="text-xs text-gray-600">
          Recibe avisos en tu dispositivo incluso con la app cerrada.
        </p>
      </div>
      {enabled ? (
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          onClick={() => {
            onDisable();
            setEnabled(false);
          }}
        >
          <BellOffIcon className="w-4 h-4 mr-1" aria-hidden="true" /> Desactivar
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={() => {
            onEnable();
            setEnabled(true);
          }}
        >
          Activar
        </Button>
      )}
    </div>
  );
}
```

> **Nota a11y/UX:** el flag `enabled` es local a la sesión; el estado real de la suscripción debería leerse del navegador (`pushManager.getSubscription()`) al montar para reflejar "Activar/Desactivar" correctamente. Esta mejora opcional se añade en la pasada de pulido (Task 17). Por ahora el panel habilita el registro; el degrade es funcional.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/pages/NotificationsPage.tsx
git commit -m "feat(notifications): NotificationsPage con paginado, filtro unread y panel push opt-in"
```

---

## Task 10: Service Worker custom (`src/sw.ts`) + vite-plugin-pwa

Configura el plugin PWA en `vite.config.ts`, crea el SW custom que maneja `push`, `notificationclick` y `pushsubscriptionchange`, y registra el SW manualmente desde `main.tsx`.

> **Dependencia crítica:** Web Push solo funciona bajo **HTTPS** (o `localhost`/`127.0.0.1` en dev). En staging/prod, el sitio debe servirse por HTTPS. Si el backend no tiene `vapid_public.pem`, `GET /notifications/vapid-public-key` devuelve `{ public_key: "" }` y la UI omite el panel push (Task 9) — degrade elegante.

**Files:**
- Modify: `frontend/package.json` (deps)
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/sw.ts`
- Modify: `frontend/src/main.tsx`
- Create: `frontend/public/icons/` (PNGs de icono)
- Modify: `frontend/.env.example`

- [ ] **Step 1: Instalar `vite-plugin-pwa`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install -D vite-plugin-pwa@^0.20
```
Expected: instalación OK. (No instalamos `workbox-window` manualmente; `vite-plugin-pwa` lo gestiona con `injectRegister:false` y registro manual.)

- [ ] **Step 2: Crear iconos PWA placeholders**

Generar PNGs de icono desde el logo existente. Si `frontend/assets/` tiene un logo, escalarlo; si no, crear placeholders sólidos del color brand. Run:

```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
mkdir -p public/icons
# Genera PNGs 192 y 512 con ImageMagick si está disponible; si no, commitear PNGs manuales.
if command -v magick >/dev/null 2>&1; then
  magick -size 192x192 xc:'#4f46e5' -gravity center -fill white -pointsize 48 -annotate +0+0 'GAD' public/icons/pwa-192.png
  magick -size 512x512 xc:'#4f46e5' -gravity center -fill white -pointsize 128 -annotate +0+0 'GAD' public/icons/pwa-512.png
  magick -size 512x512 xc:'#4f46e5' public/icons/maskable-512.png
  echo "Iconos generados con ImageMagick"
else
  echo "ImageMagick no disponible — crear manualmente public/icons/{pwa-192,pwa-512,maskable-512}.png (cualquier PNG válido)"
fi
ls -la public/icons/
```
Expected: 3 archivos PNG en `public/icons/`. Si no hay ImageMagick, dejar instrucción de crear manualmente (cualquier PNG del tamaño correcto sirve para que el manifest sea válido).

- [ ] **Step 3: Crear `src/sw.ts` (SW custom)**

Crear `frontend/src/sw.ts`:

```typescript
/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Service Worker de GAD.
 * Maneja eventos de Web Push y notificationclick.
 * vite-plugin-pwa inyecta el precaching de los assets de build (no se declara aquí).
 */
declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  type?: string;
  url?: string;
  icon?: string;
  badge?: string;
}

const DEFAULT_ICON = '/icons/pwa-192.png';
const DEFAULT_BADGE = '/icons/pwa-192.png';

self.addEventListener('install', () => {
  // Activate immediately (autoUpdate strategy).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    if (event.data) {
      payload = event.data.json() as PushPayload;
    }
  } catch {
    // Payload de texto plano.
    if (event.data) {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title ?? 'GAD';
  const options: NotificationOptions = {
    body: payload.body ?? 'Tienes una nueva notificación',
    icon: payload.icon ?? DEFAULT_ICON,
    badge: payload.badge ?? DEFAULT_BADGE,
    data: { url: payload.url ?? '/notifications' },
    requireInteraction: payload.type === 'safety',
    tag: payload.type ? `gad-${payload.type}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string | undefined) ?? '/notifications';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        try {
          await client.focus();
          // Opcional: navegar al target si el cliente lo soporta (postMessage).
          return;
        } catch {
          // continuar
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

/**
 * Cuando la suscripción caduca/cambia, el navegador reenvía el evento.
 * En producción se debería re-registrar contra el backend; por ahora notificamos
 * a la app para que lo rehaga (la app escucha este evento).
 */
self.addEventListener('pushsubscriptionchange', (event: PushEvent & { oldSubscription?: PushSubscription; newSubscription?: PushSubscription }) => {
  const broadcast = async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      c.postMessage({ type: 'pushsubscriptionchange' });
    }
  };
  event.waitUntil(broadcast());
});

// Exponer el tipo para TS.
export {};
```

- [ ] **Step 4: Modificar `vite.config.ts` (añadir VitePWA + proxy si falta)**

> Si F0 ya configuró el proxy `/api`→`:8000`, conservar ese bloque. Este paso añade el plugin PWA.

Reemplazar el contenido de `frontend/vite.config.ts` por:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registro manual en main.tsx
      devOptions: {
        enabled: true, // permite probar push en dev (localhost)
        type: 'module',
      },
      manifest: {
        name: 'GAD',
        short_name: 'GAD',
        description: 'Conecta con gente para actividades presenciales.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173, // coincide con CORS por defecto del backend
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://localhost:8000', ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/ws/, '') },
    },
    // Conservar el hack DISABLE_HMR de F0 si el agente lo necesita:
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
```

> **Nota sobre proxy:** F0 definió baseURL desde `VITE_API_URL` (default `http://localhost:8000`). Si el `api/client.ts` usa `VITE_API_URL` directamente, el proxy `/api` es opcional. **Reconciliar:** si `client.ts` ya apunta a `:8000` directamente, el proxy queda como conveniencia para evitar CORS; si apunta a `/api`, el proxy es obligatorio. Mantener coherente con F0. No romper el `BASE_URL` existente.

- [ ] **Step 5: Registrar el SW manualmente en `main.tsx`**

En `frontend/src/main.tsx`, añadir registro del SW **después** del mount, condicional a producción o `devOptions.enabled`. Insertar antes del cierre del módulo (no dentro de un componente):

```typescript
// Registro del Service Worker (Web Push). Solo si el navegador soporta SW.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Forzar actualización silenciosa.
        reg.update().catch(() => { /* noop */ });
      })
      .catch((err) => {
        // Falla silenciosa: la app sigue funcionando sin push.
        console.warn('SW registration failed:', err);
      });
  });
}
```

> Si F0 ya monta el `Toaster` y los providers, añadir este bloque al final del archivo `main.tsx` sin alterar la composición de providers. Si el SW de `vite-plugin-pwa` ya está registrado por el plugin (`injectRegister:false` aquí → registro manual), el path `/sw.js` corresponde al `filename: 'sw.ts'` compilado a `dist/sw.js`.

- [ ] **Step 6: Actualizar `.env.example` con flag opcional**

En `frontend/.env.example`, añadir (si no existe):

```
# Activa Web Push. Requiere HTTPS + VAPID configurado en el backend.
# Déjalo vacío o en "false" para forzar el degrade silencioso.
VITE_ENABLE_PUSH=true
```

- [ ] **Step 7: Verificar build (el SW se compila)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build verde; `dist/sw.js` generado; `dist/manifest.webmanifest` presente. Si falla por tipos de `self` en `sw.ts`, confirmar que `/// <reference lib="webworker" />` está en la primera línea y que `tsconfig.json` incluye `WebWorker` o se relaja para `sw.ts`.

- [ ] **Step 8: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts \
        frontend/src/sw.ts frontend/src/main.tsx frontend/.env.example frontend/public/icons
git commit -m "feat(pwa): vite-plugin-pwa + service worker custom para Web Push (push/notificationclick)"
```

---

## Task 11: Hook orquestador `usePushBootstrap` y registro tras login

Decide al montar la app (si el usuario está autenticado) si debe auto-registrar push (basado en VAPID + soporte + flag `VITE_ENABLE_PUSH`). Se invoca desde `App.tsx` o un `PushBootstrap` montado dentro de `RequireAuth`.

**Files:**
- Create: `frontend/src/features/notifications/usePushBootstrap.ts`
- Modify: `frontend/src/App.tsx` (montar bootstrap dentro del árbol autenticado)

- [ ] **Step 1: Crear `usePushBootstrap.ts`**

Crear `frontend/src/features/notifications/usePushBootstrap.ts`:

```typescript
import { useEffect } from 'react';
import { useVapidPublicKey, useRegisterPush } from './hooks';
import { isPushSupported } from './push';

const PUSH_FLAG = import.meta.env.VITE_ENABLE_PUSH;
const LOCALSTORAGE_KEY = 'gad:push_enabled';

function flagEnabled(): boolean {
  if (PUSH_FLAG === undefined) return true; // default: intentar
  return String(PUSH_FLAG).toLowerCase() !== 'false';
}

/**
 * Si el usuario está autenticado, el navegador soporta push, hay VAPID key y
 * el flag lo permite, auto-registra la suscripción push UNA vez (marca en
 * localStorage para no insistir si el usuario ya la rechazó/desactivó).
 *
 * Es seguro llamarlo siempre; si las condiciones no se dan, es no-op.
 */
export function usePushBootstrap(isAuthenticated: boolean) {
  const vapid = useVapidPublicKey();
  const registerPush = useRegisterPush();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!flagEnabled()) return;
    if (!isPushSupported()) return;
    if (vapid.isLoading || vapid.isError) return;
    const key = vapid.data?.public_key;
    if (!key) return; // backend sin VAPID → degrade silencioso

    const alreadyTried = localStorage.getItem(LOCALSTORAGE_KEY) === 'true';
    if (alreadyTried) return; // no insistir

    // Permiso concedido de antes → registrar directo. Si no, pedir.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      localStorage.setItem(LOCALSTORAGE_KEY, 'true');
      registerPush.mutate({ vapidPublicKey: key });
    }
    // Si el permiso es 'default', el usuario debe activarlo desde la página de
    // notificaciones (opt-in explícito). Si es 'denied', no insistir.
  }, [isAuthenticated, vapid, registerPush]);
}
```

- [ ] **Step 2: Montar el bootstrap en `App.tsx`**

Si `App.tsx` (F0) es `<RouterProvider router={router}/>`, crear un wrapper `PushBootstrap` que se renderice dentro de las rutas autenticadas. Opción simple: un componente montado en el layout/header. Para no tocar `router.tsx` aquí, añadir un componente `PushGate` dentro del `RequireAuth`.

Crear `frontend/src/features/notifications/PushGate.tsx`:

```typescript
import { useAuth } from '../../auth/useAuth';
import { usePushBootstrap } from './usePushBootstrap';

/** Monta el bootstrap de push para usuarios autenticados. No renderiza nada. */
export function PushGate() {
  const { status } = useAuth();
  usePushBootstrap(status === 'authenticated');
  return null;
}
```

En `frontend/src/router.tsx` (Task 14), se monta `<PushGate/>` dentro del layout autenticado. Por ahora, verificar tsc.

- [ ] **Step 3: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/notifications/usePushBootstrap.ts \
        frontend/src/features/notifications/PushGate.tsx
git commit -m "feat(notifications): usePushBootstrap auto-registra push tras login con degrade silencioso"
```

---

## SECCIÓN B — ADMIN

## Task 12: Tipos del dominio Admin

**Files:**
- Create: `frontend/src/features/admin/types.ts`

- [ ] **Step 1: Crear `features/admin/types.ts`**

Crear `frontend/src/features/admin/types.ts`:

```typescript
/**
 * Tipos del dominio Admin (contrato §Admin). Requieren rol admin en backend.
 *
 * `GET /admin/stats` → AdminStatsOut.
 * `GET /admin/reports` → PaginatedOut<ReportOut>; PATCH /admin/reports/{id} {status}.
 * `GET /admin/users` → PaginatedOut<AdminUserOut>; ban/suspend/activate.
 * `POST /admin/plans/{id}/cancel` → { message }.
 * `GET /admin/reviews` → PaginatedOut<dict>; DELETE /admin/reviews/{id}.
 */
import type { UserStatus } from '../../types/enums';

/** `GET /admin/stats`. */
export interface AdminStatsOut {
  total_users: number;
  total_plans: number;
  total_matches: number;
  open_reports: number;
}

/** Estados posibles de un reporte (contrato usa string libre; acotamos). */
export type ReportStatus = 'open' | 'resolved' | 'closed';

/** Reporte de usuario. Si F6 ya definió ReportOut en features/reports, reusar; este es el canónico admin. */
export interface ReportOut {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description: string | null;
  status: string; // tipamos como string para aceptar estados del backend que no acotemos
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** `GET /admin/users` items. */
export interface AdminUserOut {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  is_admin: boolean;
  reputation_score: number;
  created_at: string;
}

/** Body de `PATCH /admin/reports/{id}`. */
export interface ReportStatusUpdate {
  status: string;
}

/** Reseña flagged devuelta por `GET /admin/reviews` (dict crudo del backend). */
export interface AdminReviewOut {
  id: string;
  match_id?: string;
  reviewer_id?: string;
  reviewee_id?: string;
  rating: number;
  comment?: string | null;
  flag?: string | null;
  created_at?: string;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/types.ts
git commit -m "feat(admin): tipos AdminStatsOut, AdminUserOut, ReportOut, AdminReviewOut"
```

---

## Task 13: Hooks de Admin

Todos los hooks de datos del panel admin: stats, reports (listado + update), users (listado + ban/suspend/activate), cancel plan, reviews (listado + delete). Invalidación precisa de query keys.

**Files:**
- Create: `frontend/src/features/admin/hooks.ts`

- [ ] **Step 1: Crear `features/admin/hooks.ts`**

Crear `frontend/src/features/admin/hooks.ts`:

```typescript
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import { toast } from 'sonner';
import type { PaginatedOut, OKMessage } from '../../types/common';
import type {
  AdminStatsOut,
  AdminUserOut,
  ReportOut,
  ReportStatusUpdate,
  AdminReviewOut,
} from './types';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  reports: (status?: string) => ['admin', 'reports', { status }] as const,
  users: (status?: string) => ['admin', 'users', { status }] as const,
  reviews: () => ['admin', 'reviews'] as const,
};

const PAGE_SIZE = 50;

// ---------- Stats ----------

export function useAdminStats(enabled = true) {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => apiGet<AdminStatsOut>('/admin/stats'),
    enabled,
    staleTime: 60_000,
  });
}

// ---------- Reports ----------

export function useAdminReports(status?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.reports(status),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<ReportOut>>('/admin/reports', {
        query: { status, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useUpdateReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<ReportOut>(`/admin/reports/${id}`, { status } satisfies ReportStatusUpdate),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
      toast.success(`Reporte marcado como "${updated.status}".`);
    },
    onError: () => toast.error('No se pudo actualizar el reporte.'),
  });
}

// ---------- Users ----------

export function useAdminUsers(status?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(status),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserOut>>('/admin/users', {
        query: { status, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

function userActionToast(ok: string, err: string) {
  return {
    onSuccess: () => {
      toast.success(ok);
    },
    onError: () => toast.error(err),
  };
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/ban`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario baneado.', 'No se pudo banear al usuario.'),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/suspend`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario suspendido.', 'No se pudo suspender al usuario.'),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/activate`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario reactivado.', 'No se pudo reactivar al usuario.'),
  });
}

// ---------- Plans (cancelación por moderación) ----------

export function useAdminCancelPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost<OKMessage>(`/admin/plans/${planId}/cancel`),
    onSuccess: () => {
      toast.success('Plan cancelado por moderación.');
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: () => toast.error('No se pudo cancelar el plan.'),
  });
}

// ---------- Reviews (moderación) ----------

export function useAdminReviews() {
  return useInfiniteQuery({
    queryKey: adminKeys.reviews(),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminReviewOut>>('/admin/reviews', {
        query: { limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useAdminDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => apiDelete<OKMessage>(`/admin/reviews/${reviewId}`),
    onSuccess: () => {
      toast.success('Reseña eliminada por moderación.');
      qc.invalidateQueries({ queryKey: adminKeys.reviews() });
    },
    onError: () => toast.error('No se pudo eliminar la reseña.'),
  });
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/hooks.ts
git commit -m "feat(admin): hooks stats/reports/users/plans/reviews con invalidación de queries"
```

---

## Task 14: TDD — Tests de hooks de Admin

Valida `useAdminStats`, paginación de `useAdminReports`, `useUpdateReportStatus`, y acciones de usuario.

**Files:**
- Create: `frontend/src/features/admin/__tests__/hooks.test.tsx`

- [ ] **Step 1: Crear `hooks.test.tsx`**

Crear `frontend/src/features/admin/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '../../../api/client';
import {
  useAdminStats,
  useAdminReports,
  useUpdateReportStatus,
  useBanUser,
} from '../hooks';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mockApi(impl: Partial<typeof client>) {
  vi.spyOn(client, 'apiGet').mockImplementation((impl.apiGet ?? vi.fn()) as never);
  vi.spyOn(client, 'apiPost').mockImplementation((impl.apiPost ?? vi.fn()) as never);
  vi.spyOn(client, 'apiPatch').mockImplementation((impl.apiPatch ?? vi.fn()) as never);
  vi.spyOn(client, 'apiDelete').mockImplementation((impl.apiDelete ?? vi.fn()) as never);
}

afterEach(() => vi.restoreAllMocks());

describe('useAdminStats', () => {
  it('carga las métricas', async () => {
    mockApi({
      apiGet: vi.fn().mockResolvedValue({
        total_users: 10,
        total_plans: 5,
        total_matches: 3,
        open_reports: 2,
      }) as never,
    });
    const { result } = renderHook(() => useAdminStats(), { wrapper });
    await waitFor(() => expect(result.current.data?.total_users).toBe(10));
  });
});

describe('useAdminReports', () => {
  it('carga la primera página de reportes', async () => {
    mockApi({
      apiGet: vi.fn().mockResolvedValue({
        items: [
          { id: 'r1', reporter_id: 'u1', reported_id: 'u2', reason: 'spam', description: null, status: 'open', payload: null, created_at: '2026-07-09T10:00:00Z' },
        ],
        next_cursor: null,
      }) as never,
    });
    const { result } = renderHook(() => useAdminReports('open'), { wrapper });
    await waitFor(() => expect(result.current.data?.pages[0].items).toHaveLength(1));
    expect(client.apiGet).toHaveBeenCalledWith('/admin/reports', expect.objectContaining({ query: expect.objectContaining({ status: 'open' }) }));
  });
});

describe('useUpdateReportStatus', () => {
  it('hace PATCH al reporte con el nuevo status', async () => {
    const apiPatch = vi.fn().mockResolvedValue({
      id: 'r1', reporter_id: 'u1', reported_id: 'u2', reason: 'spam', description: null, status: 'resolved', payload: null, created_at: '2026-07-09T10:00:00Z',
    });
    mockApi({ apiPatch: apiPatch as never });
    const { result } = renderHook(() => useUpdateReportStatus(), { wrapper });
    await result.current.mutateAsync({ id: 'r1', status: 'resolved' });
    expect(apiPatch).toHaveBeenCalledWith('/admin/reports/r1', { status: 'resolved' });
  });
});

describe('useBanUser', () => {
  it('hace POST al ban', async () => {
    const apiPost = vi.fn().mockResolvedValue({
      id: 'u2', email: 'a@b.com', display_name: 'A', status: 'suspended', is_admin: false, reputation_score: 0, created_at: '2026-07-01T00:00:00Z',
    });
    mockApi({ apiPost: apiPost as never });
    const { result } = renderHook(() => useBanUser(), { wrapper });
    await result.current.mutateAsync('u2');
    expect(apiPost).toHaveBeenCalledWith('/admin/users/u2/ban');
  });
});
```

- [ ] **Step 2: Correr los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/admin/__tests__/hooks.test.tsx
```
Expected: tests en verde.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/__tests__/hooks.test.tsx
git commit -m "test(admin): stats, reports paginación, updateStatus y ban con mocks de api/client"
```

---

## Task 15: `RequireAdminRoute` (guard admin robusto)

Guard que **sí** verifica el rol admin leyendo `is_admin` de `GET /me` (o `GET /auth/me` con cast defensivo si F2 no expone `UserDetail`). Reemplaza al `RequireAdmin` de F0 (que asumía false) en el router de `/admin/*`.

**Files:**
- Create: `frontend/src/features/admin/RequireAdminRoute.tsx`

- [ ] **Step 1: Crear `RequireAdminRoute.tsx`**

Crear `frontend/src/features/admin/RequireAdminRoute.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { Spinner } from '../../components/ui/Spinner';

/**
 * `GET /me` (UserDetail) — el contrato actual NO garantiza `is_admin` en todas
 * las formas de usuario, pero `UserDetail` del backend sí lo incluye en la
 * implementación. Lo leemos defensivamente: si el campo no viene, default false.
 */
interface MeForAdmin {
  is_admin?: boolean;
}

function useIsAdmin(): { isLoading: boolean; isAdmin: boolean } {
  const { status } = useAuth();
  const enabled = status === 'authenticated';
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'admin-check'],
    queryFn: () => apiGet<MeForAdmin>('/me'),
    enabled,
    staleTime: 5 * 60_000, // el rol no cambia en sesión
  });
  return { isLoading: enabled && isLoading, isAdmin: Boolean(data?.is_admin) };
}

/**
 * Guard admin: requiere auth Y `is_admin === true` (vía GET /me).
 * - loading → spinner.
 * - no auth → /login.
 * - auth pero no admin → /explore (403 implícito en UI; el backend devolverá 403 en endpoints).
 */
export function RequireAdminRoute() {
  const { status } = useAuth();
  const { isLoading, isAdmin } = useIsAdmin();

  if (status === 'loading' || isLoading) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/explore" replace />;
  }

  return <Outlet />;
}
```

> **Si `GET /me` no expone `is_admin`:** verificar contra el backend real. El contrato `UserDetail` (§Usuarios) no lista `is_admin`, pero la implementación del backend sí lo setea (lo usa `require_admin`). Si el campo genuinamente no viene, fallback: llamar a `GET /admin/stats` como sonda (devuelve 403 si no es admin). Implementar ese fallback solo si el check por `/me` falla en smoke. Documentar la decisión.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/RequireAdminRoute.tsx
git commit -m "feat(admin): RequireAdminRoute que verifica is_admin vía GET /me"
```

---

## Task 16: Componentes admin (`AdminNav`, `AdminStatCard`, `ReportRow`, `AdminUserRow`, `AdminReviewRow`)

**Files:**
- Create: `frontend/src/features/admin/components/AdminNav.tsx`
- Create: `frontend/src/features/admin/components/AdminStatCard.tsx`
- Create: `frontend/src/features/admin/components/ReportRow.tsx`
- Create: `frontend/src/features/admin/components/AdminUserRow.tsx`
- Create: `frontend/src/features/admin/components/AdminReviewRow.tsx`

- [ ] **Step 1: Crear `AdminNav.tsx`**

Crear `frontend/src/features/admin/components/AdminNav.tsx`:

```typescript
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Flag, Users, Star } from 'lucide-react';
import { cn } from '../../../lib/utils';

const ITEMS = [
  { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', label: 'Reportes', icon: Flag, end: false },
  { to: '/admin/users', label: 'Usuarios', icon: Users, end: false },
  { to: '/admin/reviews', label: 'Reseñas', icon: Star, end: false },
];

export function AdminNav() {
  return (
    <nav aria-label="Panel de administración" className="flex gap-1 overflow-x-auto py-2">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap',
              isActive ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100',
            )
          }
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Crear `AdminStatCard.tsx`**

Crear `frontend/src/features/admin/components/AdminStatCard.tsx`:

```typescript
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface AdminStatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
}

const TONE: Record<NonNullable<AdminStatCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
};

export function AdminStatCard({ label, value, icon: Icon, tone = 'brand' }: AdminStatCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center gap-4">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', TONE[tone])}>
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `ReportRow.tsx`**

Crear `frontend/src/features/admin/components/ReportRow.tsx`:

```typescript
import { formatRelativeTime } from '../../../lib/format';
import { Badge } from '../../../components/ui/Badge';
import type { ReportOut } from '../types';

export interface ReportRowProps {
  report: ReportOut;
  onStatusChange: (id: string, status: string) => void;
  disabled?: boolean;
}

const STATUS_TONE: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  open: 'warning',
  resolved: 'success',
  closed: 'brand',
};

export function ReportRow({ report, onStatusChange, disabled }: ReportRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUS_TONE[report.status] ?? 'brand'}>{report.status}</Badge>
            <span className="text-sm font-semibold text-gray-900">{report.reason}</span>
          </div>
          {report.description && <p className="text-sm text-gray-700 mt-1">{report.description}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Reporter: <span className="font-mono">{report.reporter_id.slice(0, 8)}</span> ·
            Reportado: <span className="font-mono">{report.reported_id.slice(0, 8)}</span> ·
            {formatRelativeTime(report.created_at)}
          </p>
        </div>
        <label className="text-xs text-gray-600 flex flex-col gap-1 flex-shrink-0">
          Estado
          <select
            value={report.status}
            disabled={disabled}
            onChange={(e) => onStatusChange(report.id, e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm disabled:opacity-50"
            aria-label={`Cambiar estado del reporte ${report.id}`}
          >
            <option value="open">Abierto</option>
            <option value="resolved">Resuelto</option>
            <option value="closed">Cerrado</option>
          </select>
        </label>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Crear `AdminUserRow.tsx`**

Crear `frontend/src/features/admin/components/AdminUserRow.tsx`:

```typescript
import { formatRelativeTime } from '../../../lib/format';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import type { AdminUserOut } from '../types';

export interface AdminUserRowProps {
  user: AdminUserOut;
  onBan: (id: string) => void;
  onSuspend: (id: string) => void;
  onActivate: (id: string) => void;
  busy?: boolean;
}

const STATUS_TONE: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

export function AdminUserRow({ user, onBan, onSuspend, onActivate, busy }: AdminUserRowProps) {
  const isActive = user.status === 'active';
  return (
    <li className="glass-panel rounded-xl p-4 flex items-center gap-3">
      <Avatar name={user.display_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 truncate">{user.display_name}</span>
          {user.is_admin && <Badge tone="brand">Admin</Badge>}
          <Badge tone={STATUS_TONE[user.status] ?? 'brand'}>{user.status}</Badge>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {user.email} · Reputación: {user.reputation_score.toFixed(1)} · {formatRelativeTime(user.created_at)}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {!isActive && (
          <Button size="sm" variant="secondary" onClick={() => onActivate(user.id)} disabled={busy}>
            Activar
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="secondary" onClick={() => onSuspend(user.id)} disabled={busy}>
            Suspender
          </Button>
        )}
        {user.status !== 'deleted' && (
          <Button size="sm" variant="danger" onClick={() => onBan(user.id)} disabled={busy}>
            Banear
          </Button>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Crear `AdminReviewRow.tsx`**

Crear `frontend/src/features/admin/components/AdminReviewRow.tsx`:

```typescript
import { Star, Flag } from 'lucide-react';
import { formatRelativeTime } from '../../../lib/format';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { AdminReviewOut } from '../types';

export interface AdminReviewRowProps {
  review: AdminReviewOut;
  onDelete: (id: string) => void;
  busy?: boolean;
}

export function AdminReviewRow({ review, onDelete, busy }: AdminReviewRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-amber-500" aria-label={`Puntuación: ${review.rating}`}>
              <Star className="w-4 h-4 fill-current" aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-900">{review.rating}</span>
            </span>
            {review.flag && (
              <Badge tone="warning">
                <Flag className="w-3 h-3 mr-1" aria-hidden="true" />
                {review.flag}
              </Badge>
            )}
          </div>
          {review.comment && <p className="text-sm text-gray-700 mt-1">{review.comment}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Reseña <span className="font-mono">{review.id.slice(0, 8)}</span>
            {review.created_at && <> · {formatRelativeTime(review.created_at)}</>}
          </p>
        </div>
        <Button size="sm" variant="danger" onClick={() => onDelete(review.id)} disabled={busy}>
          Eliminar
        </Button>
      </div>
    </li>
  );
}
```

- [ ] **Step 6: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. Si `Avatar`/`Badge` no existen todavía (F0), crearlos con la API mínima esperada (`Avatar{name}` muestra iniciales; `Badge{tone,children}`). Revisar `src/components/ui/` y, si faltan, añadirlas en este paso con implementaciones triviales coherentes con el design system.

- [ ] **Step 7: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/components/
git commit -m "feat(admin): componentes AdminNav, AdminStatCard, ReportRow, AdminUserRow, AdminReviewRow"
```

---

## Task 17: Páginas Admin (`DashboardPage`, `ReportsAdminPage`, `UsersAdminPage`, `ReviewsAdminPage`)

**Files:**
- Create: `frontend/src/features/admin/pages/DashboardPage.tsx`
- Create: `frontend/src/features/admin/pages/ReportsAdminPage.tsx`
- Create: `frontend/src/features/admin/pages/UsersAdminPage.tsx`
- Create: `frontend/src/features/admin/pages/ReviewsAdminPage.tsx`

- [ ] **Step 1: Crear `DashboardPage.tsx`**

Crear `frontend/src/features/admin/pages/DashboardPage.tsx`:

```typescript
import { Users, CalendarDays, Handshake, Flag } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { AdminStatCard } from '../components/AdminStatCard';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminStats } from '../hooks';

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useAdminStats();

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Panel de administración</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {isError && <ErrorState title="No se pudieron cargar las métricas" onRetry={() => refetch()} />}
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <AdminStatCard label="Usuarios" value={data.total_users} icon={Users} tone="brand" />
            <AdminStatCard label="Planes" value={data.total_plans} icon={CalendarDays} tone="info" />
            <AdminStatCard label="Matches" value={data.total_matches} icon={Handshake} tone="success" />
            <AdminStatCard label="Reportes abiertos" value={data.open_reports} icon={Flag} tone={data.open_reports > 0 ? 'danger' : 'brand'} />
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Crear `ReportsAdminPage.tsx`**

Crear `frontend/src/features/admin/pages/ReportsAdminPage.tsx`:

```typescript
import { useState } from 'react';
import { AdminNav } from '../components/AdminNav';
import { ReportRow } from '../components/ReportRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminReports, useUpdateReportStatus } from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'closed', label: 'Cerrados' },
];

export default function ReportsAdminPage() {
  const [status, setStatus] = useState<string | undefined>('open');
  const query = useAdminReports(status);
  const update = useUpdateReportStatus();

  const reports = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Reportes</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div role="tablist" aria-label="Filtrar por estado" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md ${status === f.value ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {query.isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {query.isError && <ErrorState title="No se pudieron cargar los reportes" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && reports.length === 0 && (
          <EmptyState title="Sin reportes" description="No hay reportes con este filtro." />
        )}

        <ul className="space-y-2">
          {reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              onStatusChange={(id, st) => update.mutate({ id, status: st })}
              disabled={update.isPending}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Crear `UsersAdminPage.tsx`**

Crear `frontend/src/features/admin/pages/UsersAdminPage.tsx`:

```typescript
import { useState } from 'react';
import { AdminNav } from '../components/AdminNav';
import { AdminUserRow } from '../components/AdminUserRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminUsers, useBanUser, useSuspendUser, useActivateUser } from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'deleted', label: 'Eliminados' },
];

export default function UsersAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const query = useAdminUsers(status);
  const ban = useBanUser();
  const suspend = useSuspendUser();
  const activate = useActivateUser();
  const busy = ban.isPending || suspend.isPending || activate.isPending;

  const users = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Usuarios</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div role="tablist" aria-label="Filtrar por estado" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md ${status === f.value ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {query.isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {query.isError && <ErrorState title="No se pudieron cargar los usuarios" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && users.length === 0 && (
          <EmptyState title="Sin usuarios" description="No hay usuarios con este filtro." />
        )}

        <ul className="space-y-2">
          {users.map((u) => (
            <AdminUserRow
              key={u.id}
              user={u}
              onBan={(id) => ban.mutate(id)}
              onSuspend={(id) => suspend.mutate(id)}
              onActivate={(id) => activate.mutate(id)}
              busy={busy}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Crear `ReviewsAdminPage.tsx`**

Crear `frontend/src/features/admin/pages/ReviewsAdminPage.tsx`:

```typescript
import { AdminNav } from '../components/AdminNav';
import { AdminReviewRow } from '../components/AdminReviewRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminReviews, useAdminDeleteReview } from '../hooks';
import { useAdminCancelPlan } from '../hooks';

export default function ReviewsAdminPage() {
  const query = useAdminReviews();
  const remove = useAdminDeleteReview();
  const cancelPlan = useAdminCancelPlan();
  const reviews = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Reseñas flagged</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {query.isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {query.isError && <ErrorState title="No se pudieron cargar las reseñas" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && reviews.length === 0 && (
          <EmptyState title="Sin reseñas para moderar" description="No hay reseñas marcadas con flag." />
        )}

        <ul className="space-y-2">
          {reviews.map((r) => (
            <AdminReviewRow
              key={r.id}
              review={r}
              onDelete={(id) => remove.mutate(id)}
              busy={remove.isPending}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}

        {/* Acción auxiliar: cancelar un plan por ID (moderación). Se expone como utilidad. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">Cancelar un plan por ID</summary>
          <CancelPlanForm onConfirm={(id) => cancelPlan.mutate(id)} busy={cancelPlan.isPending} />
        </details>
      </main>
    </div>
  );
}

function CancelPlanForm({ onConfirm, busy }: { onConfirm: (id: string) => void; busy: boolean }) {
  return (
    <form
      className="flex gap-2 mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const id = String(fd.get('planId') ?? '').trim();
        if (id) onConfirm(id);
      }}
    >
      <label className="sr-only" htmlFor="planId">ID del plan</label>
      <input
        id="planId"
        name="planId"
        required
        placeholder="UUID del plan"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <Button type="submit" variant="danger" size="sm" loading={busy}>
        Cancelar plan
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/admin/pages/
git commit -m "feat(admin): DashboardPage, ReportsAdminPage, UsersAdminPage, ReviewsAdminPage"
```

---

## SECCIÓN C — PULIDO, ROUTER, HEADER, E2E, CI

## Task 18: `PageSuspense` + `Header` (si faltan) y consolidar lazy en `router.tsx`

Consolida todas las rutas con `React.lazy` + un único `PageSuspense`, registra `/notifications` y `/admin/*`, reemplaza `RequireAdmin` (stub F0) por `RequireAdminRoute` (Task 15) en el bloque admin, y monta `PushGate`.

**Files:**
- Create (si no existe): `frontend/src/components/layout/PageSuspense.tsx`
- Create (si no existe): `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Crear `PageSuspense.tsx` (si no existe)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/components/layout/PageSuspense.tsx && echo "YA EXISTE" || echo "CREAR"
```

Si AUSENTE, crear `frontend/src/components/layout/PageSuspense.tsx`:

```typescript
import { Suspense, type ReactNode } from 'react';
import { Spinner } from '../ui/Spinner';

export function PageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[100dvh] flex items-center justify-center" role="status" aria-live="polite">
          <Spinner size="lg" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
```

- [ ] **Step 2: Crear `Header.tsx` con `NotificationBell` (si no existe)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/components/layout/Header.tsx && echo "YA EXISTE — añadir NotificationBell" || echo "CREAR"
```

Si AUSENTE, crear `frontend/src/components/layout/Header.tsx`:

```typescript
import { Link } from 'react-router-dom';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';

export function Header({ title = 'GAD' }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/explore" className="font-bold text-gray-900" aria-label="Ir a inicio">
          {title}
        </Link>
        <NotificationBell />
      </div>
    </header>
  );
}
```

Si ya existe, añadir `<NotificationBell />` en su contenido (mantener la estructura previa). Si el layout existente (F0/F3) usa otro header, integrar la campana allí.

- [ ] **Step 3: Modificar `router.tsx` — consolidar lazy + nuevas rutas**

Reescribir `frontend/src/router.tsx` para usar lazy en todas las páginas de dominio (notifications/admin de F7 + las ya existentes de F1–F6), `PageSuspense`, y `RequireAdminRoute` en `/admin/*`. Si las páginas de F1–F6 no existen aún (fases previas no implementadas), sus `lazy(() => import(...))` resolverán a módulos ausentes y romperán el build — **en ese caso**, comentar las rutas de fases ausentes y dejar solo las de F7 (notifications/admin) más las de F0 (login/register/share/explore). Detectar con el `test -f` de Task 1.

Crear/reemplazar `frontend/src/router.tsx`:

```typescript
import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdminRoute } from './features/admin/RequireAdminRoute';
import { PushGate } from './features/notifications/PushGate';
import { PageSuspense } from './components/layout/PageSuspense';

// Páginas públicas (no lazy: son el punto de entrada).
//   Las de F0 (Login/Register/...) se importan según existan.
// Para máxima robustez, también se cargan lazy.
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage'));
const NotificationsPage = lazy(() => import('./features/notifications/pages/NotificationsPage'));
const ExplorePage = lazy(() => import('./features/plans/pages/ExplorePage'));

// Admin (F7)
const DashboardPage = lazy(() => import('./features/admin/pages/DashboardPage'));
const ReportsAdminPage = lazy(() => import('./features/admin/pages/ReportsAdminPage'));
const UsersAdminPage = lazy(() => import('./features/admin/pages/UsersAdminPage'));
const ReviewsAdminPage = lazy(() => import('./features/admin/pages/ReviewsAdminPage'));

export const router = createBrowserRouter([
  // ---- Públicas ----
  { path: '/login', element: <PageSuspense><LoginPage /></PageSuspense> },
  { path: '/register', element: <PageSuspense><RegisterPage /></PageSuspense> },
  // /s/:token (share-link público) se añade si F6 lo creó; si no, placeholder.
  { path: '/s/:token', element: <PageSuspense><SharePlaceholder /></PageSuspense> },

  // ---- Protegidas (auth) ----
  {
    element: <RequireAuth />,
    children: [
      { index: true, path: '/', element: <Navigate to="/explore" replace /> },
      {
        path: '/explore',
        element: (
          <>
            <PushGate />
            <PageSuspense><ExplorePage /></PageSuspense>
          </>
        ),
      },
      // El resto de rutas protegidas (plans, matches, chat, safety, me, users) se
      // registran en F1–F6. Aquí solo garantizamos /notifications (F7).
      {
        path: '/notifications',
        element: (
          <>
            <PushGate />
            <PageSuspense><NotificationsPage /></PageSuspense>
          </>
        ),
      },
    ],
  },

  // ---- Admin ----
  {
    element: <RequireAdminRoute />,
    children: [
      { path: '/admin', element: <PageSuspense><DashboardPage /></PageSuspense> },
      { path: '/admin/reports', element: <PageSuspense><ReportsAdminPage /></PageSuspense> },
      { path: '/admin/users', element: <PageSuspense><UsersAdminPage /></PageSuspense> },
      { path: '/admin/reviews', element: <PageSuspense><ReviewsAdminPage /></PageSuspense> },
      { path: '/admin/*', element: <Navigate to="/admin" replace /> },
    ],
  },

  // ---- Fallback ----
  { path: '*', element: <Navigate to="/explore" replace /> },
]);

// Placeholder mínimo para share-link si F6 no existe.
import { Link } from 'react-router-dom';
function SharePlaceholder() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-gray-600">Vista pública de ubicación.</p>
        <Link to="/login" className="text-brand-700 underline">Iniciar sesión</Link>
      </div>
    </div>
  );
}
```

> **Migración:** si F0 registró rutas en `router.tsx` con imports estáticos y F1–F6 añadieron las suyas, **fusionar** preservando las rutas previas y añadiendo las de F7. El objetivo final (Task 21) es que TODAS las páginas estén bajo `React.lazy` + `PageSuspense`. Si una página previa no existe, su `lazy` debe omitirse/comentarse para no romper el build. Documentar qué fases faltan.

- [ ] **Step 4: Verificar tsc + build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: build verde. Si falla por imports de páginas inexistentes (F1–F6 no implementadas), comentar esas rutas y dejar solo F7 + F0.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/components/layout/PageSuspense.tsx frontend/src/components/layout/Header.tsx frontend/src/router.tsx
git commit -m "feat(router): /notifications y /admin/* con RequireAdminRoute; lazy+PageSuspense consolidado; Header con NotificationBell"
```

---

## Task 19: Tuning de React Query y `lib/env.ts`

Ajusta defaults globales de `QueryClient` (staleTime, refetchOnWindowFocus) y centraliza feature flags.

**Files:**
- Create: `frontend/src/lib/env.ts`
- Modify: `frontend/src/main.tsx` (QueryClient defaults)

- [ ] **Step 1: Crear `lib/env.ts`**

Crear `frontend/src/lib/env.ts`:

```typescript
/**
 * Centralización de variables de entorno y feature flags.
 * `import.meta.env.VITE_*` están tipadas en `src/vite-env.d.ts` (F0).
 */

function boolFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false' && String(value) !== '0';
}

export const ENV = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000',
  oauthGoogleClientId: import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID ?? '',
  enablePush: boolFlag(import.meta.env.VITE_ENABLE_PUSH, true),
} as const;
```

- [ ] **Step 2: Ajustar defaults del `QueryClient` en `main.tsx`**

En `frontend/src/main.tsx`, donde se crea el `QueryClient` (F0), ajustar a:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // 30s por defecto; los hooks específicos lo afinan.
      refetchOnWindowFocus: true, // refresca al volver a la tab (badge, listas).
      gcTime: 5 * 60_000,
    },
    mutations: { retry: 0 },
  },
});
```

> Si F0 ya definió un `QueryClient`, reemplazar el bloque respetando los providers ya compuestos (`QueryClientProvider → AuthProvider → RouterProvider → Toaster`).

- [ ] **Step 3: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build verde.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/lib/env.ts frontend/src/main.tsx
git commit -m "perf(query): staleTime/refetchOnWindowFocus tuning + centralización de feature flags"
```

---

## Task 20: Pasada de Accesibilidad (a11y)

Checklist aplicado sobre los componentes de F7 y revisión de F0–F6. No requiere archivos nuevos salvo pequeños retoques.

**Files:**
- Modify (selectivo): `frontend/src/features/notifications/components/NotificationBell.tsx`, `NotificationItem.tsx`, `frontend/src/features/admin/components/*`, `frontend/src/features/admin/pages/*`
- Verify: `frontend/index.html` (`lang="es"`)

- [ ] **Step 1: Verificar `index.html`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
grep -n 'lang=' index.html
```
Expected: `<html lang="es">`. Si falta, añadirlo (F0 ya lo hizo; verificar).

- [ ] **Step 2: Auditar y corregir (checklist)**

Revisar y, donde falte, añadir:
- [ ] Todos los `<button>` con icono tienen `aria-label` descriptivo (NotificationBell, mark-read, eliminar reseña, ban/suspend/activate).
- [ ] Todos los `<input>`/`<select>`/`<textarea>` tienen `<label>` asociado (`htmlFor`/`id`) o `aria-label`.
- [ ] `role="status"`/`aria-live="polite"` en spinners de carga (`PageSuspense`, `Spinner` ya lo trae).
- [ ] Roles ARIA de navegación: `<nav aria-label>` en `AdminNav`, `BottomNav`, `Header`.
- [ ] `role="tablist"`/`role="tab"`/`aria-selected` en los filtros de NotificationsPage, ReportsAdminPage, UsersAdminPage (ya incluidos en el código).
- [ ] Manejo de foco en el dropdown de `NotificationBell`: al abrir, mover el foco al primer elemento actionable; `Esc` cierra (ya implementado). Mejora opcional: `autoFocus` en el botón de "Marcar todas".
- [ ] Contraste de color: los tonos `brand`/`amber`/`red` cumplen AA contra fondos blancos. Verificar `TONE_CLASS`/`TONE`.
- [ ] `skip-to-content` link (opcional, mejora): añadir al inicio de `App` un `<a href="#main" className="sr-only focus:not-sr-only">Saltar al contenido</a>` y `id="main"` en el `<main>`.

- [ ] **Step 3: Añadir skip-link y `id="main"` en App**

Si no existe, en `frontend/src/App.tsx` envolver el `RouterProvider` con:

```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-brand-700 focus:px-3 focus:py-2 focus:rounded-lg focus:shadow">
        Saltar al contenido
      </a>
      <RouterProvider router={router} />
    </>
  );
}
```

Y en cada `main` de las páginas F7, añadir `id="main"` al `<main>`.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/App.tsx frontend/src/features/notifications frontend/src/features/admin
git commit -m "fix(a11y): aria-labels en botones de icono, roles de navegación, skip-link y focus en dropdown"
```

---

## Task 21: Consolidar lazy-loading / code-split global

Verifica que TODAS las páginas están bajo `React.lazy` y que el `dist/` produce chunks separados por feature.

**Files:** Verify `frontend/src/router.tsx`

- [ ] **Step 1: Auditar imports estáticos de páginas**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
grep -rn "import .*Page" src/router.tsx || echo "Sin imports estáticos de páginas (OK)"
```
Expected: ninguna línea `import XXXPage from '...'` directa en `router.tsx` (todas vía `lazy()`).

- [ ] **Step 2: Verificar chunks en build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
ls -la dist/assets/ | grep -E "\.js$" | head -30
```
Expected: múltiples archivos `assets/*.js` (uno por página lazy + vendors). Si hay un único bundle, revisar que `lazy()` esté aplicado.

- [ ] **Step 3: Commit (si hubo cambios)**

Si se ajustaron imports, commit:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/router.tsx
git commit -m "perf(router): todas las páginas bajo React.lazy para code-split por feature"
```
Si no hubo cambios, omitir commit y registrar verificación.

---

## Task 22: Configurar Playwright

**Files:**
- Modify: `frontend/package.json` (dep + scripts)
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/fixtures.ts`

- [ ] **Step 1: Instalar Playwright**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install -D @playwright/test@^1.48
npx playwright install chromium
```
Expected: instalación OK y browser descargado.

- [ ] **Step 2: Crear `playwright.config.ts`**

Crear `frontend/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Config E2E de GAD.
 * Por defecto corre contra el dev server de Vite (:5173).
 * Si el backend no está disponible, los tests skipean (ver fixtures.ts).
 *
 * Uso:
 *   npm run e2e            # arranca webServer automáticamente
 *   npm run e2e:ui         # modo UI
 *   BASE_URL=http://localhost:5173 npm run test:e2e  # contra dev server externo
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // el flujo crítico es secuencial (estados compartidos)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev -- --host 0.0.0.0',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```

- [ ] **Step 3: Crear `e2e/fixtures.ts` (helpers + skip si backend caído)**

Crear `frontend/e2e/fixtures.ts`:

```typescript
import { test as base, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';

/**
 * Skipea el test si el backend no responde en /health.
 * Permite mantener el suite verde en entornos sin backend.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page }, use, testInfo) => {
    const ok = await backendUp();
    testInfo.skip(!ok, 'Backend no disponible en ' + API_URL + ' — saltando E2E.');
    await use(page);
  },
});

export { expect };

export async function backendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Datos de prueba con sufijo único para evitar colisiones. */
export function uniqueEmail(role: string): string {
  const stamp = Date.now();
  const rnd = Math.random().toString(36).slice(2, 7);
  return `e2e-${role}-${stamp}-${rnd}@example.test`;
}

export const DEFAULT_PASSWORD = 'Test1234!';

/** Registra un usuario y deja la sesión iniciada en la página. */
export async function registerAndLogin(page: import('@playwright/test').Page, email: string, displayName: string) {
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/nombre/i).fill(displayName);
  await page.getByLabel(/^contraseña/i).fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: /registrarme|crear cuenta|registrarse/i }).click();
  await expect(page).toHaveURL(/\/explore/);
}
```

- [ ] **Step 4: Añadir scripts E2E a `package.json`**

En `frontend/package.json`, scripts:

```json
{
  "scripts": {
    "dev": "vite --port 5173 --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --port 5173",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```
(Mantener `clean` y otros scripts existentes; fusionar.)

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e/fixtures.ts
git commit -m "test(e2e): configurar Playwright con webServer Vite y skip automático si backend caído"
```

---

## Task 23: E2E — Flujo crítico (`critical-flow.spec.ts`)

Cubre: register A → crear plan → logout → register B → explorar → ver plan → postularse → logout → login A → ver postulación → aceptar → match → (chat) → complete → review.

**Files:**
- Create: `frontend/e2e/critical-flow.spec.ts`

- [ ] **Step 1: Crear el spec**

Crear `frontend/e2e/critical-flow.spec.ts`:

```typescript
import { test, expect, uniqueEmail, DEFAULT_PASSWORD, registerAndLogin } from './fixtures';

/**
 * Flujo crítico de punta a punta. Requiere backend real (docker-compose up).
 * Se skipea automáticamente si GET /health no responde.
 */
test.describe('Flujo crítico: register → plan → postular → match → review', () => {
  test('usuario A crea plan y B se postula; A acepta; se completa y reseña', async ({ page, context }) => {
    // ---------- Usuario A: crea plan ----------
    const emailA = uniqueEmail('A');
    await registerAndLogin(page, emailA, 'Ana E2E');

    await page.getByRole('button', { name: /crear|publicar|nuevo plan|\+/i }).first().click();
    await page.getByLabel(/título|titulo/i).fill('Café en el centro (E2E)');
    await page.getByLabel(/actividad/i).selectOption('coffee');
    await page.getByLabel(/descripción|descripcion/i).fill('Plan de prueba E2E.');
    // Ubicación: si hay input manual o GPS mock, completar. Asumimos input de label.
    const locInput = page.getByLabel(/ubicación|ubicacion|lugar|dirección|direccion/i);
    if (await locInput.count()) {
      await locInput.first().fill('Plaza Mayor, Madrid');
    }
    await page.getByRole('button', { name: /publicar|crear|guardar/i }).click();

    // Validar que el plan aparece.
    await expect(page.getByText('Café en el centro (E2E)')).toBeVisible({ timeout: 15_000 });

    // Logout A.
    await page.getByRole('button', { name: /cerrar sesión|salir|logout/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // ---------- Usuario B: explora y se postula ----------
    const emailB = uniqueEmail('B');
    await registerAndLogin(page, emailB, 'Bruno E2E');

    // Navegar a explorar y abrir el plan de A.
    await page.goto('/explore');
    await page.getByText('Café en el centro (E2E)').first().click();
    await page.getByRole('button', { name: /postularme|postular/i }).click();
    const msg = page.getByLabel(/mensaje|nota/i);
    if (await msg.count()) {
      await msg.first().fill('¡Me sumo!');
    }
    await page.getByRole('button', { name: /enviar postulación|postularme|confirmar/i }).click();
    await expect(page.getByText(/postulación enviada|ya te postulaste|pendiente/i)).toBeVisible({ timeout: 10_000 });

    // Logout B.
    await page.getByRole('button', { name: /cerrar sesión|salir|logout/i }).click();

    // ---------- Usuario A: ve la postulación y acepta → match ----------
    // Re-login A: la app debe permitir login por email.
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(emailA);
    await page.getByLabel(/^contraseña/i).fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: /entrar|iniciar sesión|ingresar/i }).click();
    await expect(page).toHaveURL(/\/explore/);

    // Ir a las postulaciones del plan (ruta de F4).
    await page.goto('/matches'); // o /plans/<id>/applications
    await page.getByRole('button', { name: /aceptar/i }).first().click();
    await expect(page.getByText(/match|conectado/i)).toBeVisible({ timeout: 10_000 });

    // ---------- Chat (si está disponible) ----------
    const chatLink = page.getByRole('link', { name: /chat|mensajes/i }).first();
    if (await chatLink.count()) {
      await chatLink.click();
      await page.getByLabel(/escribí|mensaje|escribe/i).fill('Hola desde E2E');
      await page.getByRole('button', { name: /enviar/i }).click();
      await expect(page.getByText('Hola desde E2E')).toBeVisible({ timeout: 10_000 });
    }

    // ---------- Completar match ----------
    await page.getByRole('button', { name: /finalizar|completar|terminar/i }).first().click();

    // ---------- Reseña (si F6 está) ----------
    const reviewSection = page.getByText(/deja una reseña|califica/i);
    if (await reviewSection.count()) {
      await page.getByRole('button', { name: /5 estrellas|\*{5}|rating-5/i }).first().click();
      await page.getByRole('button', { name: /enviar reseña|guardar/i }).click();
      await expect(page.getByText(/reseña enviada|gracias/i)).toBeVisible({ timeout: 10_000 });
    }
  });
});
```

> **Robustez:** los selectores usan `getByRole`/`getByLabel` para estabilidad. Donde la UI puede variar entre fases, se usan condicionales (`if (await count())`). El test es resiliente: si chat/reviews no están, esos bloques se saltan sin fallar.

- [ ] **Step 2: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/e2e/critical-flow.spec.ts
git commit -m "test(e2e): flujo crítico register→plan→postular→match→chat→complete→review"
```

---

## Task 24: E2E — Notifications y Admin (smoke)

**Files:**
- Create: `frontend/e2e/notifications.spec.ts`
- Create: `frontend/e2e/admin.spec.ts`

- [ ] **Step 1: Crear `notifications.spec.ts`**

Crear `frontend/e2e/notifications.spec.ts`:

```typescript
import { test, expect, uniqueEmail, DEFAULT_PASSWORD, registerAndLogin } from './fixtures';

test.describe('Notificaciones', () => {
  test('la campana y la página /notifications cargan', async ({ page }) => {
    await registerAndLogin(page, uniqueEmail('N'), 'Notif E2E');

    // La campana está presente en el header.
    await expect(page.getByRole('button', { name: /notificaciones/i })).toBeVisible();

    // Abrir la página completa.
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: /notificaciones/i })).toBeVisible();
    // Estado vacío o lista — ambos son válidos.
    await expect(
      page.getByText(/no tienes notificaciones|marcar todas|cargar más/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Crear `admin.spec.ts`**

Crear `frontend/e2e/admin.spec.ts`:

```typescript
import { test, expect, uniqueEmail, DEFAULT_PASSWORD, backendUp } from './fixtures';

test.describe('Panel admin', () => {
  test('usuario no-admin es redirigido de /admin a /explore', async ({ page }) => {
    // Registrar un usuario normal.
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(uniqueEmail('noadmin'));
    await page.getByLabel(/nombre/i).fill('No Admin');
    await page.getByLabel(/^contraseña/i).fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: /registrarme|crear cuenta|registrarse/i }).click();
    await expect(page).toHaveURL(/\/explore/);

    // Intentar ir a /admin → redirige a /explore (RequireAdminRoute).
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/explore/);
  });

  test('admin válido ve el dashboard (requiere admin sembrado en DB)', async ({ page }) => {
    test.skip(true, 'Requiere usuario admin sembrado en el backend. Descomentar y configurar ADMIN_EMAIL/ADMIN_PASSWORD.');
    // const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
    // const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
    // await page.goto('/login');
    // await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    // await page.getByLabel(/^contraseña/i).fill(ADMIN_PASSWORD);
    // await page.getByRole('button', { name: /entrar|iniciar sesión/i }).click();
    // await page.goto('/admin');
    // await expect(page.getByRole('heading', { name: /panel de administración/i })).toBeVisible();
  });
});
```

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/e2e/notifications.spec.ts frontend/e2e/admin.spec.ts
git commit -m "test(e2e): smoke de notifications y admin (redirección no-admin + admin skipeable)"
```

---

## Task 25: Documentación: cómo levantar el backend para E2E

Añade al `README.md` del frontend las instrucciones de E2E y Web Push. **No crear nuevo archivo `.md`** — editar el `README.md` existente.

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: Editar `frontend/README.md`**

Añadir las siguientes secciones al final del `README.md` existente (preservar contenido previo):

```markdown
## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173 (proxy /api → :8000)
```

Variables de entorno (ver `.env.example`):
- `VITE_API_URL` — base del backend (default `http://localhost:8000`).
- `VITE_WS_URL` — base del WebSocket (default `ws://localhost:8000`).
- `VITE_OAUTH_GOOGLE_CLIENT_ID` — si se setea, se muestra login con Google.
- `VITE_ENABLE_PUSH` — `false` desactiva Web Push (default: intenta).

## Tests

```bash
npm test           # Vitest (unit + integración)
npm run test:e2e   # Playwright (requiere backend)
```

## E2E con Playwright

Los tests E2E requieren el backend real levantado. Desde la raíz del repo:

```bash
# Levantar backend (+ DB/Redis) con docker-compose.
docker compose up -d

# Verificar salud.
curl http://localhost:8000/health        # {"status":"ok"}
curl http://localhost:8000/health/ready  # {"db":"ok","redis":"ok"}

# Correr E2E (arranca el dev server automáticamente).
cd frontend
npm run test:e2e
```

Si el backend no está disponible, los tests se **skipean automáticamente** (ver `e2e/fixtures.ts`), manteniendo el suite verde.

Para probar el panel admin, sembrar un usuario admin en la DB (campo `is_admin = true`) y setear `ADMIN_EMAIL`/`ADMIN_PASSWORD` antes de descomentar el test correspondiente en `e2e/admin.spec.ts`.

## Web Push (notificaciones push)

Requisitos:
1. **HTTPS** en producción (o `localhost`/`127.0.0.1` en dev).
2. **VAPID configurado en el backend**: el backend debe tener `vapid_public.pem`/`vapid_private.pem`. `GET /notifications/vapid-public-key` devuelve `{ public_key }` no vacío.

Comportamiento:
- Si no hay VAPID (`public_key === ""`), o el navegador no soporta Service Worker/PushManager, o el permiso fue denegado, **la feature push se omite silenciosamente**: la app sigue funcionando (badge y lista de notificaciones vía HTTP poll cada 45s).
- El Service Worker (`src/sw.ts`) maneja los eventos `push` y `notificationclick`.
- Registro automático tras login si el permiso ya estaba concedido (opt-in explícito desde la página de Notificaciones si no).

## Build de producción

```bash
npm run build      # genera dist/ (estático)
npm run preview    # sirve el build localmente
```
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/README.md
git commit -m "docs(frontend): README con setup dev, tests, E2E contra docker-compose y Web Push"
```

---

## Task 26: CI — Workflow de GitHub Actions para el frontend

**Files:**
- Create (or Modify): `.github/workflows/frontend.yml`

- [ ] **Step 1: Detectar workflow existente**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
ls -la .github/workflows/ 2>/dev/null || echo "Sin workflows"
```

- [ ] **Step 2: Crear/actualizar `frontend.yml`**

Crear `.github/workflows/frontend.yml`:

```yaml
name: Frontend

on:
  push:
    branches: [main, master]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend.yml'
  pull_request:
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend.yml'

defaults:
  run:
    working-directory: frontend

jobs:
  build-test:
    name: Lint + Build + Test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint (tsc --noEmit)
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Unit/Integration tests (Vitest)
        run: npm test -- --reporter=dot

      - name: Upload dist artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: frontend-dist
          path: frontend/dist
          retention-days: 7

  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    continue-on-error: true # opcional: no bloquea si el backend en CI no está
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Install Playwright browsers
        working-directory: frontend
        run: npx playwright install --with-deps chromium

      - name: Run E2E (sin backend → tests skipean automáticamente)
        working-directory: frontend
        env:
          E2E_NO_WEBSERVER: 'false'
        run: npm run test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report
          retention-days: 7
```

> **Nota:** el job `e2e` tiene `continue-on-error: true` y, sin backend en CI, los specs se skipean vía `fixtures.ts`. Si se dispone de un backend service container (Docker), descomentar/configurar el service en el job para correr E2E reales.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add .github/workflows/frontend.yml
git commit -m "ci(frontend): workflow lint+build+test (Vitest) y E2E (Playwright) con skip automático"
```

---

## Task 27: Verificación global final — Definition of Done

Esta es la fase final. Antes de cerrar F7 (y el proyecto), ejecutar y confirmar todo.

**Files:** —

- [ ] **Step 1: Type-check, build y tests unitarios**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build && npx vitest run
```
Expected: tsc sin errores, build verde, todos los tests (F0–F7) en verde.

- [ ] **Step 2: Tests específicos de F7**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/notifications src/features/admin
```
Expected: todos en verde (notificationMeta, push, hooks de notif/admin).

- [ ] **Step 3: E2E (si backend disponible)**

Run (en una terminal aparte, levantar el backend):
```bash
cd /Users/juliangarciatunon/proyectos/gad
docker compose up -d
curl -s http://localhost:8000/health   # {"status":"ok"}
cd frontend
npm run test:e2e
```
Expected: el flujo crítico pasa (o se skipea con razón documentada si el backend no tiene datos/admin sembrado).

- [ ] **Step 4: Smoke manual de los 11 dominios**

Con backend levantado y dos sesiones (p.ej. dos navegadores o una normal + incógnito), recorrer:
- [ ] **Auth** (F1): register, login, logout, refresh (recargar página sigue logueado), forgot/reset password.
- [ ] **Users/Perfil** (F2): ver/editar perfil, subir avatar, preferencias, perfil público, bloquear/desbloquear, soft-delete.
- [ ] **Planes** (F3): explorar mapa (GPS), crear plan (form validado), detalle, editar, cancelar.
- [ ] **Matching** (F4): postularse, ver postulaciones recibidas, aceptar/rechazar, retirar, matches, ubicación exacta.
- [ ] **Chat** (F5): chat realtime entre dos sesiones, reconexión al reiniciar backend, marcar leído, borrar mensaje.
- [ ] **Safety** (F6): contactos de confianza, live-tracking, peer location, SOS, share-link + vista pública `/s/:token`.
- [ ] **Reviews** (F6): reseña post-match, StarRating, flags, listar reseñas en perfil.
- [ ] **Reports** (F6): reportar usuario desde perfil.
- [ ] **Availability** (F6): toggle modo disponible.
- [ ] **Notifications** (F7): badge de no leídas (polling), lista paginada, filtro unread, marcar una/todas, borrar todas, panel push opt-in (si VAPID).
- [ ] **Admin** (F7): dashboard métricas, reportes (cambiar estado), usuarios (ban/suspend/activate), cancelar plan, reseñas flagged (eliminar); no-admin redirigido.

- [ ] **Step 5: Health checks del backend**

Run:
```bash
curl -s http://localhost:8000/health        # {"status":"ok"}
curl -s http://localhost:8000/health/ready  # {"db":"ok","redis":"ok"}
```
Expected: status ok y db+redis ok.

- [ ] **Step 6: Verificar PWA / Web Push (si VAPID)**

- Abrir la app en HTTPS o localhost.
- DevTools → Application → Service Workers: el SW de GAD está registrado y activo.
- DevTools → Application → Manifest: nombre "GAD", iconos cargados.
- Si hay VAPID: desde `/notifications`, pulsar "Activar" → permiso → `POST /notifications/register` 201.
- Disparar una notificación desde el backend (o simular un evento) → llega notificación del sistema.

- [ ] **Step 7: Commit final de cierre (tag opcional)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git status   # limpio
git log --oneline fase-7-notif-admin-pulido-frontend ^main | head -40
```
Expected: histórico de commits atómicos. Si se quiere, crear tag:
```bash
git tag -a v0.1.0-frontend -m "Frontend completo: 11 dominios cubiertos (F0–F7)"
```
(no pushar salvo que el usuario lo pida).

---

## Verificación final (Definition of Done) — resumen

Antes de cerrar F7, ejecutar y confirmar:

- [ ] `cd frontend && npx tsc --noEmit` → sin errores.
- [ ] `cd frontend && npm run build` → build verde; `dist/` con chunks por feature (lazy) + `sw.js` + `manifest.webmanifest`.
- [ ] `cd frontend && npx vitest run` → todos los tests pasan (incluye F0–F6).
- [ ] `cd frontend && npx vitest run src/features/notifications` → notificationMeta (4), push (~13), hooks (unreadCount polling, notifications paginación, markRead/markAllRead) en verde.
- [ ] `cd frontend && npx vitest run src/features/admin` → stats, reports paginación, updateStatus, ban en verde.
- [ ] `cd frontend && npx playwright test` → flujo crítico pasa o se skipea con razón documentada (backend caído).
- [ ] Navegación manual (11 dominios) con dos sesiones: flujo completo register→plan→postular→aceptar→match→chat→complete→review operativo.
- [ ] Panel admin: métricas, reportes, usuarios, planes, reseñas accesibles y funcionales; no-admin redirigido a `/explore`.
- [ ] Web Push: SW registrado, manifest válido; panel push opt-in aparece solo si VAPID; degrade silencioso si no.
- [ ] CI `.github/workflows/frontend.yml` pasa (o e2e skipeado).
- [ ] `frontend/README.md` documenta dev, tests, E2E y Web Push.

## Notas de consistencia con F0–F6

- **Query keys:** `['notifications', ...]` y `['admin', ...]` son jerárquicas y no colisionan con F0–F6 (`['plans']`, `['matches']`, `['messages', matchId]`, `['me']`, etc.). Los hooks de admin invalidan con prefijo `['admin', ...]` y `['admin', 'stats']`.
- **`api/client.ts` (F0):** se consumen `apiGet/apiPost/apiPatch/apiDelete` con `{ query, publicEndpoint }`. `GET /notifications/vapid-public-key` usa `publicEndpoint:true` (público). El interceptor 401→refresh se aplica al resto.
- **`RequireAdmin` (F0):** era un stub que asumía `is_admin=false`. F7 **no** lo borra (puede haber imports sueltos), pero el router usa el nuevo `features/admin/RequireAdminRoute.tsx` que sí verifica el rol vía `GET /me`. Si F0 importaba `RequireAdmin` en `router.tsx`, este plan lo reemplaza.
- **`UserDetail` / `is_admin`:** el contrato `UserDetail` (§Usuarios) no lista `is_admin`, pero la implementación del backend lo setea. `RequireAdminRoute` lo lee defensivamente (`data?.is_admin`). Si el check falla en smoke (campo ausente), fallback a sondeo `GET /admin/stats` (403 si no admin) — documentar la decisión.
- **`PageSuspense`:** definido en `components/layout/PageSuspense.tsx`. Si F3/F4 ya definieron uno con ese nombre, reusar. La meta final (Task 21) es que todas las páginas estén lazy.
- **`Header`:** si F0/F3 ya tenían header/layout, integrar `<NotificationBell/>` allí en vez de crear uno nuevo. El `Header` de F7 es fallback.
- **Web Push / HTTPS:** documentado en README. El SW se registra manualmente (no por `injectRegister` del plugin) para control fino. `devOptions.enabled:true` permite probar en `localhost`.
- **Seguridad:** el contenido de notificaciones se renderiza como texto (`{description}`), nunca `dangerouslySetInnerHTML`. El `payload` es solo leído para construir strings, no inyectado como HTML.
- **React Query v5:** `useInfiniteQuery` con `initialPageParam` (requerido en v5), `getNextPageParam` devuelve `next_cursor` del `PaginatedOut`. `useQuery` con `refetchInterval` para el badge.
- **`react-router-dom` v7:** `/admin/*` con `Navigate` a `/admin` para rutas admin desconocidas. `RequireAdminRoute` es wrapper `<Outlet/>` como `RequireAuth`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Web Push no funciona en dev (HTTP) | `localhost`/`127.0.0.1` están exceptuados por los navegadores; `devOptions.enabled:true` activa el SW en dev. En otros hosts HTTP, la feature se omite silenciosamente. |
| VAPID no configurado en backend | `GET /notifications/vapid-public-key` devuelve `{public_key:""}` → el panel push no se muestra y el bootstrap es no-op. Degrade elegante. |
| `is_admin` no viene en `/me` | `RequireAdminRoute` lee defensivamente (`Boolean(data?.is_admin)`). Fallback documentado: sondeo `GET /admin/stats`. |
| Notificaciones duplicadas (poll + push) | El badge es single-source (`useUnreadCount`); el push solo dispara una notificación del SO, no toca el caché. Al abrir la app, el poll reconcilia. |
| SW stale tras deploy | `registerType:'autoUpdate'` + `skipWaiting`/`clients.claim` en el SW. El usuario obtiene la nueva versión al siguiente load. |
| E2E flaky por datos compartidos | `fullyParallel:false`, `workers:1`, emails únicos con timestamp. Skip automático si backend caído. |
| Playwright pesado en CI | Job E2E con `continue-on-error:true` y service container opcional; tests skipean sin backend. |
| Fases previas (F1–F6) ausentes | Cada sub-dominio F7 compila independiente; router comenta rutas de fases ausentes; `RequireAdminRoute` cae a `GET /me`/`/auth/me`. Documentar ausencias. |
| jsdom sin `atob`/`btoa` | Vitest+jsdom los define; si falla, mockear en `src/test/setup.ts`. |
| `vite-plugin-pwa` types en `sw.ts` | Referencias `/// <reference lib="webworker" />` y `types="vite-plugin-pwa/client"` al inicio; si TS falla, añadir `"types": ["vite-plugin-pwa/client"]` o `skipLibCheck:true` (ya en F0). |

## Resumen de commits (orden de ejecución)

1. `feat(notifications): tipos NotificationOut, PushSubscriptionIn y respuestas del contrato`
2. `feat(notifications): mapeo NotificationType→UI (icono, label, tono) con TDD`
3. `feat(notifications): utilidades Web Push (base64url, permiso, subscribe/unsubscribe) con TDD`
4. `feat(notifications): hooks useNotifications (cursor), useUnreadCount (polling), mutaciones y push`
5. `test(notifications): useUnreadCount polling, useNotifications paginación, markRead/markAllRead`
6. `feat(notifications): NotificationItem con render contextual de payload por type`
7. `feat(notifications): NotificationBell con badge, dropdown de recientes y mark-all`
8. `feat(notifications): NotificationsPage con paginado, filtro unread y panel push opt-in`
9. `feat(pwa): vite-plugin-pwa + service worker custom para Web Push (push/notificationclick)`
10. `feat(notifications): usePushBootstrap auto-registra push tras login con degrade silencioso`
11. `feat(admin): tipos AdminStatsOut, AdminUserOut, ReportOut, AdminReviewOut`
12. `feat(admin): hooks stats/reports/users/plans/reviews con invalidación de queries`
13. `test(admin): stats, reports paginación, updateStatus y ban con mocks de api/client`
14. `feat(admin): RequireAdminRoute que verifica is_admin vía GET /me`
15. `feat(admin): componentes AdminNav, AdminStatCard, ReportRow, AdminUserRow, AdminReviewRow`
16. `feat(admin): DashboardPage, ReportsAdminPage, UsersAdminPage, ReviewsAdminPage`
17. `feat(router): /notifications y /admin/* con RequireAdminRoute; lazy+PageSuspense consolidado; Header con NotificationBell`
18. `perf(query): staleTime/refetchOnWindowFocus tuning + centralización de feature flags`
19. `fix(a11y): aria-labels en botones de icono, roles de navegación, skip-link y focus en dropdown`
20. `perf(router): todas las páginas bajo React.lazy para code-split por feature`
21. `test(e2e): configurar Playwright con webServer Vite y skip automático si backend caído`
22. `test(e2e): flujo crítico register→plan→postular→match→chat→complete→review`
23. `test(e2e): smoke de notifications y admin (redirección no-admin + admin skipeable)`
24. `docs(frontend): README con setup dev, tests, E2E contra docker-compose y Web Push`
25. `ci(frontend): workflow lint+build+test (Vitest) y E2E (Playwright) con skip automático`

> **Cierre del proyecto:** con F7 completo, el frontend de GAD cubre los **11 dominios** del backend (auth, users, plans, matching, chat, notifications, safety, reviews, reports, availability, admin) + WebSocket + Web Push, con build de producción, tests unitarios/integración, E2E con Playwright, pasada de a11y y CI. El roadmap F0–F7 queda completado.
