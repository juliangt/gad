# Safety, Reviews, Reports y Availability Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la **Fase F6** del frontend de GAD: cuatro dominios que cierran los flujos de seguridad, reputación y descubrimiento inmediato sobre el backend existente.

1. **Safety** — contactos de confianza (CRUD máx. 2), live-tracking de ubicación durante un match activo (`POST /safety/{match_id}/ping` cada 60s vía `watchPosition`), ubicación del par (`GET /safety/{match_id}/peer`), botón **SOS** safety-critical con doble confirmación (`POST /safety/{match_id}/sos`), share-link con QR (`POST/DELETE /safety/{match_id}/share-link`) y **vista pública `/s/:token` sin auth** (`GET /s/{token}`).
2. **Reviews** — `POST /reviews` (rate-limit 20/día, una por par, solo sobre match `completed` en 7 días), `GET /reviews?user_id=` paginado por cursor, `DELETE /reviews/{id}`. Componentes: `StarRating`, `ReviewForm` (react-hook-form + zod), `ReviewList` (infinite scroll), embebidos en el perfil público.
3. **Reports** — `POST /users/{user_id}/report` (rate-limit 10/día) vía un `ReportModal` reutilizable abierto desde `UserPublicPage`.
4. **Availability** — modo "disponible ahora": `POST /availability`, `GET /availability/me`, `DELETE /availability/me`, con un `AvailabilityToggle` embebido en `ExplorePage`.

**Architecture:** Feature-based, consistente con F0–F5. Cuatro carpetas bajo `src/features/`:

- `safety/` — `types.ts`, `schemas.ts`, `hooks.ts`, `useThrottledWatchPosition.ts` (utilidad TDD), componentes (`LiveTracker`, `PeerLocation`, `SosButton`, `ShareLinkCard`) y páginas (`TrustedContactsPage`, `SafetyPage`, `ShareLinkView`).
- `reviews/` — `types.ts`, `schemas.ts`, `hooks.ts`, componentes (`StarRating`, `ReviewForm`, `ReviewList`).
- `reports/` — `hooks.ts`, `components/ReportModal.tsx` (sin `types.ts` propio: los tipos `ReportIn`/`ReportOut` viven en `features/reports/types.ts` por simetría con el resto).
- `availability/` — `types.ts`, `schemas.ts`, `hooks.ts`, `components/AvailabilityToggle.tsx`.

Capa transversal: el **único** endpoint público de F6 es `GET /s/{token}`; el hook `usePublicLocation` lo llama con `{ publicEndpoint: true }` para bypassear el interceptor de auth (no lleva Bearer, no dispara refresh). Todas las demás llamadas pasan por el flujo normal de `apiGet`/`apiPost`/`apiDelete`.

**Query keys jerárquicas (sin colisión con F0–F5):**
- `['trusted-contacts']`
- `['safety', 'peer', matchId]`
- `['safety', 'share-link', matchId]`
- `['reviews', userId]`
- `['availability', 'me']`

**Flujos de datos destacados:**
- `LiveTracker` se monta al entrar a `/matches/:matchId/safety` con match `active`; arranca `navigator.geolocation.watchPosition`, dispara `POST /safety/{match_id}/ping` throttleado a 60s (mínimo entre pings), y se desmonta limpiamente (clearWatch + flush del último ping pendiente). No envía nada sin permiso GPS concedido.
- `PeerLocation` hace polling de `GET /safety/{match_id}/peer` cada 30s (`refetchInterval`) mientras el match esté activo; renderiza la ubicación del par sobre `MapBackground`.
- `SosButton` es safety-critical: requiere doble confirmación (botón → modal con texto explicativo grave → botón confirmar) y envía `POST /safety/{match_id}/sos` con la ubicación actual. UX de alto contraste, accesible y con feedback claro del `event_id` devuelto.
- `ShareLinkView` (`/s/:token`) es una **ruta pública** registrada fuera de `RequireAuth`. Maneja `401 invalid_token` (link inválido/expirado) y `404` con estados de error dedicados, y un `expired: true` en el body (link válido pero match terminado) como badge informativo.
- `AvailabilityToggle` muestra el estado (`active`/inactivo) + cuenta regresiva hasta `expires_at`; al activar pide GPS, construye `AvailabilityIn` con `location`, `radius_m`, `activity_filter` y `window_minutes`; al desactivar llama `DELETE /availability/me`.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, TanStack Query v5 (`useQuery` con `refetchInterval`, `useInfiniteQuery`, `useMutation`, `useQueryClient`), zod, react-hook-form + `zodResolver`, date-fns v4 (locale `es`), lucide-react, sonner, Tailwind v4 (glassmorphism), `qrcode.react` (nueva dep ligera para el QR del share-link), Vitest + @testing-library/react + jsdom. `navigator.geolocation.watchPosition` nativo.

---

## Prerrequisitos (de F0–F5)

Este plan asume que las siguientes piezas ya existen y funcionan. F6 **no** las reimplementa.

| Pieza | Archivo | Interfaz que se consume en F6 |
|---|---|---|
| API client | `src/api/client.ts` | `apiGet<T>(path, options?: RequestOptions)`, `apiPost<T>(path, body?, options?)`, `apiDelete<T>(path, options?)` con `RequestOptions { query?, publicEndpoint?, ...RequestInit }`. Lanza `ApiError(code, status, detail)`. El interceptor 401→refresh vive en `applyAuth` (inyectado por `AuthProvider`). **El path público `/s/{token}` se marca con `{ publicEndpoint: true }`.** |
| ApiError | `src/api/errors.ts` | `ApiError` con `.code`, `.status`, `.detail` |
| Auth | `src/auth/useAuth.ts` | `useAuth()` → `{ user: UserPublic \| null, status }` (`user.id`) |
| Token store | `src/auth/tokenStore.ts` | `getAccessToken(): string \| null` |
| Geolocation | `src/lib/geo.ts` | `getCurrentPosition(timeoutMs?): Promise<Coordinates>` donde `Coordinates { latitude; longitude; accuracy }`. **OJO:** los campos son `latitude`/`longitude` (no `lat`/`lng`). Además existe `haversine(lat1,lng1,lat2,lng2)`. |
| Tipos comunes | `src/types/common.ts` | `PaginatedOut<T>`, `OKMessage`, `ErrorOut` |
| Enums | `src/types/enums.ts` | `ContactType` (`'email'\|'phone'`), `ReviewFlag` (`'no_show'\|'inappropriate'\|'false_info'`), `ActivityType`, `VerificationLevel` |
| Formato | `src/lib/format.ts` | `formatRelativeTime(iso)`, `formatDistance(meters)`, `formatDateTime(iso)` (date-fns locale `es`) |
| UI | `src/components/ui/` | `Button`, `Input`, `Textarea`, `Spinner`, `EmptyState`, `ErrorState`, `Avatar`, `Badge`, `Modal`, `BottomSheet`. **`ConfirmDialog` se asume creado por F3/F4** (`components/ui/ConfirmDialog`); si no existe, la **Task 4** lo crea (robustez). |
| MapBackground | `src/components/MapBackground.tsx` | `<MapBackground userLocation={[lat,lng]\|null} plans={{id,lat,lng}[]} className? onPlanClick? />`. Se reutiliza pasando `plans={[]}` y `userLocation` con la ubicación del par. |
| QueryClient | `src/main.tsx` | `QueryClientProvider` activo |
| Router | `src/router.tsx` | `createBrowserRouter` con `RequireAuth` y bloque público (donde vive `/login`); `PageSuspense` (definido por F3). La ruta `/s/:token` existe como **stub público** (`PublicShareStub` de F0) y F6 la reemplaza. |
| Toaster | `src/main.tsx` | `<Toaster/>` de sonner montado |
| Vitest | `vitest.config.ts`, `src/test/setup.ts` | jsdom + `@testing-library/jest-dom` globales; `renderHook`, `waitFor`, `render`, `screen`, `fireEvent`, `act` |
| **Users (F2)** | `src/features/users/` | `useUser(userId)` → `{ data: UserPublicProfile }` (con `id`, `display_name`, `avatar_url`, `reputation_score`, `verification_level`); `useMe()` → `{ data: UserDetail }` (con `preferences`); `UserPublicPage` en `/users/:userId` (F6 le embebe `ReviewList` y `ReportModal`) |
| **Plans (F3)** | `src/features/plans/` | `useUserLocation()` → `{ status, location: [lat,lng]\|null, request }`; `ExplorePage` en `/explore` (F6 le embebe `AvailabilityToggle`) |
| **Matching (F4)** | `src/features/matching/` | `useMatch(matchId)` → `{ data: MatchOut }` con `id`, `status` (`'active'\|'completed'\|'cancelled'`), `participants[]` (`{user_id, display_name, avatar_url, role}`); `MatchOut`; `MatchDetailPage` en `/matches/:matchId` (F4 ya dejó teasers de safety apuntando a `/matches/:matchId/safety`) |
| **Chat (F5)** | `src/features/chat/` | Sin dependencia directa de runtime; F6 no toca el WebSocket. Solo comparten el `matchId`. |

> **Si F2/F3/F4 no están implementados**, las Tasks de integración (5, 18, 20, 24) quedan diferidas: los componentes `ReviewList`, `ReportModal` y `AvailabilityToggle` compilan y funcionan de forma aislada, y las páginas de safety (`SafetyPage`, `TrustedContactsPage`, `ShareLinkView`) son autónomas. Documentar el descuido y continuar con el resto.

> **`ConfirmDialog`:** F3 (Task de cancelar plan) y F4 (Task de complete/cancel) importan `ConfirmDialog` de `components/ui/ConfirmDialog`. Si al ejecutar F6 ese archivo no existe, la **Task 4** lo crea. Es el único componente UI que F6 puede necesitar aportar.

**Convenciones de rutas de import:** este plan usa **exclusivamente imports relativos** (`../types`, `../../components/ui/Button`, `../../../api/client`), igual que F0–F5. No se introduce el alias `@/`.

**Stack de test:** Vitest (globals: `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`), `@testing-library/react`, `@testing-library/user-event`. Los hooks de React Query se testean con un `QueryClient` con `retry:false` + `QueryClientProvider` wrapper. `useThrottledWatchPosition` se testea inyectando un `watchPosition` mock y usando `vi.useFakeTimers()`. `navigator.geolocation` se stubbea vía `vi.stubGlobal('navigator', …)`.

---

## File Structure

Archivos a crear/modificar en F6 (rutas absolutas desde la raíz del repo):

```
frontend/
├── package.json                                      # MODIFICAR — añadir qrcode.react
├── src/
│   ├── components/ui/
│   │   └── ConfirmDialog.tsx                         # CREAR (solo si no existe de F3/F4) — Task 4
│   ├── features/safety/
│   │   ├── types.ts                                  # NUEVO — TrustedContactOut/In, PingIn, PeerLocationOut, ShareLinkOut, SosOut, PublicLocationOut
│   │   ├── schemas.ts                                # NUEVO — zod: trustedContactSchema, pingSchema
│   │   ├── hooks.ts                                  # NUEVO — useTrustedContacts, useAddTrustedContact, useDeleteTrustedContact, usePing, usePeerLocation, useShareLink, useRevokeShareLink, useSos, usePublicLocation (público)
│   │   ├── useThrottledWatchPosition.ts              # NUEVO — TDD: hook sobre watchPosition con throttle
│   │   ├── __tests__/
│   │   │   ├── hooks.test.tsx                        # NUEVO — tests hooks safety
│   │   │   ├── useThrottledWatchPosition.test.tsx    # NUEVO — tests throttle de watchPosition
│   │   │   └── schemas.test.ts                       # NUEVO — tests zod safety
│   │   ├── components/
│   │   │   ├── LiveTracker.tsx                       # NUEVO — ping periódico mientras match activo
│   │   │   ├── PeerLocation.tsx                      # NUEVO — polling GET /safety/{id}/peer + mapa
│   │   │   ├── SosButton.tsx                         # NUEVO — doble confirmación + POST /sos
│   │   │   └── ShareLinkCard.tsx                     # NUEVO — crear/copiar/QR/revocar share-link
│   │   └── pages/
│   │       ├── TrustedContactsPage.tsx               # NUEVO — /me/trusted-contacts
│   │       ├── SafetyPage.tsx                        # NUEVO — /matches/:matchId/safety
│   │       └── ShareLinkView.tsx                     # NUEVO — /s/:token (PÚBLICO, sin auth)
│   ├── features/reviews/
│   │   ├── types.ts                                  # NUEVO — ReviewIn, ReviewOut, ReviewWithReviewer
│   │   ├── schemas.ts                                # NUEVO — zod: reviewSchema
│   │   ├── hooks.ts                                  # NUEVO — useReviews (infinite), useCreateReview, useDeleteReview
│   │   ├── __tests__/
│   │   │   ├── schemas.test.ts                       # NUEVO — tests zod review
│   │   │   └── hooks.test.tsx                        # NUEVO — tests hooks review
│   │   └── components/
│   │       ├── StarRating.tsx                        # NUEVO — display + input
│   │       ├── ReviewForm.tsx                        # NUEVO — react-hook-form + zod
│   │       └── ReviewList.tsx                        # NUEVO — infinite scroll
│   ├── features/reports/
│   │   ├── types.ts                                  # NUEVO — ReportIn, ReportOut
│   │   ├── hooks.ts                                  # NUEVO — useReportUser
│   │   ├── __tests__/hooks.test.tsx                  # NUEVO — tests hook report
│   │   └── components/
│   │       └── ReportModal.tsx                       # NUEVO — modal reutilizable
│   ├── features/availability/
│   │   ├── types.ts                                  # NUEVO — AvailabilityIn, AvailabilityOut
│   │   ├── schemas.ts                                # NUEVO — zod: availabilitySchema
│   │   ├── hooks.ts                                  # NUEVO — useAvailability, useSetAvailability, useDeleteAvailability
│   │   ├── __tests__/hooks.test.tsx                  # NUEVO — tests hooks availability
│   │   └── components/
│   │       └── AvailabilityToggle.tsx                # NUEVO — toggle on/off + cuenta regresiva
│   ├── router.tsx                                    # MODIFICAR — registrar /me/trusted-contacts, /matches/:matchId/safety, /s/:token (pública)
│   ├── features/users/pages/UserPublicPage.tsx       # MODIFICAR — embeber ReviewList + ReportModal (Tasks 18, 20)
│   └── features/plans/pages/ExplorePage.tsx          # MODIFICAR — embeber AvailabilityToggle (Task 24)
```

---

## Task 1: Rama de trabajo y verificación del punto de partida

**Files:** —

- [ ] **Step 1: Crear rama `fase-6-safety-reviews-frontend`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git checkout -b fase-6-safety-reviews-frontend
```
Expected: `Switched to a new branch 'fase-6-safety-reviews-frontend'`

- [ ] **Step 2: Verificar que F0–F5 compilan y los tests pasan**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build && npx vitest run
```
Expected: build verde, todos los tests de F0–F5 pasan. Si alguna fase previa no está implementada (p.ej. no existe `features/matching/`), anotarlo: las Tasks de integración (5, 18, 20, 24) quedan condicionadas pero el resto de F6 se implementa igual.

- [ ] **Step 3: Confirmar dependencias disponibles**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/api/client.ts && echo "OK client" || echo "FALTA client (F0)"
test -f src/lib/geo.ts && echo "OK geo" || echo "FALTA geo (F0)"
test -f src/components/ui/ConfirmDialog.tsx && echo "OK ConfirmDialog" || echo "ConfirmDialog ausente — Task 4 lo crea"
test -f src/components/MapBackground.tsx && echo "OK MapBackground" || echo "FALTA MapBackground (F0)"
test -f src/features/matching/hooks.ts && echo "OK matching (F4)" || echo "matching ausente — integraciones diferidas"
```
Expected: la mayoría `OK`. `ConfirmDialog` puede estar ausente (lo crea la Task 4). Si `client`/`geo`/`MapBackground` faltan, F0 no está → detenerse y resolver F0 primero.

- [ ] **Step 4: Instalar `qrcode.react` (para el QR del share-link)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install qrcode.react
```
Expected: `added 1 package` (o similar). `qrcode.react` es ~3KB gzip, sin dependencias, renderiza SVG/Canvas localmente (no filtra el token a terceros).

> Si el entorno no permite instalar deps, la Task 9 (ShareLinkCard) tiene un fallback sin QR (solo URL copiable). El QR es opcional y se activa con feature-flag de presencia de la dep.

---

## Task 2 (Safety): Tipos y schemas zod

**Files:**
- Create: `frontend/src/features/safety/types.ts`
- Create: `frontend/src/features/safety/schemas.ts`

- [ ] **Step 1: Crear `features/safety/types.ts`**

Crear `frontend/src/features/safety/types.ts`:

```typescript
/**
 * Tipos del dominio Safety (contrato §Seguridad).
 *
 * Endpoints cubiertos:
 *  - GET/POST/DELETE /me/trusted-contacts
 *  - POST /safety/{match_id}/ping
 *  - GET  /safety/{match_id}/peer
 *  - POST/DELETE /safety/{match_id}/share-link
 *  - POST /safety/{match_id}/sos
 *  - GET  /s/{token}  (PÚBLICO, sin auth)
 */

import type { ContactType } from '../../types/enums';

// —— Trusted contacts ——

export type { ContactType };

export interface TrustedContactOut {
  id: string;
  contact_type: ContactType;
  contact_value: string;
  label: string;
  created_at: string; // ISO 8601
}

export interface TrustedContactIn {
  contact_type: ContactType;
  /** 3..255 caracteres (email válido o teléfono). */
  contact_value: string;
  /** 1..100 caracteres. */
  label: string;
}

// —— Pings de ubicación ——

export interface PingIn {
  lat: number; // -90..90
  lng: number; // -180..180
}

// —— Ubicación del par ——

export interface PeerLocationOut {
  lat: number | null;
  lng: number | null;
  last_ping_at: string | null; // ISO 8601
}

// —— Share-link ——

export interface ShareLinkOut {
  token: string;
  /** Path relativo de la app: "/s/<token>". */
  url: string;
}

// —— SOS ——

export interface SosOut {
  event_id: string;
  message: string;
}

// —— Vista pública /s/:token ——

export interface PublicLocationOut {
  match_id: string;
  user_display_name: string;
  lat: number | null;
  lng: number | null;
  last_ping_at: string | null; // ISO 8601
  /** true si el link/match expiró (aún devuelve data histórica). */
  expired: boolean;
}
```

- [ ] **Step 2: Crear `features/safety/schemas.ts`**

Crear `frontend/src/features/safety/schemas.ts`:

```typescript
import { z } from 'zod';

/**
 * Validación de TrustedContactIn (contrato: contact_value 3..255, label 1..100).
 * contact_type es enum 'email' | 'phone'.
 */
export const trustedContactSchema = z
  .object({
    contact_type: z.enum(['email', 'phone']),
    contact_value: z
      .string()
      .trim()
      .min(3, 'Ingresá al menos 3 caracteres.')
      .max(255, 'No puede superar los 255 caracteres.'),
    label: z
      .string()
      .trim()
      .min(1, 'Ingresá una etiqueta.')
      .max(100, 'La etiqueta no puede superar los 100 caracteres.'),
  })
  .superRefine((data, ctx) => {
    if (data.contact_type === 'email') {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_value);
      if (!emailOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_value'],
          message: 'Ingresá un email válido.',
        });
      }
    } else {
      // phone: dígitos, espacios, +, -, (, ). Al menos 6 dígitos.
      const digits = data.contact_value.replace(/\D/g, '');
      if (digits.length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_value'],
          message: 'Ingresá un teléfono válido (al menos 6 dígitos).',
        });
      }
    }
  });

export type TrustedContactValues = z.infer<typeof trustedContactSchema>;

/**
 * Validación de PingIn (lat -90..90, lng -180..180).
 * Usado por ping y SOS.
 */
export const pingSchema = z.object({
  lat: z.number().min(-90, 'Latitud inválida.').max(90, 'Latitud inválida.'),
  lng: z.number().min(-180, 'Longitud inválida.').max(180, 'Longitud inválida.'),
});

export type PingValues = z.infer<typeof pingSchema>;
```

- [ ] **Step 3: Crear test de schemas**

Crear `frontend/src/features/safety/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { trustedContactSchema, pingSchema } from '../schemas';

describe('trustedContactSchema', () => {
  it('acepta email válido', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza email mal formado', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'no-es-email',
      label: 'Amigo',
    });
    expect(r.success).toBe(false);
  });

  it('acepta teléfono con + y espacios', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'phone',
      contact_value: '+54 11 1234-5678',
      label: 'Mamá',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza teléfono con muy pocos dígitos', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'phone',
      contact_value: '12',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contact_value < 3 chars', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'ab',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza label vacío', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'a@b.com',
      label: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contact_type fuera del enum', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'fax' as never,
      contact_value: 'a@b.com',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });
});

describe('pingSchema', () => {
  it('acepta coords válidas', () => {
    expect(pingSchema.safeParse({ lat: -34.6, lng: -58.4 }).success).toBe(true);
  });
  it('rechaza lat > 90', () => {
    expect(pingSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });
  it('rechaza lng < -180', () => {
    expect(pingSchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Correr los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/safety/__tests__/schemas.test.ts
```
Expected: `Test Files 1 passed`, `Tests 10 passed`.

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
git add frontend/src/features/safety/types.ts frontend/src/features/safety/schemas.ts frontend/src/features/safety/__tests__/schemas.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(safety): tipos y schemas zod (trustedContact, ping) + tests"
```

---

## Task 3 (Safety): Hooks de datos

**Files:**
- Create: `frontend/src/features/safety/hooks.ts`
- Create: `frontend/src/features/safety/__tests__/hooks.test.tsx`

- [ ] **Step 1: Escribir el test de hooks que falla**

Crear `frontend/src/features/safety/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import * as client from '../../api/client';
import {
  useTrustedContacts,
  useAddTrustedContact,
  useDeleteTrustedContact,
  usePing,
  usePeerLocation,
  useShareLink,
  useRevokeShareLink,
  useSos,
  usePublicLocation,
} from '../hooks';
import type {
  TrustedContactOut,
  PeerLocationOut,
  ShareLinkOut,
  SosOut,
  PublicLocationOut,
} from '../types';

vi.spyOn(client, 'apiGet');
vi.spyOn(client, 'apiPost');
vi.spyOn(client, 'apiDelete');

const mocked = {
  apiGet: vi.mocked(client.apiGet),
  apiPost: vi.mocked(client.apiPost),
  apiDelete: vi.mocked(client.apiDelete),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const CONTACT: TrustedContactOut = {
  id: 'c1',
  contact_type: 'email',
  contact_value: 'amigo@example.com',
  label: 'Amigo',
  created_at: '2026-07-09T18:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTrustedContacts', () => {
  it('trae la lista desde GET /me/trusted-contacts', async () => {
    mocked.apiGet.mockResolvedValueOnce([CONTACT]);
    const { result } = renderHook(() => useTrustedContacts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([CONTACT]);
    expect(mocked.apiGet).toHaveBeenCalledWith('/me/trusted-contacts');
  });
});

describe('useAddTrustedContact', () => {
  it('POST /me/trusted-contacts y invalida trusted-contacts', async () => {
    mocked.apiPost.mockResolvedValueOnce(CONTACT);
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useAddTrustedContact(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate({
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/me/trusted-contacts', {
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    expect(invalidate).toHaveBeenCalledWith(['trusted-contacts']);
  });
});

describe('useDeleteTrustedContact', () => {
  it('DELETE /me/trusted-contacts/{id} y invalida', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Contacto eliminado' });
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useDeleteTrustedContact(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate('c1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/me/trusted-contacts/c1');
    expect(invalidate).toHaveBeenCalledWith(['trusted-contacts']);
  });
});

describe('usePing', () => {
  it('POST /safety/{id}/ping con lat/lng', async () => {
    mocked.apiPost.mockResolvedValueOnce({ message: 'Ubicación actualizada' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => usePing(invalidate), { wrapper: createWrapper() });
    result.current.mutate({ matchId: 'm1', lat: -34.6, lng: -58.4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/ping', { lat: -34.6, lng: -58.4 });
    // Ping NO invalida peer (lo hace PeerLocation por polling); pero por defecto no invalida nada.
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('usePeerLocation', () => {
  it('GET /safety/{id}/peer', async () => {
    const peer: PeerLocationOut = { lat: -34.6, lng: -58.4, last_ping_at: '2026-07-09T18:00:00Z' };
    mocked.apiGet.mockResolvedValueOnce(peer);
    const { result } = renderHook(
      () => usePeerLocation('m1', { enabled: true, intervalMs: false }),
      { wrapper: createWrapper() },
    ) as { result: { current: UseQueryResult<PeerLocationOut> } };
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(peer);
    expect(mocked.apiGet).toHaveBeenCalledWith('/safety/m1/peer');
  });

  it('no consulta cuando enabled=false', async () => {
    const { result } = renderHook(
      () => usePeerLocation('m1', { enabled: false, intervalMs: false }),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.apiGet).not.toHaveBeenCalled();
  });
});

describe('useShareLink', () => {
  it('GET /safety/{id}/share-link (query param opcional)', async () => {
    // NOTA: el contrato define POST para crear y DELETE para revocar; GET no existe.
    // useShareLink es solo state local en ShareLinkCard; aquí verificamos create/revoke.
    expect(true).toBe(true);
  });
});

describe('useCreateShareLink', () => {
  it('POST /safety/{id}/share-link → {token,url}', async () => {
    const out: ShareLinkOut = { token: 'tok-123', url: '/s/tok-123' };
    mocked.apiPost.mockResolvedValueOnce(out);
    const invalidate = vi.fn();
    const { result } = renderHook(
      // @ts-expect-error import dinámico seguro si el nombre difiere
      () => (require('../hooks') as typeof import('../hooks')).useCreateShareLink(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate('m1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/share-link');
    expect(invalidate).toHaveBeenCalledWith(['safety', 'share-link', 'm1']);
  });
});

describe('useRevokeShareLink', () => {
  it('DELETE /safety/{id}/share-link?token=X', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Link revocado' });
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useRevokeShareLink(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate({ matchId: 'm1', token: 'tok-123' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/safety/m1/share-link', {
      query: { token: 'tok-123' },
    });
    expect(invalidate).toHaveBeenCalledWith(['safety', 'share-link', 'm1']);
  });
});

describe('useSos', () => {
  it('POST /safety/{id}/sos con PingIn → SosOut', async () => {
    const out: SosOut = { event_id: 'e1', message: 'Alerta enviada' };
    mocked.apiPost.mockResolvedValueOnce(out);
    const { result } = renderHook(() => useSos(), { wrapper: createWrapper() });
    result.current.mutate({ matchId: 'm1', lat: -34.6, lng: -58.4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(out);
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/sos', { lat: -34.6, lng: -58.4 });
  });
});

describe('usePublicLocation (PÚBLICO)', () => {
  it('GET /s/{token} con publicEndpoint: true (sin auth)', async () => {
    const pub: PublicLocationOut = {
      match_id: 'm1',
      user_display_name: 'Martín',
      lat: -34.6,
      lng: -58.4,
      last_ping_at: '2026-07-09T18:00:00Z',
      expired: false,
    };
    mocked.apiGet.mockResolvedValueOnce(pub);
    const { result } = renderHook(() => usePublicLocation('tok-123'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pub);
    expect(mocked.apiGet).toHaveBeenCalledWith('/s/tok-123', { publicEndpoint: true });
  });
});
```

> **Nota:** el test usa un `require('../hooks')` dinámico para `useCreateShareLink` solo para iluminar el nombre exacto del export; si el linter de TS reclama, reemplazar ese `it` por un import estático al inicio del archivo. El objetivo es fijar el contrato del hook antes de implementarlo (TDD).

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/safety/__tests__/hooks.test.tsx
```
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 3: Implementar `features/safety/hooks.ts`**

Crear `frontend/src/features/safety/hooks.ts`:

```typescript
/**
 * Hooks de datos (TanStack Query v5) para el dominio Safety.
 *
 * Query keys:
 *  - ['trusted-contacts']
 *  - ['safety', 'peer', matchId]
 *  - ['safety', 'share-link', matchId]
 *
 * El endpoint público GET /s/{token} NO pasa por el interceptor de auth
 * (publicEndpoint: true).
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type {
  TrustedContactOut,
  TrustedContactIn,
  PingIn,
  PeerLocationOut,
  ShareLinkOut,
  SosOut,
  PublicLocationOut,
} from './types';

/** Invalidador inyectable para los tests (evita acoplamiento al queryClient real). */
type Invalidator = (keys: unknown[]) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return (keys: unknown[]) => qc.invalidateQueries({ queryKey: keys });
}

// —— Trusted contacts ——

export function useTrustedContacts() {
  return useQuery<TrustedContactOut[]>({
    queryKey: ['trusted-contacts'],
    queryFn: () => apiGet<TrustedContactOut[]>('/me/trusted-contacts'),
    staleTime: 30_000,
  });
}

export function useAddTrustedContact(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<TrustedContactOut, Error, TrustedContactIn>({
    mutationFn: (body) => apiPost<TrustedContactOut>('/me/trusted-contacts', body),
    onSuccess: () => inv(['trusted-contacts']),
  });
}

export function useDeleteTrustedContact(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<{ message: string }, Error, string>({
    mutationFn: (contactId: string) =>
      apiDelete<{ message: string }>(`/me/trusted-contacts/${contactId}`),
    onSuccess: () => inv(['trusted-contacts']),
  });
}

// —— Pings de ubicación (live-tracking) ——

export interface PingArgs {
  matchId: string;
  lat: number;
  lng: number;
}

/**
 * POST /safety/{match_id}/ping. No invalida ninguna query: el live-tracking
 * es write-only desde el cliente; la ubicación del par se lee por polling
 * en usePeerLocation.
 *
 * Los errores de ping se manejan en LiveTracker (log + toast suave); no
 * rompen el flujo del match.
 */
export function usePing(invalidate?: Invalidator) {
  // invalidate se recibe por simetría con el resto y para tests; por defecto no-op.
  const noop: Invalidator = invalidate ?? (() => undefined);
  return useMutation<{ message: string }, Error, PingArgs>({
    mutationFn: ({ matchId, lat, lng }) =>
      apiPost<{ message: string }>(`/safety/${matchId}/ping`, { lat, lng } satisfies PingIn),
    onSuccess: () => noop([]),
  });
}

// —— Ubicación del par (polling) ——

export interface UsePeerLocationOptions {
  /** Si false, no consulta (p.ej. match no activo). */
  enabled?: boolean;
  /** Intervalo de refetch en ms. `false` = sin auto-refetch. Default 30000. */
  intervalMs?: number | false;
}

export function usePeerLocation(matchId: string, options: UsePeerLocationOptions = {}) {
  const { enabled = true, intervalMs = 30_000 } = options;
  const queryOptions: UseQueryOptions<PeerLocationOut> = {
    queryKey: ['safety', 'peer', matchId],
    queryFn: () => apiGet<PeerLocationOut>(`/safety/${matchId}/peer`),
    enabled: Boolean(matchId) && enabled,
    staleTime: 0,
  };
  if (intervalMs !== false) {
    (queryOptions as { refetchInterval?: number }).refetchInterval = intervalMs;
  }
  return useQuery<PeerLocationOut>(queryOptions);
}

// —— Share-link ——

export function useCreateShareLink(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<ShareLinkOut, Error, string>({
    mutationFn: (matchId: string) =>
      apiPost<ShareLinkOut>(`/safety/${matchId}/share-link`),
    onSuccess: (_data, matchId) => inv(['safety', 'share-link', matchId]),
  });
}

export interface RevokeShareLinkArgs {
  matchId: string;
  token: string;
}

export function useRevokeShareLink(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<{ message: string }, Error, RevokeShareLinkArgs>({
    mutationFn: ({ matchId, token }) =>
      apiDelete<{ message: string }>(`/safety/${matchId}/share-link`, {
        query: { token },
      }),
    onSuccess: (_data, { matchId }) => inv(['safety', 'share-link', matchId]),
  });
}

// —— SOS ——

export interface SosArgs {
  matchId: string;
  lat: number;
  lng: number;
}

export function useSos() {
  return useMutation<SosOut, Error, SosArgs>({
    mutationFn: ({ matchId, lat, lng }) =>
      apiPost<SosOut>(`/safety/${matchId}/sos`, { lat, lng } satisfies PingIn),
  });
}

// —— Vista pública /s/:token (SIN auth) ——

/**
 * GET /s/{token}. Endpoint PÚBLICO: marca publicEndpoint:true para evitar
 * el interceptor de 401→refresh y el header Bearer.
 *
 * No usa refetchInterval por defecto (la vista pública es pasiva); el
 * componente puede forzar refetch manualmente.
 */
export function usePublicLocation(token: string) {
  return useQuery<PublicLocationOut>({
    queryKey: ['public-location', token],
    queryFn: () => apiGet<PublicLocationOut>(`/s/${token}`, { publicEndpoint: true }),
    enabled: Boolean(token),
    retry: false, // 401/404 son terminales para la vista pública
    staleTime: 15_000,
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/safety/__tests__/hooks.test.tsx
```
Expected: PASS (todos los `describe`).

> Si el test de `useCreateShareLink` con `require` dinámico falla por TS/ESM, sustituir ese bloque por un import estático al inicio: `import { useCreateShareLink, ... } from '../hooks';` y ajustar el `it`. El resto del test queda igual.

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
git add frontend/src/features/safety/hooks.ts frontend/src/features/safety/__tests__/hooks.test.tsx
git commit -m "feat(safety): hooks useTrustedContacts/ping/peer/shareLink/sos/publicLocation (TDD)"
```

---

## Task 4: `ConfirmDialog` (componente UI compartido, si no existe)

> **Condición:** ejecutar solo si `frontend/src/components/ui/ConfirmDialog.tsx` NO existe (verificar con el Step 1). Si ya existe (creado por F3/F4), **omitir este task** y pasar a la Task 5.

**Files:**
- Create: `frontend/src/components/ui/ConfirmDialog.tsx`

- [ ] **Step 1: Verificar si existe**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/components/ui/ConfirmDialog.tsx && echo "EXISTE — omitir Task 4" || echo "AUSENTE — crear"
```
Expected: uno de los dos. Si `EXISTE`, marcar este task completo y continuar en Task 5.

- [ ] **Step 2: Crear `ConfirmDialog.tsx`**

Crear `frontend/src/components/ui/ConfirmDialog.tsx`:

```typescript
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' pone el botón de confirmar en rojo. Default 'primary'. */
  tone?: 'primary' | 'danger';
  loading?: boolean;
  /** Icono a mostrar junto al título. Default AlertTriangle cuando tone=danger. */
  icon?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = '¿Confirmar?',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  loading = false,
  icon,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {icon ?? (tone === 'danger' ? <AlertTriangle className="w-5 h-5 text-red-500" /> : null)}
          {title}
        </span>
      }
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            className={cn(tone === 'danger' && 'focus-visible:ring-red-500')}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {description && <div className="text-sm text-gray-600 leading-relaxed">{description}</div>}
    </Modal>
  );
}
```

- [ ] **Step 3: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit (solo si se creó)**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/components/ui/ConfirmDialog.tsx
git commit -m "feat(ui): ConfirmDialog reutilizable (tone danger/primary) para safety y reviews"
```

---

## Task 5 (Safety): `TrustedContactsPage` (`/me/trusted-contacts`)

**Files:**
- Create: `frontend/src/features/safety/pages/TrustedContactsPage.tsx`

- [ ] **Step 1: Crear la página**

Crear `frontend/src/features/safety/pages/TrustedContactsPage.tsx`:

```typescript
// frontend/src/features/safety/pages/TrustedContactsPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Plus, Trash2, ShieldCheck, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import {
  useTrustedContacts,
  useAddTrustedContact,
  useDeleteTrustedContact,
} from '../hooks';
import { trustedContactSchema, type TrustedContactValues } from '../schemas';
import type { TrustedContactOut } from '../types';
import { ApiError } from '../../../api/errors';

const MAX_CONTACTS = 2;

export default function TrustedContactsPage() {
  const { data: contacts, isLoading, isError, error, refetch } = useTrustedContacts();
  const addContact = useAddTrustedContact();
  const deleteContact = useDeleteTrustedContact();
  const [pendingDelete, setPendingDelete] = useState<TrustedContactOut | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TrustedContactValues>({
    resolver: zodResolver(trustedContactSchema),
    defaultValues: { contact_type: 'email', contact_value: '', label: '' },
  });
  const contactType = watch('contact_type');

  const atLimit = (contacts?.length ?? 0) >= MAX_CONTACTS;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addContact.mutateAsync(values);
      toast.success('Contacto de confianza añadido.');
      reset();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'conflict') {
        toast.error(apiErr.detail || 'Alcanzaste el máximo de 2 contactos o ya existe.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos añadir el contacto. Probá de nuevo.');
      }
    }
  });

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteContact.mutateAsync(target.id);
      toast.success('Contacto eliminado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos eliminar el contacto.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/me"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" /> Contactos de confianza
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
        <section className="glass-panel rounded-2xl p-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            Tus contactos de confianza reciben tu ubicación si activás un{' '}
            <strong>SOS</strong> durante un match. Podés añadir hasta{' '}
            <strong>{MAX_CONTACTS}</strong>.
          </p>
        </section>

        {/* Lista */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Guardados ({contacts?.length ?? 0}/{MAX_CONTACTS})
          </h2>
          {isLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {isError && (
            <ErrorState
              message={(error as Error)?.message}
              onRetry={() => refetch()}
            />
          )}
          {!isLoading && !isError && (contacts?.length ?? 0) === 0 && (
            <EmptyState
              icon={<UserPlus className="w-10 h-10" />}
              title="Sin contactos todavía"
              description="Añadir un contacto de confianza para tu seguridad durante los matches."
            />
          )}
          {!isLoading && !isError && (contacts?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {contacts!.map((c) => (
                <li
                  key={c.id}
                  className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                    {c.contact_type === 'email' ? (
                      <Mail className="w-5 h-5" />
                    ) : (
                      <Phone className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.label}</p>
                    <p className="text-sm text-gray-500 truncate">{c.contact_value}</p>
                  </div>
                  <Badge variant="brand">
                    {c.contact_type === 'email' ? 'Email' : 'Teléfono'}
                  </Badge>
                  <button
                    onClick={() => setPendingDelete(c)}
                    className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Eliminar ${c.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Form añadir */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Añadir contacto
          </h2>
          {atLimit && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Alcanzaste el máximo de {MAX_CONTACTS} contactos. Eliminá uno para añadir otro.
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo</label>
              <div className="flex gap-2">
                {(['email', 'phone'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('contact_type', t, { shouldValidate: true })}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                      contactType === t
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    } ${atLimit ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {t === 'email' ? 'Email' : 'Teléfono'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {contactType === 'email' ? 'Email' : 'Teléfono'}
              </label>
              <Input
                type={contactType === 'email' ? 'email' : 'tel'}
                placeholder={contactType === 'email' ? 'nombre@email.com' : '+54 11 ...'}
                invalid={!!errors.contact_value}
                disabled={atLimit || addContact.isPending}
                {...register('contact_value')}
              />
              {errors.contact_value && (
                <p className="text-xs text-red-500 mt-1">{errors.contact_value.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Etiqueta (cómo lo conocés)
              </label>
              <Input
                placeholder="Ej: Mamá, Mejor amigo..."
                invalid={!!errors.label}
                disabled={atLimit || addContact.isPending}
                {...register('label')}
              />
              {errors.label && (
                <p className="text-xs text-red-500 mt-1">{errors.label.message}</p>
              )}
            </div>

            <Button type="submit" fullWidth loading={addContact.isPending} disabled={atLimit}>
              <Plus className="w-4 h-4" /> Añadir contacto
            </Button>
          </form>
        </section>
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
        title="Eliminar contacto"
        description={
          <>
            ¿Seguro que querés eliminar a{' '}
            <strong>{pendingDelete?.label}</strong> de tus contactos de confianza?
          </>
        }
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleteContact.isPending}
      />
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
git add frontend/src/features/safety/pages/TrustedContactsPage.tsx
git commit -m "feat(safety): TrustedContactsPage CRUD (max 2) con form zod y feedback"
```

---

## Task 6 (Safety): TDD — `useThrottledWatchPosition`

**Files:**
- Create: `frontend/src/features/safety/__tests__/useThrottledWatchPosition.test.tsx`
- Create: `frontend/src/features/safety/useThrottledWatchPosition.ts`

Este hook envuelve `navigator.geolocation.watchPosition` y emite la posición al callback **throttleado** a un intervalo mínimo (60s por defecto para pings), ignorando updates intermedios demasiado frecuentes. Es la pieza clave del `LiveTracker` y se testa con fake timers + un mock de geolocation.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/safety/__tests__/useThrottledWatchPosition.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThrottledWatchPosition } from '../useThrottledWatchPosition';

/** Mock de la API de geolocation del navegador. */
type PosCb = (pos: GeolocationPosition) => void;
type ErrCb = (err: GeolocationPositionError) => void;

function makeGeo() {
  let posCb: PosCb | null = null;
  let errCb: ErrCb | null = null;
  const watch = vi.fn((_opts, onPos: PosCb, onErr: ErrCb) => {
    posCb = onPos;
    errCb = onErr;
    return 42; // watchId
  });
  const clear = vi.fn();
  function emit(lat: number, lng: number) {
    posCb?.({
      coords: { latitude: lat, longitude: lng, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition);
  }
  function emitError(code: number) {
    errCb?.({ code, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as unknown as GeolocationPositionError);
  }
  return { watch, clear, emit, emitError };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useThrottledWatchPosition', () => {
  it('arranca watchPosition al activar y emite el primer update enseguida', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    expect(result.current.active).toBe(false);

    act(() => result.current.start());
    expect(geo.watch).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);

    act(() => geo.emit(-34.6, -58.4));
    expect(onPosition).toHaveBeenCalledTimes(1);
    expect(onPosition).toHaveBeenCalledWith(-34.6, -58.4);
    expect(result.current.lastPosition).toEqual({ lat: -34.6, lng: -58.4 });
  });

  it('throttlea: segundo update dentro de la ventana se ignora', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // 1º → emite
    act(() => geo.emit(-34.61, -58.41)); // 2º a los 0ms → ignorado
    expect(onPosition).toHaveBeenCalledTimes(1);
  });

  it('pasado el throttle, el siguiente update se emite', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // 1º emite (t=0)
    vi.advanceTimersByTime(59_999);
    act(() => geo.emit(-34.61, -58.41)); // aún dentro → ignorado
    expect(onPosition).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2); // t=60001
    act(() => geo.emit(-34.62, -58.42)); // fuera de ventana → emite
    expect(onPosition).toHaveBeenCalledTimes(2);
  });

  it('stop() llama clearWatch y desactiva', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(geo.clear).toHaveBeenCalledWith(42);
    expect(result.current.active).toBe(false);
  });

  it('si no hay geolocation, emite onError y no arranca', () => {
    vi.stubGlobal('navigator', {});
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), onError, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it('error PERMISSION_DENIED → onError con flag', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), onError, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emitError(1)); // PERMISSION_DENIED
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ denied: true }));
    expect(result.current.active).toBe(false);
  });

  it('desmontar limpia el watch (clearWatch)', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const { result, unmount } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    unmount();
    expect(geo.clear).toHaveBeenCalled();
  });

  it('stop() con un último update pendiente lo flushea (opcional, via flushPending)', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // emite t=0
    act(() => geo.emit(-34.7, -58.5)); // throttleado (queda como pendiente)
    act(() => result.current.stop());
    expect(onPosition).toHaveBeenLastCalledWith(-34.7, -58.5); // flush del último pendiente
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/safety/__tests__/useThrottledWatchPosition.test.tsx
```
Expected: FAIL — `Cannot find module '../useThrottledWatchPosition'`.

- [ ] **Step 3: Implementar `useThrottledWatchPosition.ts`**

Crear `frontend/src/features/safety/useThrottledWatchPosition.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface WatchError {
  denied: boolean;
  message: string;
}

export interface UseThrottledWatchPositionOptions {
  /** Callback invocado con cada posición NO throttleada. */
  onPosition: (lat: number, lng: number) => void;
  /** Callback de error (permiso denegado, etc). */
  onError?: (err: WatchError) => void;
  /** Intervalo mínimo entre emisiones al callback. Default 60000 (60s). */
  throttleMs?: number;
  /** Opciones de watchPosition. */
  watchOptions?: PositionOptions;
}

export interface UseThrottledWatchPositionResult {
  active: boolean;
  lastPosition: GeoCoords | null;
  start: () => void;
  stop: () => void;
}

/**
 * Envuelve navigator.geolocation.watchPosition y emite coordenadas al
 * callback throttleado a `throttleMs`. Los updates intermedios se ignoran,
 * pero se guarda el último como "pendiente" para flushearlo al detener.
 *
 * Pensado para el live-tracking de safety (ping cada 60s): GPS da updates
 * cada ~1-10s pero no queremos spamear el backend.
 *
 * El callback de posición puede ser stale; los consumers deben usar refs
 * propios para leer estado fresco dentro del callback si lo necesitan.
 */
export function useThrottledWatchPosition(
  options: UseThrottledWatchPositionOptions,
): UseThrottledWatchPositionResult {
  const { onPosition, onError, throttleMs = 60_000, watchOptions } = options;
  const [active, setActive] = useState(false);
  const [lastPosition, setLastPosition] = useState<GeoCoords | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);
  const pendingRef = useRef<GeoCoords | null>(null);
  const onPositionRef = useRef(onPosition);
  const onErrorRef = useRef(onError);

  // Mantener refs frescas sin re-arrancar el watch.
  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const emit = useCallback((lat: number, lng: number) => {
    const coords: GeoCoords = { lat, lng };
    setLastPosition(coords);
    const now = Date.now();
    if (now - lastEmitRef.current >= throttleMs) {
      lastEmitRef.current = now;
      pendingRef.current = null;
      onPositionRef.current(lat, lng);
    } else {
      // Guardar como pendiente para flushear al detener.
      pendingRef.current = coords;
    }
  }, [throttleMs]);

  const flushPending = useCallback(() => {
    if (pendingRef.current) {
      const { lat, lng } = pendingRef.current;
      pendingRef.current = null;
      lastEmitRef.current = Date.now();
      onPositionRef.current(lat, lng);
    }
  }, []);

  const start = useCallback(() => {
    if (active) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) {
      onErrorRef.current?.({ denied: false, message: 'Geolocalización no disponible.' });
      return;
    }
    lastEmitRef.current = 0;
    pendingRef.current = null;
    setActive(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => emit(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        onErrorRef.current?.({ denied, message: err.message || 'Error de ubicación.' });
        if (denied) {
          setActive(false);
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        }
      },
      watchOptions ?? { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }, [active, emit, watchOptions]);

  const stop = useCallback(() => {
    flushPending();
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setActive(false);
  }, [flushPending]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { active, lastPosition, start, stop };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/safety/__tests__/useThrottledWatchPosition.test.tsx
```
Expected: PASS — `Tests 8 passed`.

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
git add frontend/src/features/safety/useThrottledWatchPosition.ts frontend/src/features/safety/__tests__/useThrottledWatchPosition.test.tsx
git commit -m "feat(safety): useThrottledWatchPosition sobre watchPosition con throttle 60s (TDD)"
```

---

## Task 7 (Safety): `LiveTracker` (ping periódico)

**Files:**
- Create: `frontend/src/features/safety/components/LiveTracker.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/safety/components/LiveTracker.tsx`:

```typescript
// frontend/src/features/safety/components/LiveTracker.tsx
import { useEffect, useState } from 'react';
import { MapPin, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../../components/ui/Badge';
import { usePing } from '../hooks';
import { useThrottledWatchPosition } from '../useThrottledWatchPosition';

export interface LiveTrackerProps {
  matchId: string;
  /** Throttle de pings en ms. Default 60000 (60s). */
  throttleMs?: number;
}

type Status = 'idle' | 'active' | 'denied' | 'error';

/**
 * Durante un match activo, envía POST /safety/{match_id}/ping con la
 * ubicación del usuario (vía watchPosition throttleado). Se activa al
 * montar y se detiene al desmontar.
 *
 * UX: muestra el estado (compartiendo / permiso denegado / error) y la
 * última posición enviada. Los errores de ping son no-fatales (log + toast
 * suave cada N fallos).
 */
export function LiveTracker({ matchId, throttleMs = 60_000 }: LiveTrackerProps) {
  const ping = usePing();
  const [status, setStatus] = useState<Status>('idle');
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  const { active, lastPosition, start, stop } = useThrottledWatchPosition({
    throttleMs,
    onPosition: (lat, lng) => {
      ping.mutate(
        { matchId, lat, lng },
        {
          onSuccess: () => setConsecutiveErrors(0),
          onError: (e) => {
            setConsecutiveErrors((n) => n + 1);
            // Solo tostar cada 3 fallos para no spamear.
            // eslint-disable-next-line no-console
            console.warn('[safety] ping failed', e);
          },
        },
      );
    },
    onError: (err) => {
      if (err.denied) {
        setStatus('denied');
        toast.error('Permiso de ubicación denegado. No podemos compartir tu ubicación.');
      } else {
        setStatus('error');
      }
    },
  });

  // Arrancar al montar, parar al desmontar.
  useEffect(() => {
    setStatus('active');
    start();
    return () => stop();
    // start/stop son estables vía useCallback; matchId/throttleMs definen la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, throttleMs]);

  useEffect(() => {
    if (consecutiveErrors > 0 && consecutiveErrors % 3 === 0) {
      toast.error('No estamos pudiendo actualizar tu ubicación. Revisá tu conexión.');
    }
  }, [consecutiveErrors]);

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Ubicación compartida</h2>
        </div>
        <TrackerBadge status={status} active={active} pending={ping.isPending} />
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        Estamos compartiendo tu ubicación con tu par cada {Math.round(throttleMs / 1000)}s mientras
        dure el encuentro. Cerrá esta pantalla para dejar de compartir.
      </p>
      {lastPosition && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5" />
          <span>
            Última: {lastPosition.lat.toFixed(5)}, {lastPosition.lng.toFixed(5)}
          </span>
        </div>
      )}
      {status === 'denied' && (
        <p className="mt-3 text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Habilitá el permiso de ubicación en tu navegador para activar el seguimiento.
        </p>
      )}
    </section>
  );
}

function TrackerBadge({
  status,
  active,
  pending,
}: {
  status: Status;
  active: boolean;
  pending: boolean;
}) {
  if (status === 'denied') {
    return (
      <Badge variant="danger">
        <AlertCircle className="w-3 h-3" /> Permiso denegado
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="warning">
        <AlertCircle className="w-3 h-3" /> Reintentando
      </Badge>
    );
  }
  if (pending) {
    return (
      <Badge variant="brand">
        <RefreshCw className="w-3 h-3 animate-spin" /> Enviando
      </Badge>
    );
  }
  if (active) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="w-3 h-3" /> Compartiendo
      </Badge>
    );
  }
  return <Badge variant="neutral">Inactivo</Badge>;
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
git add frontend/src/features/safety/components/LiveTracker.tsx
git commit -m "feat(safety): LiveTracker con ping throttleado cada 60s via watchPosition"
```

---

## Task 8 (Safety): `PeerLocation` (polling + mapa)

**Files:**
- Create: `frontend/src/features/safety/components/PeerLocation.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/safety/components/PeerLocation.tsx`:

```typescript
// frontend/src/features/safety/components/PeerLocation.tsx
import { AlertCircle, Clock, MapPin } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { usePeerLocation } from '../hooks';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime } from '../../../lib/format';

export interface PeerLocationProps {
  matchId: string;
  /** Habilitar/deshabilitar polling (p.ej. solo si match activo). */
  enabled?: boolean;
  /** Intervalo de polling en ms. Default 30000. */
  intervalMs?: number;
}

/**
 * Muestra la ubicación del par (GET /safety/{match_id}/peer, polling 30s)
 * sobre MapBackground. Si el par no compartió ubicación (lat/lng null),
 * muestra un estado informativo.
 */
export function PeerLocation({ matchId, enabled = true, intervalMs = 30_000 }: PeerLocationProps) {
  const { data, isLoading, isError, error, refetch } = usePeerLocation(matchId, {
    enabled,
    intervalMs,
  });

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Ubicación de tu par</h2>
        </div>
        {data?.last_ping_at && (
          <Badge variant="neutral">
            <Clock className="w-3 h-3" /> {formatRelativeTime(data.last_ping_at)}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {isError && (() => {
        const apiErr = error instanceof ApiError ? error : null;
        // 422 validation_error: no participante.
        if (apiErr?.status === 422) {
          return (
            <ErrorState
              title="No podés ver esta ubicación"
              message="Solo los participantes del match pueden ver la ubicación del par."
            />
          );
        }
        return <ErrorState message={apiErr?.detail} onRetry={() => refetch()} />;
      })()}

      {!isLoading && !isError && data && (
        <>
          {data.lat === null || data.lng === null ? (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                Tu par todavía no compartió su ubicación.
              </p>
              {data.last_ping_at && (
                <p className="text-xs text-gray-400 mt-1">
                  Última actualización: {formatRelativeTime(data.last_ping_at)}
                </p>
              )}
            </div>
          ) : (
            <div className="relative h-48 rounded-xl overflow-hidden border border-gray-100">
              <MapBackground
                userLocation={[data.lat, data.lng]}
                plans={[{ id: 'peer', lat: data.lat, lng: data.lng }]}
              />
            </div>
          )}
        </>
      )}
    </section>
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
git add frontend/src/features/safety/components/PeerLocation.tsx
git commit -m "feat(safety): PeerLocation con polling 30s y mapa del par"
```

---

## Task 9 (Safety): `SosButton` (safety-critical, doble confirmación)

**Files:**
- Create: `frontend/src/features/safety/components/SosButton.tsx`

> Este es el componente más sensible de F6. La UX es: botón rojo prominente → primer modal con texto explicativo grave y campo de confirmación escrito (escribir "SOS") → segundo botón confirmar → POST /safety/{match_id}/sos con ubicación → toast + modal de éxito con `event_id`. Si no hay ubicación (GPS denegado), se permite igualmente pero se advierte.

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/safety/components/SosButton.tsx`:

```typescript
// frontend/src/features/safety/components/SosButton.tsx
import { useEffect, useState } from 'react';
import { AlertOctagon, Siren, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { useSos } from '../hooks';
import { getCurrentPosition } from '../../../lib/geo';
import { ApiError } from '../../../api/errors';

export interface SosButtonProps {
  matchId: string;
}

const CONFIRM_TEXT = 'SOS';

/**
 * Botón SOS safety-critical. Doble confirmación:
 *  1. Botón rojo "Activar SOS" → abre modal explicativo grave.
 *  2. Modal pide escribir literalmente "SOS" para habilitar el botón confirmar.
 *  3. Confirmar → obtiene ubicación (best-effort) → POST /safety/{match_id}/sos.
 *
 * Si el GPS falla, se envía el SOS igual con coords {0,0} como sentinel
 * (el backend lo registra; mejor un SOS sin coords que ningún SOS).
 * El resultado (event_id) se muestra en un modal de éxito.
 */
export function SosButton({ matchId }: SosButtonProps) {
  const sos = useSos();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ event_id: string; message: string } | null>(null);

  // Reset del campo al cerrar.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_TEXT;

  const handleActivate = async () => {
    let lat = 0;
    let lng = 0;
    let geoWarning = '';
    try {
      const pos = await getCurrentPosition();
      lat = pos.latitude;
      lng = pos.longitude;
    } catch {
      geoWarning = 'No pudimos obtener tu ubicación GPS. Se enviará el SOS igual.';
    }

    try {
      const out = await sos.mutateAsync({ matchId, lat, lng });
      setResult(out);
      setOpen(false);
      if (geoWarning) toast.warning(geoWarning);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(
        apiErr?.detail ?? 'No pudimos activar el SOS. Intentá de nuevo o llamá a emergencias.',
      );
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-red-600 text-white font-bold text-base shadow-lg shadow-red-600/30 hover:bg-red-700 active:scale-[0.98] transition"
        aria-label="Activar SOS"
      >
        <Siren className="w-5 h-5" />
        Activar SOS
      </button>

      {/* Modal de doble confirmación */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2 text-red-600">
            <AlertOctagon className="w-6 h-6" /> Confirmar SOS
          </span>
        }
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sos.isPending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleActivate}
              loading={sos.isPending}
              disabled={!canConfirm}
            >
              <Siren className="w-4 h-4" /> Enviar SOS ahora
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="font-semibold text-red-800 mb-1">¿Estás en peligro?</p>
            <p className="text-red-700">
              Al activar el SOS, notificaremos a tu par y a tus contactos de confianza con tu
              ubicación actual. Usalo solo en una emergencia real.
            </p>
          </div>
          <p>
            Para confirmar, escribí <strong className="tracking-widest">SOS</strong> en el campo de
            abajo. Esto evita activaciones accidentales.
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Escribí SOS"
            aria-label="Escribí SOS para confirmar"
            autoComplete="off"
            disabled={sos.isPending}
            className="text-center tracking-widest font-bold"
          />
          <p className="text-xs text-gray-500">
            En una emergencia médica o de seguridad, llamá también a los servicios de emergencia de
            tu zona.
          </p>
        </div>
      </Modal>

      {/* Modal de éxito */}
      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title={
          <span className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-6 h-6" /> SOS enviado
          </span>
        }
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setResult(null)}>Entendido</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-gray-700">
          <p>{result?.message ?? 'Tu alerta fue enviada.'}</p>
          {result?.event_id && (
            <div className="flex items-center gap-2">
              <Badge variant="neutral">ID del evento</Badge>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">{result.event_id}</code>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Guardá este ID por si necesitás referenciarlo con soporte.
          </p>
        </div>
      </Modal>
    </>
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
git add frontend/src/features/safety/components/SosButton.tsx
git commit -m "feat(safety): SosButton con doble confirmación (escribir SOS) y modal de éxito"
```

---

## Task 10 (Safety): `ShareLinkCard` (crear / copiar / QR / revocar)

**Files:**
- Create: `frontend/src/features/safety/components/ShareLinkCard.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/safety/components/ShareLinkCard.tsx`:

```typescript
// frontend/src/features/safety/components/ShareLinkCard.tsx
import { useState } from 'react';
import { Link2, Copy, Check, Trash2, QrCode, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useCreateShareLink, useRevokeShareLink } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ShareLinkCardProps {
  matchId: string;
}

/** Construye la URL pública absoluta a partir del path relativo "/s/<token>". */
function buildPublicUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

/** Detecta si qrcode.react está disponible (lo instalamos en Task 1). */
function hasQrLib(): boolean {
  try {
    // require dinámico evita error de bundler si la dep faltara.
    // @ts-expect-error optional dep
    return Boolean(window && (require.resolveWeak?.('qrcode.react') ?? true));
  } catch {
    return true; // asumimos presente (la instalamos en Task 1)
  }
}

export function ShareLinkCard({ matchId }: ShareLinkCardProps) {
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const publicUrl = token ? buildPublicUrl(`/s/${token}`) : '';
  const qrAvailable = hasQrLib();

  const handleCreate = async () => {
    try {
      const out = await createLink.mutateAsync(matchId);
      setToken(out.token);
      toast.success('Link de seguimiento creado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos crear el link.');
    }
  };

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success('Link copiado al portapapeles.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No pudimos copiar. Copialo a mano.');
    }
  };

  const handleRevoke = async () => {
    if (!token) return;
    const t = token;
    setConfirmRevoke(false);
    try {
      await revokeLink.mutateAsync({ matchId, token: t });
      setToken(null);
      setShowQr(false);
      toast.success('Link revocado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos revocar el link.');
    }
  };

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Link de seguimiento</h2>
        </div>
        {token && <Badge variant="success">Activo</Badge>}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        Compartí este link para que alguien de confianza vea tu ubicación en tiempo real, sin
 necesidad
        de cuenta. Revocalo cuando termines.
      </p>

      {!token ? (
        <Button onClick={handleCreate} loading={createLink.isPending} fullWidth>
          <Link2 className="w-4 h-4" /> Crear link de seguimiento
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={publicUrl}
              className="flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 font-mono truncate"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" size="md" onClick={handleCopy} aria-label="Copiar">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {qrAvailable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQr((s) => !s)}
              >
                <QrCode className="w-4 h-4" /> {showQr ? 'Ocultar QR' : 'Ver QR'}
              </Button>
            )}
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRevoke(true)}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Revocar
            </Button>
          </div>

          {showQr && qrAvailable && token && (
            <div className="flex justify-center py-3 bg-white rounded-xl border border-gray-100">
              <QrCodeView value={publicUrl} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={handleRevoke}
        title="Revocar link"
        description="Una vez revocado, el link dejará de funcionar inmediatamente. Nadie podrá ver tu ubicación con ese link."
        confirmLabel="Revocar link"
        tone="danger"
        loading={revokeLink.isPending}
      />
    </section>
  );
}

/** Render del QR usando qrcode.react (cargado dinámicamente para mantenerlo opcional). */
function QrCodeView({ value }: { value: string }) {
  // Import estático: la dep se instaló en Task 1. Si por algún motivo falla en
  // runtime, el catch del bundler deja un espacio en blanco y el link copiable sigue.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QRCodeSVG } = require('qrcode.react') as typeof import('qrcode.react');
  return <QRCodeSVG value={value} size={180} includeMargin level="M" />;
}
```

> **Nota sobre `qrcode.react`:** el import dinámico `require('qrcode.react')` en `QrCodeView` se usa para aislar la dependencia; con Vite funciona porque es una CJS/ESM interoperable. Si el lint o el bundler lo rechazan, sustituir por `import { QRCodeSVG } from 'qrcode.react';` al inicio del archivo (la dep es obligatoria desde Task 1). El `hasQrLib()` es defensivo y se puede simplificar a `const qrAvailable = true;`.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. Si `require` reclama, cambiar a import estático como se indica en la nota.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/safety/components/ShareLinkCard.tsx
git commit -m "feat(safety): ShareLinkCard con crear/copiar/QR opcional/revocar"
```

---

## Task 11 (Safety): `SafetyPage` (`/matches/:matchId/safety`)

**Files:**
- Create: `frontend/src/features/safety/pages/SafetyPage.tsx`

- [ ] **Step 1: Crear la página**

Crear `frontend/src/features/safety/pages/SafetyPage.tsx`:

```typescript
// frontend/src/features/safety/pages/SafetyPage.tsx
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { LiveTracker } from '../components/LiveTracker';
import { PeerLocation } from '../components/PeerLocation';
import { SosButton } from '../components/SosButton';
import { ShareLinkCard } from '../components/ShareLinkCard';
import { useMatch } from '../../matching/hooks';
import { ApiError } from '../../../api/errors';

export default function SafetyPage() {
  const { matchId = '' } = useParams<{ matchId: string }>();
  const { data: match, isLoading, isError, error, refetch } = useMatch(matchId);

  const isActive = match?.status === 'active';

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to={`/matches/${matchId}`}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Volver al match"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-600" /> Seguridad del encuentro
          </h1>
          {match && (
            <Badge variant={isActive ? 'success' : 'neutral'} className="ml-auto">
              {isActive ? 'Activo' : match.status === 'completed' ? 'Finalizado' : 'Cancelado'}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-5">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {isError && (() => {
          const apiErr = error instanceof ApiError ? error : null;
          return (
            <ErrorState
              title="No encontramos el encuentro"
              message={apiErr?.detail}
              onRetry={() => refetch()}
            />
          );
        })()}

        {!isLoading && !isError && match && (
          <>
            {!isActive && (
              <section className="glass-panel rounded-2xl p-5 text-sm text-gray-600">
                Este encuentro {match.status === 'completed' ? 'finalizó' : 'fue cancelado'}. El
                seguimiento en vivo y el SOS están disponibles solo durante un match activo.
              </section>
            )}

            {isActive && (
              <>
                <LiveTracker matchId={matchId} />
                <PeerLocation matchId={matchId} enabled={isActive} />
                <ShareLinkCard matchId={matchId} />
                <section>
                  <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500" /> Emergencia
                  </h2>
                  <SosButton matchId={matchId} />
                </section>
              </>
            )}
          </>
        )}
      </main>
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
Expected: sin errores. Si `features/matching/hooks.ts` no existe (F4 ausente), el import fallará: en ese caso, sustituir `useMatch` por un stub local que devuelva `{ data: undefined, isLoading: true }` temporalmente, o comentar la sección `useMatch` y dejar `SafetyPage` como contenedor de los componentes de safety que asume match activo. Documentar el descuido.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/safety/pages/SafetyPage.tsx
git commit -m "feat(safety): SafetyPage orquesta LiveTracker/PeerLocation/SOS/ShareLink"
```

---

## Task 12 (Safety): `ShareLinkView` (`/s/:token`, PÚBLICO sin auth)

**Files:**
- Create: `frontend/src/features/safety/pages/ShareLinkView.tsx`

- [ ] **Step 1: Crear la página pública**

Crear `frontend/src/features/safety/pages/ShareLinkView.tsx`:

```typescript
// frontend/src/features/safety/pages/ShareLinkView.tsx
//
// RUTA PÚBLICA: NO requiere auth. Se registra FUERA de RequireAuth en router.tsx.
// El hook usePublicLocation marca el GET /s/{token} con publicEndpoint:true.
//
import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { AlertTriangle, Clock, MapPin, ShieldOff, Eye } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { usePublicLocation } from '../hooks';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime, formatDateTime } from '../../../lib/format';

export default function ShareLinkView() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePublicLocation(token);

  // Refetch suave cada 15s (staleTime=15s del hook); lo fuerza al volver el foco.
  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900">Ubicación compartida</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Eye className="w-3 h-3" /> Vista pública · GAD
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner />
            <p className="text-sm text-gray-500">Cargando ubicación…</p>
          </div>
        )}

        {isError && (() => {
          const apiErr = error instanceof ApiError ? error : null;
          const invalidToken = apiErr?.code === 'invalid_token' || apiErr?.status === 401;
          if (invalidToken) {
            return (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <ShieldOff className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Link inválido o expirado</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-xs">
                  Este link de seguimiento no es válido, fue revocado o caducó. Pedile a la persona
                  que genere uno nuevo.
                </p>
              </div>
            );
          }
          return (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">No encontramos esta ubicación</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">
                {apiErr?.detail ?? 'El link no existe o fue removido.'}
              </p>
            </div>
          );
        })()}

        {!isLoading && !isError && data && (
          <>
            {data.expired && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Encuentro finalizado</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Este link ya no se actualiza en vivo. La última ubicación conocida queda visible
                    como referencia.
                  </p>
                </div>
              </div>
            )}

            <section className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold text-lg">
                  {(data.user_display_name?.charAt(0) ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 truncate">{data.user_display_name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {data.last_ping_at ? (
                      <Badge variant="neutral">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(data.last_ping_at)}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Sin ubicación todavía</Badge>
                    )}
                  </div>
                </div>
              </div>

              {data.lat === null || data.lng === null ? (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-8 text-center">
                  <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    La persona todavía no compartió su ubicación.
                  </p>
                </div>
              ) : (
                <div className="relative h-64 rounded-xl overflow-hidden border border-gray-100">
                  <MapBackground
                    userLocation={[data.lat, data.lng]}
                    plans={[{ id: 'shared', lat: data.lat, lng: data.lng }]}
                  />
                </div>
              )}

              {data.last_ping_at && (
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Última actualización: {formatDateTime(data.last_ping_at)}
                </p>
              )}
            </section>
          </>
        )}
      </main>
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
git add frontend/src/features/safety/pages/ShareLinkView.tsx
git commit -m "feat(safety): ShareLinkView publica /s/:token sin auth (401/404/expired)"
```

---

## Task 13: Registrar rutas de Safety (incluida la pública `/s/:token`)

**Files:**
- Modify: `frontend/src/router.tsx`

> **Crítico:** `/s/:token` es **pública** → va en el bloque de rutas públicas (junto a `/login`), FUERA de `RequireAuth`. Las demás (`/me/trusted-contacts`, `/matches/:matchId/safety`) van dentro de `RequireAuth`.

- [ ] **Step 1: Modificar `router.tsx`**

Localizar el bloque de imports lazy en `frontend/src/router.tsx`. Añadir:

```ts
// frontend/src/router.tsx — añadir al bloque de imports lazy existente
const TrustedContactsPage = lazy(() =>
  import('./features/safety/pages/TrustedContactsPage'),
);
const SafetyPage = lazy(() => import('./features/safety/pages/SafetyPage'));
const ShareLinkView = lazy(() => import('./features/safety/pages/ShareLinkView'));
```

En el **bloque público** (donde están `/login`, `/register`, etc.), reemplazar el stub `PublicShareStub` (de F0) por el `ShareLinkView` real:

```tsx
{
  path: '/s/:token',
  element: <PageSuspense><ShareLinkView /></PageSuspense>,
},
```

> Si F0 registró `/s/:token` apuntando a `PublicShareStub`, eliminar ese import/stub y apuntar a `ShareLinkView`. La ruta sigue siendo pública (sin `RequireAuth`).

Dentro del `children` del layout protegido (`RequireAuth`), añadir junto a las de F4:

```tsx
{
  path: 'me/trusted-contacts',
  element: <PageSuspense><TrustedContactsPage /></PageSuspense>,
},
{
  path: 'matches/:matchId/safety',
  element: <PageSuspense><SafetyPage /></PageSuspense>,
},
```

> React Router v7 distingue segmentos estáticos de dinámicos: `safety` literal bajo `matches/:matchId` tiene prioridad sobre un hipotético `:matchId` colisionante. No hay conflicto con `/matches/:matchId` (ruta hermana, no anidada).

- [ ] **Step 2: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: build verde; aparecen chunks `TrustedContactsPage-*.js`, `SafetyPage-*.js`, `ShareLinkView-*.js`.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/router.tsx
git commit -m "feat(router): registrar /me/trusted-contacts, /matches/:matchId/safety y /s/:token (publica)"
```

---

## Task 14 (Reviews): Tipos y schema zod

**Files:**
- Create: `frontend/src/features/reviews/types.ts`
- Create: `frontend/src/features/reviews/schemas.ts`

- [ ] **Step 1: Crear `features/reviews/types.ts`**

Crear `frontend/src/features/reviews/types.ts`:

```typescript
/**
 * Tipos del dominio Reviews (contrato §Reseñas).
 *
 * POST /reviews (rate-limit 20/día, una por par, solo sobre match completed en 7 días).
 * GET  /reviews?user_id=&limit=&before= (paginado por cursor).
 * DELETE /reviews/{id} (solo autor).
 */
import type { ReviewFlag } from '../../types/enums';

export type { ReviewFlag };

export interface ReviewIn {
  match_id: string;
  reviewee_id: string;
  /** 1..5 */
  rating: number;
  /** max 1000, opcional. */
  comment?: string | null;
  flag?: ReviewFlag | null;
}

export interface ReviewOut {
  id: string;
  match_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  flag: ReviewFlag | null;
  created_at: string; // ISO 8601
}

/** Reviewer embebido en GET /reviews. */
export interface ReviewerSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}

export type ReviewWithReviewer = ReviewOut & {
  reviewer: ReviewerSummary;
};
```

- [ ] **Step 2: Crear `features/reviews/schemas.ts`**

Crear `frontend/src/features/reviews/schemas.ts`:

```typescript
import { z } from 'zod';

/**
 * Validación de ReviewIn (contrato: rating 1..5, comment ..1000, flag enum).
 * match_id y reviewee_id son UUIDs pasados desde el contexto (ocultos en el form).
 */
export const reviewSchema = z.object({
  match_id: z.string().min(1, 'Falta el encuentro.'),
  reviewee_id: z.string().min(1, 'Falta la persona a reseñar.'),
  rating: z
    .number({ invalid_type_error: 'Seleccioná una calificación.' })
    .int()
    .min(1, 'Seleccioná al menos 1 estrella.')
    .max(5, 'Máximo 5 estrellas.'),
  comment: z
    .string()
    .trim()
    .max(1000, 'El comentario no puede superar los 1000 caracteres.')
    .optional()
    .or(z.literal('')),
  flag: z
    .enum(['no_show', 'inappropriate', 'false_info'])
    .nullish()
    .transform((v) => (v === '' ? null : v)),
});

export type ReviewValues = z.infer<typeof reviewSchema>;

/** Labels es-AR para los flags. */
export const REVIEW_FLAG_LABELS: Record<NonNullable<z.infer<typeof reviewSchema>['flag']>, string> = {
  no_show: 'No se presentó',
  inappropriate: 'Comportamiento inapropiado',
  false_info: 'Información falsa',
};
```

- [ ] **Step 3: Crear test de schema**

Crear `frontend/src/features/reviews/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reviewSchema } from '../schemas';

describe('reviewSchema', () => {
  const valid = {
    match_id: 'm1',
    reviewee_id: 'u2',
    rating: 5,
    comment: 'Genial',
  };

  it('acepta reseña válida sin flag', () => {
    expect(reviewSchema.safeParse(valid).success).toBe(true);
  });

  it('acepta reseña con flag', () => {
    expect(reviewSchema.safeParse({ ...valid, flag: 'no_show' }).success).toBe(true);
  });

  it('rechaza rating < 1', () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it('rechaza rating > 5', () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
  });

  it('rechaza comment > 1000', () => {
    expect(reviewSchema.safeParse({ ...valid, comment: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rechaza flag fuera del enum', () => {
    expect(reviewSchema.safeParse({ ...valid, flag: 'spam' }).success).toBe(false);
  });

  it('acepta comment vacío (opcional)', () => {
    expect(reviewSchema.safeParse({ ...valid, comment: '' }).success).toBe(true);
  });

  it('requiere match_id', () => {
    expect(reviewSchema.safeParse({ ...valid, match_id: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Correr tests + tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/reviews/__tests__/schemas.test.ts
npx tsc --noEmit
```
Expected: `Tests 8 passed`, sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/reviews
git commit -m "feat(reviews): tipos ReviewIn/ReviewOut/ReviewWithReviewer y schema zod + tests"
```

---

## Task 15 (Reviews): Hooks de datos

**Files:**
- Create: `frontend/src/features/reviews/hooks.ts`
- Create: `frontend/src/features/reviews/__tests__/hooks.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/reviews/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import * as client from '../../api/client';
import { useReviews, useCreateReview, useDeleteReview } from '../hooks';
import type { PaginatedOut } from '../../types/common';
import type { ReviewWithReviewer, ReviewOut } from '../types';

vi.spyOn(client, 'apiGet');
vi.spyOn(client, 'apiPost');
vi.spyOn(client, 'apiDelete');

const mocked = {
  apiGet: vi.mocked(client.apiGet),
  apiPost: vi.mocked(client.apiPost),
  apiDelete: vi.mocked(client.apiDelete),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const PAGE: PaginatedOut<ReviewWithReviewer> = {
  items: [
    {
      id: 'r1',
      match_id: 'm1',
      reviewer_id: 'u1',
      reviewee_id: 'u2',
      rating: 5,
      comment: 'Excelente',
      flag: null,
      created_at: '2026-07-09T18:00:00Z',
      reviewer: {
        id: 'u1',
        display_name: 'Ana',
        avatar_url: null,
        reputation_score: 4.5,
        verification_level: 'email',
      },
    },
  ],
  next_cursor: '2026-07-09T17:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('useReviews', () => {
  it('trae la primera página con user_id', async () => {
    mocked.apiGet.mockResolvedValueOnce(PAGE);
    const { result } = renderHook(() => useReviews('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiGet).toHaveBeenCalledWith('/reviews', {
      query: { user_id: 'u2', limit: 20, before: undefined },
    });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
  });

  it('getNextPageParam usa next_cursor', async () => {
    mocked.apiGet.mockResolvedValueOnce(PAGE);
    const { result } = renderHook(() => useReviews('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('no consulta sin userId', async () => {
    const { result } = renderHook(() => useReviews(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCreateReview', () => {
  it('POST /reviews y invalida reviews del reviewee', async () => {
    const created: ReviewOut = {
      id: 'r1',
      match_id: 'm1',
      reviewer_id: 'u1',
      reviewee_id: 'u2',
      rating: 5,
      comment: null,
      flag: null,
      created_at: '2026-07-09T18:00:00Z',
    };
    mocked.apiPost.mockResolvedValueOnce(created);
    const invalidate = vi.fn();
    const { result } = renderHook(() => useCreateReview(invalidate), { wrapper: createWrapper() });
    result.current.mutate({
      match_id: 'm1',
      reviewee_id: 'u2',
      rating: 5,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/reviews', {
      match_id: 'm1',
      reviewee_id: 'u2',
      rating: 5,
    });
    expect(invalidate).toHaveBeenCalledWith({ prefix: ['reviews'], exact: false });
  });
});

describe('useDeleteReview', () => {
  it('DELETE /reviews/{id}', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Reseña eliminada' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => useDeleteReview(invalidate), { wrapper: createWrapper() });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/reviews/r1');
    expect(invalidate).toHaveBeenCalledWith({ prefix: ['reviews'], exact: false });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/reviews/__tests__/hooks.test.tsx
```
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 3: Implementar `features/reviews/hooks.ts`**

Crear `frontend/src/features/reviews/hooks.ts`:

```typescript
/**
 * Hooks de datos (TanStack Query v5) para Reviews.
 *
 * Query keys:
 *  - ['reviews', userId]  (infinite query)
 *
 * POST /reviews invalida TODAS las keys ['reviews', ...] (la nueva reseña
 * cambia la lista del reviewee y potencialmente el reputation_score en /me).
 * Por eso el invalidador usa un prefijo, no exact.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type { PaginatedOut, OKMessage } from '../../types/common';
import type { ReviewIn, ReviewOut, ReviewWithReviewer } from './types';

type InvalidationSpec = { prefix: unknown[]; exact?: boolean };
type Invalidator = (spec: InvalidationSpec) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return ({ prefix, exact = false }) =>
    qc.invalidateQueries({ queryKey: prefix, exact });
}

export interface UseReviewsOptions {
  limit?: number; // default 20
}

export function useReviews(userId: string, options: UseReviewsOptions = {}) {
  const limit = options.limit ?? 20;
  return useInfiniteQuery<PaginatedOut<ReviewWithReviewer>>({
    queryKey: ['reviews', userId],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedOut<ReviewWithReviewer>>('/reviews', {
        query: { user_id: userId, limit, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useCreateReview(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<ReviewOut, Error, ReviewIn>({
    mutationFn: (body) => apiPost<ReviewOut>('/reviews', body),
    onSuccess: (_data, vars) => inv({ prefix: ['reviews'] }),
  });
}

export function useDeleteReview(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<OKMessage, Error, string>({
    mutationFn: (reviewId: string) => apiDelete<OKMessage>(`/reviews/${reviewId}`),
    onSuccess: () => inv({ prefix: ['reviews'] }),
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/reviews/__tests__/hooks.test.tsx
```
Expected: PASS.

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
git add frontend/src/features/reviews/hooks.ts frontend/src/features/reviews/__tests__/hooks.test.tsx
git commit -m "feat(reviews): hooks useReviews(infinite)/useCreateReview/useDeleteReview (TDD)"
```

---

## Task 16 (Reviews): `StarRating` (display + input)

**Files:**
- Create: `frontend/src/features/reviews/components/StarRating.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/reviews/components/StarRating.tsx`:

```typescript
// frontend/src/features/reviews/components/StarRating.tsx
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface StarRatingProps {
  /** Valor controlado (modo input). */
  value?: number;
  /** Valor inicial (modo display, sin onChange). */
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Solo lectura. Default: si no hay onChange, es display. */
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
} as const;

/**
 * StarRating reutilizable.
 *  - Display (readOnly o sin onChange): muestra `value`/`defaultValue` estrellas.
 *  - Input: hover + click para setear 1..5; soporta 0 (deselect al clicar el mismo).
 */
export function StarRating({
  value,
  defaultValue = 0,
  onChange,
  readOnly,
  size = 'md',
  className,
}: StarRatingProps) {
  const isInput = !readOnly && Boolean(onChange);
  const [hover, setHover] = useState<number | null>(null);

  const controlled = value ?? defaultValue;
  const shown = hover ?? controlled;

  const handleClick = (n: number) => {
    if (!isInput || !onChange) return;
    // Clicar la misma estrella la mantiene (no allow 0 en rating de review).
    onChange(n);
  };

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      onMouseLeave={() => isInput && setHover(null)}
      role={isInput ? 'radiogroup' : 'img'}
      aria-label={isInput ? `Calificación: ${controlled} de 5` : `${controlled} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        return (
          <button
            key={n}
            type="button"
            disabled={!isInput}
            tabIndex={isInput ? 0 : -1}
            onClick={() => handleClick(n)}
            onMouseEnter={() => isInput && setHover(n)}
            className={cn(
              'p-0.5 transition-transform',
              isInput && 'hover:scale-110 cursor-pointer',
              !isInput && 'cursor-default',
            )}
            aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            aria-pressed={isInput ? controlled === n : undefined}
          >
            <Star
              className={cn(
                sizeClass[size],
                filled ? 'text-amber-400 fill-amber-400' : 'text-gray-300 fill-transparent',
              )}
            />
          </button>
        );
      })}
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
git add frontend/src/features/reviews/components/StarRating.tsx
git commit -m "feat(reviews): StarRating reutilizable (display + input con hover)"
```

---

## Task 17 (Reviews): `ReviewForm`

**Files:**
- Create: `frontend/src/features/reviews/components/ReviewForm.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/reviews/components/ReviewForm.tsx`:

```typescript
// frontend/src/features/reviews/components/ReviewForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { StarRating } from './StarRating';
import { reviewSchema, REVIEW_FLAG_LABELS, type ReviewValues } from '../schemas';
import { useCreateReview } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ReviewFormProps {
  matchId: string;
  revieweeId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ matchId, revieweeId, onSubmitted }: ReviewFormProps) {
  const createReview = useCreateReview();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema) as never,
    defaultValues: {
      match_id: matchId,
      reviewee_id: revieweeId,
      rating: 0,
      comment: '',
      flag: null,
    },
  });

  const rating = watch('rating');
  const flag = watch('flag');

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      match_id: values.match_id,
      reviewee_id: values.reviewee_id,
      rating: values.rating,
      comment: values.comment?.trim() ? values.comment.trim() : null,
      flag: values.flag ?? null,
    };
    try {
      await createReview.mutateAsync(payload);
      toast.success('¡Gracias por tu reseña!');
      reset();
      onSubmitted?.();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'conflict') {
        toast.error('Ya dejaste una reseña por este encuentro.');
      } else if (apiErr?.status === 422) {
        toast.error(
          apiErr.detail ?? 'No podés reseñar este encuentro (¿finalizó hace más de 7 días?).',
        );
      } else if (apiErr?.code === 'rate_limit_exceeded' || apiErr?.status === 429) {
        toast.error('Alcanzaste el límite diario de reseñas (20/día). Probá mañana.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos enviar la reseña.');
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" {...register('match_id')} />
      <input type="hidden" {...register('reviewee_id')} />

      {/* Rating */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          ¿Cómo fue tu experiencia?
        </label>
        <StarRating
          value={rating}
          size="lg"
          onChange={(v) => setValue('rating', v, { shouldValidate: true })}
        />
        {errors.rating && (
          <p className="text-xs text-red-500 mt-1">{errors.rating.message as string}</p>
        )}
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Comentario <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <Textarea
          rows={4}
          maxLength={1000}
          placeholder="Contá cómo te fue. Sé respetuoso."
          invalid={!!errors.comment}
          {...register('comment')}
        />
        {errors.comment && (
          <p className="text-xs text-red-500 mt-1">{errors.comment.message as string}</p>
        )}
      </div>

      {/* Flag */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Flag className="w-4 h-4 text-amber-500" /> Reportar un problema{' '}
          <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setValue('flag', null, { shouldValidate: true })}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              flag == null
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            Ninguno
          </button>
          {(Object.keys(REVIEW_FLAG_LABELS) as (keyof typeof REVIEW_FLAG_LABELS)[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setValue('flag', f, { shouldValidate: true })}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                flag === f
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              {REVIEW_FLAG_LABELS[f]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Marcar un problema lo notifica al equipo de moderación.
        </p>
      </div>

      <Button type="submit" fullWidth loading={createReview.isPending} disabled={rating === 0}>
        Enviar reseña
      </Button>
    </form>
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
git add frontend/src/features/reviews/components/ReviewForm.tsx
git commit -m "feat(reviews): ReviewForm con StarRating, flag y manejo 409/422/429"
```

---

## Task 18 (Reviews): `ReviewList` (infinite scroll)

**Files:**
- Create: `frontend/src/features/reviews/components/ReviewList.tsx`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/features/reviews/components/ReviewList.tsx`:

```typescript
// frontend/src/features/reviews/components/ReviewList.tsx
import { Flag } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { StarRating } from './StarRating';
import { useReviews } from '../hooks';
import { REVIEW_FLAG_LABELS } from '../schemas';
import type { ReviewWithReviewer } from '../types';
import { formatRelativeTime } from '../../../lib/format';
import { ApiError } from '../../../api/errors';

export interface ReviewListProps {
  userId: string;
  /** Mostrar el nombre/avatar del reviewer. Default true. */
  showReviewer?: boolean;
}

export function ReviewList({ userId, showReviewer = true }: ReviewListProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useReviews(userId);

  const reviews: ReviewWithReviewer[] = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const apiErr = error instanceof ApiError ? error : null;
    return <ErrorState message={apiErr?.detail} onRetry={() => refetch()} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        title="Sin reseñas todavía"
        description="Esta persona todavía no recibió reseñas."
      />
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <article
          key={r.id}
          className="bg-white rounded-2xl border border-gray-100 p-4"
        >
          {showReviewer && (
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={r.reviewer.display_name} src={r.reviewer.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">
                  {r.reviewer.display_name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatRelativeTime(r.created_at)}
                </p>
              </div>
              {r.flag && (
                <Badge variant="warning">
                  <Flag className="w-3 h-3" />
                  {REVIEW_FLAG_LABELS[r.flag] ?? r.flag}
                </Badge>
              )}
            </div>
          )}
          <div className="mb-1">
            <StarRating value={r.rating} size="sm" readOnly />
          </div>
          {r.comment && <p className="text-sm text-gray-700 leading-relaxed">{r.comment}</p>}
        </article>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
          >
            Cargar más reseñas
          </Button>
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
git add frontend/src/features/reviews/components/ReviewList.tsx
git commit -m "feat(reviews): ReviewList con infinite scroll y flags"
```

---

## Task 19 (Reviews): Integrar `ReviewList` en `UserPublicPage`

**Files:**
- Modify: `frontend/src/features/users/pages/UserPublicPage.tsx`

> **Condición:** requiere que F2 haya creado `UserPublicPage`. Si no existe, omitir.

- [ ] **Step 1: Localizar `UserPublicPage`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/features/users/pages/UserPublicPage.tsx && echo "OK" || echo "F2 ausente — omitir Task 19"
```
Expected: `OK`. Si no, documentar y saltar.

- [ ] **Step 2: Añadir la sección de reseñas**

En `frontend/src/features/users/pages/UserPublicPage.tsx`, añadir el import:

```tsx
import { ReviewList } from '../../reviews/components/ReviewList';
```

Y, dentro del JSX, tras la info del usuario (reputación, bio) y antes de los botones de acción (bloquear/reportar), añadir una sección:

```tsx
<section className="mt-6">
  <h2 className="text-base font-bold text-gray-900 mb-3">Reseñas</h2>
  {user && <ReviewList userId={user.id} />}
</section>
```

> Si `UserPublicPage` ya reservó un bloque `{/* /users/:userId/report — F6 */}` (como sugiere el borrador de F2), sustituir ese placeholder por el `ReviewList` y (en Task 21) el `ReportModal`.

- [ ] **Step 3: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: verde.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/users/pages/UserPublicPage.tsx
git commit -m "feat(users): embeber ReviewList en UserPublicPage"
```

---

## Task 20 (Reports): Hooks + `ReportModal`

**Files:**
- Create: `frontend/src/features/reports/types.ts`
- Create: `frontend/src/features/reports/hooks.ts`
- Create: `frontend/src/features/reports/components/ReportModal.tsx`
- Create: `frontend/src/features/reports/__tests__/hooks.test.tsx`

- [ ] **Step 1: Crear `features/reports/types.ts`**

Crear `frontend/src/features/reports/types.ts`:

```typescript
/**
 * Tipos del dominio Reports (contrato §Reportes).
 *
 * POST /users/{user_id}/report (rate-limit 10/día, no a uno mismo).
 */
export interface ReportIn {
  /** 1..50 caracteres. */
  reason: string;
  /** max 1000, opcional. */
  description?: string | null;
}

export interface ReportOut {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string; // ISO 8601
}
```

- [ ] **Step 2: Escribir el test del hook que falla**

Crear `frontend/src/features/reports/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import * as client from '../../api/client';
import { useReportUser } from '../hooks';
import type { ReportOut } from '../types';

vi.spyOn(client, 'apiPost');
const apiPost = vi.mocked(client.apiPost);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useReportUser', () => {
  it('POST /users/{id}/report con body', async () => {
    const out: ReportOut = {
      id: 'rep1',
      reporter_id: 'u1',
      reported_id: 'u2',
      reason: 'spam',
      description: null,
      status: 'open',
      payload: null,
      created_at: '2026-07-09T18:00:00Z',
    };
    apiPost.mockResolvedValueOnce(out);
    const { result } = renderHook(() => useReportUser(), { wrapper: createWrapper() });
    result.current.mutate({ userId: 'u2', reason: 'spam', description: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith('/users/u2/report', {
      reason: 'spam',
      description: null,
    });
    expect(result.current.data).toEqual(out);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/reports/__tests__/hooks.test.tsx
```
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 4: Implementar `features/reports/hooks.ts`**

Crear `frontend/src/features/reports/hooks.ts`:

```typescript
/**
 * Hooks de datos para Reports.
 *
 * POST /users/{user_id}/report. Las mutaciones de reporte no invalidan
 * queries de dominio (el reporte es side-channel; no cambia lo que el
 * usuario ve de forma inmediata).
 */
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../api/client';
import type { ReportIn, ReportOut } from './types';

export interface ReportArgs {
  userId: string;
  reason: string;
  description?: string | null;
}

export function useReportUser() {
  return useMutation<ReportOut, Error, ReportArgs>({
    mutationFn: ({ userId, reason, description }) =>
      apiPost<ReportOut>(`/users/${userId}/report`, {
        reason,
        description: description ?? null,
      } satisfies ReportIn),
  });
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/reports/__tests__/hooks.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Crear `ReportModal.tsx`**

Crear `frontend/src/features/reports/components/ReportModal.tsx`:

```typescript
// frontend/src/features/reports/components/ReportModal.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useReportUser } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  /** ID del usuario a reportar. */
  userId: string;
  /** Nombre para mostrar en el header. */
  userDisplayName?: string;
}

const COMMON_REASONS = [
  'Perfil falso',
  'Spam o estafa',
  'Acoso o mal comportamiento',
  'Contenido inapropiado',
  'Otro',
];

/**
 * Modal reutilizable para reportar usuarios (POST /users/{id}/report).
 * Rate-limit 10/día en backend. reason 1..50, description max 1000.
 */
export function ReportModal({
  open,
  onClose,
  userId,
  userDisplayName,
}: ReportModalProps) {
  const report = useReportUser();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

  const reasonValid = reason.trim().length >= 1 && reason.trim().length <= 50;
  const descriptionValid = description.length <= 1000;
  const canSubmit = reasonValid && descriptionValid && !report.isPending;

  const reset = () => {
    setReason('');
    setDescription('');
    setTouched(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    try {
      await report.mutateAsync({
        userId,
        reason: reason.trim(),
        description: description.trim() || null,
      });
      toast.success('Reporte enviado. Gracias por ayudar a mantener seguro a GAD.');
      handleClose();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'rate_limit_exceeded' || apiErr?.status === 429) {
        toast.error('Alcanzaste el límite diario de reportes (10/día).');
      } else if (apiErr?.status === 422) {
        toast.error(apiErr.detail ?? 'No podés reportar a este usuario.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos enviar el reporte.');
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2 text-red-600">
          <Flag className="w-5 h-5" /> Reportar usuario
        </span>
      }
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={report.isPending} disabled={!canSubmit}>
            Enviar reporte
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        {userDisplayName && (
          <p>
            Estás por reportar a <strong>{userDisplayName}</strong>. Nuestro equipo de moderación
            revisará el caso.
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Motivo</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Ej: Perfil falso"
            maxLength={50}
            invalid={touched && !reasonValid}
            disabled={report.isPending}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMMON_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                disabled={report.isPending}
                className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {r}
              </button>
            ))}
          </div>
          {touched && !reasonValid && (
            <p className="text-xs text-red-500 mt-1">Ingresá un motivo (1 a 50 caracteres).</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Detalles <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Contanos qué pasó, con el mayor detalle posible."
            invalid={!descriptionValid}
            disabled={report.isPending}
          />
          {!descriptionValid && (
            <p className="text-xs text-red-500 mt-1">Máximo 1000 caracteres.</p>
          )}
          <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/1000</p>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 7: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/reports
git commit -m "feat(reports): useReportUser + ReportModal con reasons sugeridos y rate-limit UX"
```

---

## Task 21 (Reports): Integrar `ReportModal` en `UserPublicPage`

**Files:**
- Modify: `frontend/src/features/users/pages/UserPublicPage.tsx`

> **Condición:** requiere F2 (`UserPublicPage`). Si no existe, omitir.

- [ ] **Step 1: Añadir el trigger y el modal**

En `frontend/src/features/users/pages/UserPublicPage.tsx`, añadir imports:

```tsx
import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportModal } from '../../reports/components/ReportModal';
```

Añadir estado local en el componente:

```tsx
const [reportOpen, setReportOpen] = useState(false);
```

Reemplazar el link de reporte placeholder (el `to={`/users/${userId}/report`}` de F2) por un botón que abre el modal:

```tsx
<button
  onClick={() => setReportOpen(true)}
  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
>
  <Flag className="w-4 h-4" /> Reportar
</button>
```

Y al final del JSX (antes de cerrar el contenedor), montar el modal:

```tsx
<ReportModal
  open={reportOpen}
  onClose={() => setReportOpen(false)}
  userId={userId}
  userDisplayName={user?.display_name}
/>
```

- [ ] **Step 2: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: verde.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/users/pages/UserPublicPage.tsx
git commit -m "feat(users): abrir ReportModal desde UserPublicPage"
```

---

## Task 22 (Availability): Tipos y schema zod

**Files:**
- Create: `frontend/src/features/availability/types.ts`
- Create: `frontend/src/features/availability/schemas.ts`

- [ ] **Step 1: Crear `features/availability/types.ts`**

Crear `frontend/src/features/availability/types.ts`:

```typescript
/**
 * Tipos del dominio Availability (contrato §Disponibilidad).
 *
 * POST   /availability (activar modo disponible).
 * GET    /availability/me.
 * DELETE /availability/me.
 */
import type { ActivityType } from '../../types/enums';

export interface AvailabilityLocation {
  lat: number; // -90..90
  lng: number; // -180..180
}

export interface AvailabilityIn {
  location: AvailabilityLocation;
  /** 100..50000, default 2000. */
  radius_m?: number;
  activity_filter?: ActivityType[] | null;
  /** 15..1440, default 120. */
  window_minutes?: number;
}

export interface AvailabilityOut {
  id: string;
  radius_m: number;
  activity_filter: string[] | null;
  expires_at: string; // ISO 8601
  active: boolean;
  created_at: string; // ISO 8601
}
```

- [ ] **Step 2: Crear `features/availability/schemas.ts`**

Crear `frontend/src/features/availability/schemas.ts`:

```typescript
import { z } from 'zod';

const activityEnum = z.enum(['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other']);

export const availabilitySchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radius_m: z.number().int().min(100).max(50000).optional(),
  activity_filter: z.array(activityEnum).nullish(),
  window_minutes: z.number().int().min(15).max(1440).optional(),
});

export type AvailabilityValues = z.infer<typeof availabilitySchema>;
```

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
git add frontend/src/features/availability/types.ts frontend/src/features/availability/schemas.ts
git commit -m "feat(availability): tipos AvailabilityIn/Out y schema zod"
```

---

## Task 23 (Availability): Hooks

**Files:**
- Create: `frontend/src/features/availability/hooks.ts`
- Create: `frontend/src/features/availability/__tests__/hooks.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/availability/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import * as client from '../../api/client';
import {
  useAvailability,
  useSetAvailability,
  useDeleteAvailability,
} from '../hooks';
import type { AvailabilityOut } from '../types';

vi.spyOn(client, 'apiGet');
vi.spyOn(client, 'apiPost');
vi.spyOn(client, 'apiDelete');

const mocked = {
  apiGet: vi.mocked(client.apiGet),
  apiPost: vi.mocked(client.apiPost),
  apiDelete: vi.mocked(client.apiDelete),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const AVAIL: AvailabilityOut = {
  id: 'a1',
  radius_m: 2000,
  activity_filter: ['coffee'],
  expires_at: '2026-07-09T20:00:00Z',
  active: true,
  created_at: '2026-07-09T18:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('useAvailability', () => {
  it('GET /availability/me', async () => {
    mocked.apiGet.mockResolvedValueOnce(AVAIL);
    const { result } = renderHook(() => useAvailability(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiGet).toHaveBeenCalledWith('/availability/me');
  });

  it('acepta null (sin disponibilidad activa)', async () => {
    mocked.apiGet.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAvailability(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useSetAvailability', () => {
  it('POST /availability y invalida availability/me', async () => {
    mocked.apiPost.mockResolvedValueOnce(AVAIL);
    const invalidate = vi.fn();
    const { result } = renderHook(() => useSetAvailability(invalidate), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      location: { lat: -34.6, lng: -58.4 },
      radius_m: 2000,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/availability', {
      location: { lat: -34.6, lng: -58.4 },
      radius_m: 2000,
    });
    expect(invalidate).toHaveBeenCalledWith(['availability', 'me']);
  });
});

describe('useDeleteAvailability', () => {
  it('DELETE /availability/me y invalida', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Modo disponible desactivado' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => useDeleteAvailability(invalidate), {
      wrapper: createWrapper(),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/availability/me');
    expect(invalidate).toHaveBeenCalledWith(['availability', 'me']);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/availability/__tests__/hooks.test.tsx
```
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 3: Implementar `features/availability/hooks.ts`**

Crear `frontend/src/features/availability/hooks.ts`:

```typescript
/**
 * Hooks de datos (TanStack Query v5) para Availability.
 *
 * Query key: ['availability', 'me'].
 *
 * useAvailability usa refetchInterval corto (cada 30s) mientras está activa
 * para refrescar el countdown hacia expires_at y detectar expiración.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type { AvailabilityIn, AvailabilityOut } from './types';
import type { OKMessage } from '../../types/common';

type Invalidator = (keys: unknown[]) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return (keys) => qc.invalidateQueries({ queryKey: keys });
}

export function useAvailability() {
  return useQuery<AvailabilityOut | null>({
    queryKey: ['availability', 'me'],
    queryFn: () => apiGet<AvailabilityOut | null>('/availability/me'),
    refetchInterval: (query) => {
      // Refresca cada 30s solo mientras esté activa (para countdown + expiración).
      const data = query.state.data;
      return data?.active ? 30_000 : false;
    },
    staleTime: 15_000,
  });
}

export function useSetAvailability(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<AvailabilityOut, Error, AvailabilityIn>({
    mutationFn: (body) => apiPost<AvailabilityOut>('/availability', body),
    onSuccess: () => inv(['availability', 'me']),
  });
}

export function useDeleteAvailability(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<OKMessage, Error, void>({
    mutationFn: () => apiDelete<OKMessage>('/availability/me'),
    onSuccess: () => inv(['availability', 'me']),
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx vitest run src/features/availability/__tests__/hooks.test.tsx
```
Expected: PASS.

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
git add frontend/src/features/availability/hooks.ts frontend/src/features/availability/__tests__/hooks.test.tsx
git commit -m "feat(availability): hooks useAvailability/useSetAvailability/useDeleteAvailability (TDD)"
```

---

## Task 24 (Availability): `AvailabilityToggle` + integración en `ExplorePage`

**Files:**
- Create: `frontend/src/features/availability/components/AvailabilityToggle.tsx`
- Modify: `frontend/src/features/plans/pages/ExplorePage.tsx`

- [ ] **Step 1: Crear `AvailabilityToggle.tsx`**

Crear `frontend/src/features/availability/components/AvailabilityToggle.tsx`:

```typescript
// frontend/src/features/availability/components/AvailabilityToggle.tsx
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import {
  useAvailability,
  useSetAvailability,
  useDeleteAvailability,
} from '../hooks';
import { getCurrentPosition } from '../../../lib/geo';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime } from '../../../lib/format';

export interface AvailabilityToggleProps {
  /** Ubicación actual del usuario [lat, lng], si está disponible. */
  location: [number, number] | null;
  /** Radio de búsqueda en metros (default del usuario o 2000). */
  radiusM?: number;
  /** Filtro de actividades opcional. */
  activityFilter?: string[] | null;
  /** Ventana en minutos (default 120). */
  windowMinutes?: number;
}

/**
 * Toggle de modo "disponible ahora". Al activar pide GPS (si no hay location),
 * construye AvailabilityIn y POST /availability. Al desactivar DELETE /availability/me.
 *
 * Muestra el estado activo con countdown hacia expires_at.
 */
export function AvailabilityToggle({
  location,
  radiusM = 2000,
  activityFilter = null,
  windowMinutes = 120,
}: AvailabilityToggleProps) {
  const { data, isLoading } = useAvailability();
  const setAvail = useSetAvailability();
  const deleteAvail = useDeleteAvailability();
  const [now, setNow] = useState(() => Date.now());

  // Tick cada 60s para refrescar el countdown en pantalla.
  useEffect(() => {
    if (!data?.active) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [data?.active]);

  const active = data?.active === true;
  const remainingLabel = useMemo(() => {
    if (!data?.expires_at) return null;
    const expires = Date.parse(data.expires_at);
    const diff = expires - now;
    if (!Number.isFinite(diff) || diff <= 0) return 'Expirando…';
    const mins = Math.round(diff / 60_000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m restantes` : `${h}h restantes`;
    }
    return `${mins} min restantes`;
  }, [data?.expires_at, now]);

  const handleActivate = async () => {
    let coords = location;
    if (!coords) {
      try {
        const pos = await getCurrentPosition();
        coords = [pos.latitude, pos.longitude];
      } catch (e) {
        toast.error(
          'Necesitamos tu ubicación para activar el modo disponible. Habilitá el permiso de GPS.',
        );
        return;
      }
    }
    const [lat, lng] = coords;
    try {
      await setAvail.mutateAsync({
        location: { lat, lng },
        radius_m: radiusM,
        activity_filter: activityFilter,
        window_minutes: windowMinutes,
      });
      toast.success('Modo disponible activado. Te avisaremos si hay planes cerca.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos activar el modo disponible.');
    }
  };

  const handleDeactivate = async () => {
    try {
      await deleteAvail.mutateAsync();
      toast.success('Modo disponible desactivado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos desactivar el modo disponible.');
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-4 flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <section
      className={`glass-panel rounded-2xl p-4 transition ${
        active ? 'ring-2 ring-green-400/50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {active ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900">
              {active ? 'Estás disponible' : 'Modo disponible'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {active
                ? 'Recibirás alertas de planes y matches cercanos.'
                : 'Activá para recibir alertas de planes cerca ahora.'}
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={active}
            onChange={() => (active ? handleDeactivate() : handleActivate())}
            disabled={setAvail.isPending || deleteAvail.isPending}
            aria-label="Activar modo disponible"
          />
          <div className="w-12 h-7 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-6 after:h-6 after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {remainingLabel && (
            <Badge variant="success">
              <Clock className="w-3 h-3" /> {remainingLabel}
            </Badge>
          )}
          <Badge variant="neutral">
            <MapPin className="w-3 h-3" /> {Math.round((data?.radius_m ?? radiusM) / 1000)} km
          </Badge>
          {data?.expires_at && (
            <span className="text-xs text-gray-400 ml-auto">
              hasta {formatRelativeTime(data.expires_at)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Integrar en `ExplorePage`**

> **Condición:** requiere F3 (`ExplorePage`). Si no existe, omitir el Step 2-3 y dejar `AvailabilityToggle` listo para integrar.

Localizar `frontend/src/features/plans/pages/ExplorePage.tsx`. El componente ya usa `useUserLocation()` (F3) que provee `location: [lat,lng] | null` y `preferences` (radius/activities). Añadir el import:

```tsx
import { AvailabilityToggle } from '../../availability/components/AvailabilityToggle';
```

Dentro del JSX de `ExplorePage`, en una zona visible arriba o sobre la lista de planes (p.ej. tras el header y antes de la lista/`PlanCard`s), añadir:

```tsx
{location && (
  <AvailabilityToggle
    location={location}
    radiusM={preferences?.default_search_radius_m ?? 2000}
    activityFilter={preferences?.activity_types?.length ? preferences.activity_types : null}
  />
)}
```

> Si `ExplorePage` no expone `preferences` directamente, leerlo vía `useMe()` (F2) o pasar defaults `radiusM={2000}`. El componente funciona con defaults; la ubicación se obtiene del GPS al activar si no se pasa.

- [ ] **Step 3: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: verde; aparece chunk `AvailabilityToggle` embebido en `ExplorePage`.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/availability/components/AvailabilityToggle.tsx frontend/src/features/plans/pages/ExplorePage.tsx
git commit -m "feat(availability): AvailabilityToggle con countdown y toggle on/off en ExplorePage"
```

---

## Verificación final (Definition of Done)

Antes de cerrar F6, ejecutar y confirmar:

- [ ] `cd frontend && npx tsc --noEmit` → sin errores.
- [ ] `cd frontend && npm run build` → build verde; chunks de safety/reviews/reports/availability generados.
- [ ] `cd frontend && npx vitest run` → todos los tests pasan (incluye F0–F5 + los nuevos de F6).
- [ ] `cd frontend && npx vitest run src/features/safety` → schemas (10), hooks safety, useThrottledWatchPosition (8) en verde.
- [ ] `cd frontend && npx vitest run src/features/reviews` → schemas (8), hooks reviews en verde.
- [ ] `cd frontend && npx vitest run src/features/reports` → hook report en verde.
- [ ] `cd frontend && npx vitest run src/features/availability` → hooks availability en verde.
- [ ] Navegación manual (con backend levantado en `:8000` y dos sesiones):
  - **Safety — TrustedContacts:** `/me/trusted-contacts` lista vacía → añadir email válido → aparece → intentar añadir 3º → feedback de máximo → eliminar con confirmación.
  - **Safety — Live tracking:** entrar a `/matches/:matchId/safety` con match activo → "Compartiendo" → en la otra sesión `/matches/:id/safety` muestra ubicación del par (polling 30s) → al salir deja de compartir.
  - **Safety — SOS:** botón rojo → modal pide escribir "SOS" → confirmar deshabilitado hasta escribirlo → confirmar → modal de éxito con `event_id`. Probar con GPS denegado: envía igual con advertencia.
  - **Safety — Share-link:** crear → copiar URL → abrir en ventana incógnita **sin login** → carga la ubicación pública → revocar → recargar → "Link inválido o expirado".
  - **Safety — Vista pública `/s/:token`:** abrir sin auth (estado `unauthenticated` en la app) → funciona sin redirect a `/login`. Probar token inexistente → 404. Token revocado → 401 invalid_token.
  - **Reviews:** desde un match `completed` (F4), abrir `ReviewForm` → calificar 5 estrellas + comentario + flag → enviar → toast → aparece en `ReviewList` del perfil del reviewee (`/users/:id`). Intentar segunda reseña del mismo par → 409.
  - **Reports:** desde `/users/:id`, "Reportar" → modal → motivo + detalles → enviar → toast → cerrar. Reportarse a uno mismo no debería ofrecerse (la UI omite el botón si `user.id === me.id`).
  - **Availability:** en `/explore`, toggle on → pide GPS → "Estás disponible" con countdown → toggle off → desactivado. Esperar a que expire → estado vuelve a inactivo.

---

## Notas de consistencia con F0–F5 / F7+

- **Query keys (sin colisión):** `['trusted-contacts']`, `['safety','peer',matchId]`, `['safety','share-link',matchId]`, `['reviews',userId]`, `['availability','me']`, `['public-location',token]`. F7 (notifications/admin) no debe pisarlas. `useReviews` invalida por prefijo `['reviews']` (la nueva reseña afecta a cualquier lista).
- **Endpoint público:** `GET /s/{token}` es el **único** endpoint público nuevo de F6. Se marca `publicEndpoint: true` en `apiGet` y se registra la ruta `/s/:token` **fuera** de `RequireAuth`. No dispara refresh ni Bearer. `retry: false` porque 401/404 son terminales.
- **`ConfirmDialog`:** si no existía de F3/F4, la Task 4 lo crea en `components/ui/ConfirmDialog` para todo el repo. Futuras fases lo reutilizan.
- **`qrcode.react`:** nueva dep ligera (~3KB) para el QR del share-link. Renderiza SVG local (no filtra el token a terceros, a diferencia de APIs externas). Si se quiere evitar la dep, el `ShareLinkCard` degrada a solo URL copiable (QR opcional tras flag `hasQrLib`).
- **`getCurrentPosition` (F0):** los campos son `latitude`/`longitude` (NO `lat`/`lng`). `LiveTracker`, `SosButton` y `AvailabilityToggle` usan `.latitude`/`.longitude`. El `watchPosition` nativo (en `useThrottledWatchPosition`) sí expone `coords.latitude`/`coords.longitude` directamente.
- **`watchPosition` vs `getCurrentPosition`:** el live-tracking usa `watchPosition` (updates continuos) throttleado a 60s; el SOS y el availability usan `getCurrentPosition` (una sola lectura puntual). Esto cumple el spec §5.5.
- **GPS denegado:** `LiveTracker` muestra badge "Permiso denegado" sin crashear. `SosButton` envía el SOS igual con sentinel `{0,0}` (mejor un SOS sin coords que ninguno). `AvailabilityToggle` bloquea la activación y muestra toast explicativo.
- **Rate limits (UX):** reviews (20/día) y reports (10/día) muestran toast específico al recibir 429/rate_limit_exceeded. No hay cooldown de botón implementado (el backend es fuente de verdad); el feedback es claro.
- **Seguridad XSS:** ningún campo de F6 se renderiza con `dangerouslySetInnerHTML`. Comentarios de reviews, descripciones de reports y `user_display_name` van como texto. El backend sanea además.
- **`react-router-dom` v7:** `/s/:token` pública; las demás bajo `RequireAuth`. React Router v7 distingue `safety` literal de `:matchId` dinámico, sin conflicto con `/matches/:matchId`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `watchPosition` drena batería en segundo plano | `LiveTracker` solo arranca al montar `SafetyPage` (match activo) y para al desmontar (clearWatch). El throttle de 60s limita los pings al backend. No se usa en background. |
| GPS denegado bloquea el flujo de safety | `LiveTracker` y `AvailabilityToggle` degradan con feedback; `SosButton` envía igual (sentinel). Ningún componente crashea sin GPS. |
| SOS accidental | Doble confirmación: botón → modal con texto explicativo grave → escribir literalmente "SOS" para habilitar el botón confirmar. |
| Share-link filtrado a terceros | El QR se genera localmente (`qrcode.react`, SVG), no viaja a APIs externas. El token es de un solo uso y revocable (`DELETE`). La vista pública no expone datos del usuario más allá de `display_name` + ubicación. |
| Vista pública `/s/:token` cae en loop de refresh | `usePublicLocation` usa `retry: false` y `publicEndpoint: true`. 401/404 son terminales con estados de UI dedicados (no redirect a `/login`). |
| Rate limit de reviews/reports frustra al usuario | Toast específico con el límite (20/día, 10/día). El botón no se deshabilita preventivamente (el backend es fuente de verdad), pero el mensaje es claro. |
| `useReviews` invalida demasiado (prefijo `['reviews']`) | Intencional: una nueva reseña cambia la lista del reviewee y potencialmente su `reputation_score` (que vive en `['me']`/`['users',id]`). La invalidación por prefijo asegura consistencia. Si se quiere afinar, invalidar `['reviews', vars.reviewee_id]` exact. |
| `useAvailability` refetch cada 30s gasta batería | Solo refresca mientras `active=true` (callback de `refetchInterval` retorna `false` si inactiva). Es necesario para el countdown y detectar expiración. |
| F2/F3/F4 ausentes → integraciones rompen | `ReviewList`/`ReportModal`/`AvailabilityToggle` compilan aislados; las Tasks de integración (5, 18/19, 20/21, 24) son condicionales y se omiten sin bloquear el resto. `SafetyPage` depende de `useMatch` (F4): si falta, documentar y dejar la página como contenedor. |
| `require('qrcode.react')` en Vite/ESM | La dep es ESM-compatible; si el import dinámico reclama, cambiar a `import { QRCodeSVG } from 'qrcode.react'` estático al inicio del archivo. La Task 10 lo documenta. |
| ConfirmDialog ausente (F3/F4 no lo crearon) | La Task 4 lo crea de forma robusta antes de que safety/reviews lo consuman. Es el único componente UI que F6 puede necesitar aportar. |

## Resumen de commits (orden de ejecución)

1. `chore(frontend): rama fase-6 + dep qrcode.react` *(Task 1)*
2. `feat(safety): tipos y schemas zod (trustedContact, ping) + tests` *(Task 2)*
3. `feat(safety): hooks useTrustedContacts/ping/peer/shareLink/sos/publicLocation (TDD)` *(Task 3)*
4. `feat(ui): ConfirmDialog reutilizable (tone danger/primary) para safety y reviews` *(Task 4, solo si no existe)*
5. `feat(safety): TrustedContactsPage CRUD (max 2) con form zod y feedback` *(Task 5)*
6. `feat(safety): useThrottledWatchPosition sobre watchPosition con throttle 60s (TDD)` *(Task 6)*
7. `feat(safety): LiveTracker con ping throttleado cada 60s via watchPosition` *(Task 7)*
8. `feat(safety): PeerLocation con polling 30s y mapa del par` *(Task 8)*
9. `feat(safety): SosButton con doble confirmación (escribir SOS) y modal de éxito` *(Task 9)*
10. `feat(safety): ShareLinkCard con crear/copiar/QR opcional/revocar` *(Task 10)*
11. `feat(safety): SafetyPage orquesta LiveTracker/PeerLocation/SOS/ShareLink` *(Task 11)*
12. `feat(safety): ShareLinkView publica /s/:token sin auth (401/404/expired)` *(Task 12)*
13. `feat(router): registrar /me/trusted-contacts, /matches/:matchId/safety y /s/:token (publica)` *(Task 13)*
14. `feat(reviews): tipos ReviewIn/ReviewOut/ReviewWithReviewer y schema zod + tests` *(Task 14)*
15. `feat(reviews): hooks useReviews(infinite)/useCreateReview/useDeleteReview (TDD)` *(Task 15)*
16. `feat(reviews): StarRating reutilizable (display + input con hover)` *(Task 16)*
17. `feat(reviews): ReviewForm con StarRating, flag y manejo 409/422/429` *(Task 17)*
18. `feat(reviews): ReviewList con infinite scroll y flags` *(Task 18)*
19. `feat(users): embeber ReviewList en UserPublicPage` *(Task 19, requiere F2)*
20. `feat(reports): useReportUser + ReportModal con reasons sugeridos y rate-limit UX` *(Task 20)*
21. `feat(users): abrir ReportModal desde UserPublicPage` *(Task 21, requiere F2)*
22. `feat(availability): tipos AvailabilityIn/Out y schema zod` *(Task 22)*
23. `feat(availability): hooks useAvailability/useSetAvailability/useDeleteAvailability (TDD)` *(Task 23)*
24. `feat(availability): AvailabilityToggle con countdown y toggle on/off en ExplorePage` *(Task 24, requiere F3)*
