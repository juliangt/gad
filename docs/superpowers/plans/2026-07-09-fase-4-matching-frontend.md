# Matching Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el dominio Matching en el frontend de GAD (Fase F4): que un usuario pueda postularse a un plan, que el host vea postulaciones y las acepte/rechaze (formando matches automáticamente al alcanzar `max_participants`), que ambos puedan retirar su postulación, y que cualquier participante vea sus matches con la ubicación exacta del encuentro y pueda finalizarlos/cancelarlos. Cierra el flujo principal plan → match que habilita el chat (F5) y safety (F6).

**Architecture:** Feature-based: `src/features/matching/` contiene `types.ts` (espejo de la sección "Matching" del contrato), `hooks.ts` (TanStack Query v5: queries de lectura + mutaciones que invalidan las keys `['applications', planId]`, `['my-applications']`, `['matches']`, `['matches', matchId]`), `components/` (`ApplicationCard`, `ApplySheet`, `MatchCard`, `MatchParticipantList`, `ConfirmActionDialog`) y `pages/` (`ApplicationsPage`, `MatchesPage`, `MatchDetailPage`). Las páginas consumen `api/client.ts` (F0) y reutilizan `PlanDetailPage` de F3 (se le añade el botón "Postularme" con `useApply`). La paginación de `GET /me/applications` y `GET /matches` usa `useInfiniteQuery` con cursor (`next_cursor` → `before`); `GET /plans/{id}/applications` devuelve un array directo (sin cursor) y usa `useQuery`. La ubicación exacta (`exact_location_lat/lng`) solo se muestra a participantes: el backend ya la devuelve `null` para no participantes, así que la UI simplemente renderiza un mapa si los campos no son `null`. Las teasers de chat (F5) y safety (F6) son botones que navegan a rutas aún no implementadas y muestran un toast informativo, dejando el handler listo.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, TanStack Query v5, react-hook-form, zod, date-fns v4 (locale `es`), react-leaflet, lucide-react, Tailwind v4 (glassmorphism), sonner, Vitest + @testing-library/react + jsdom.

---

## Prerrequisitos (de F0-F3)

Este plan asume que las siguientes piezas ya existen y funcionan (no se reimplementan aquí):

| Pieza | Archivo | Interfaz que se consume en F4 |
|---|---|---|
| API client | `src/api/client.ts` | `apiGet<T>(path, opts?: { params?: Record<string, string\|number\|boolean> })`, `apiPost<T>(path, body)`, `apiDelete<T>(path)` — lanzan `ApiError(code, status, detail)` y aplican el interceptor 401→refresh |
| ApiError | `src/api/errors.ts` | campos públicos `.code`, `.status`, `.detail` |
| Auth | `src/auth/useAuth.ts` | `useAuth()` → `{ user: { id; display_name; ... } \| null, status }` |
| Formato | `src/lib/format.ts` | `formatRelativeTime(iso, locale?)`, `formatRating(n)`, `formatDateTime(iso)` (o `formatRelativeTime`) |
| Types comunes | `src/types/common.ts` | `HostSummary` (`{ id; display_name; avatar_url; reputation_score; verification_level }`), `PaginatedOut<T>` (`{ items: T[]; next_cursor: string \| null }`), `OKMessage` (`{ message: string }`) |
| Enums | `src/types/enums.ts` | `ApplicationStatus` (`'pending' \| 'accepted' \| 'rejected' \| 'withdrawn'`), `MatchStatus` (`'active' \| 'completed' \| 'cancelled'`), `MatchRole` (`'host' \| 'participant'`), `VerificationLevel` |
| PlanDetailPage (F3) | `src/features/plans/pages/PlanDetailPage.tsx` | Recibe `planId` de la URL; renderiza `PlanDetailSheet` con `onApply` stub. F4 conecta ese handler. |
| PlanDetailSheet (F3) | `src/features/plans/components/PlanDetailSheet.tsx` | Props `{ plan, isHost, onApply?, ... }`. El botón "Postularme" llama `onApply`. |
| PlanOut (F3) | `src/features/plans/types.ts` | `PlanOut` con `id`, `host: HostSummary`, `status`, `max_participants`, `current_participants`, etc. |
| usePlan (F3) | `src/features/plans/hooks.ts` | `usePlan(planId)` → `UseQueryResult<PlanOut>` |
| UI | `src/components/ui/` | `Button`, `Textarea`, `Spinner`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Badge`, `Avatar`, `BottomSheet`, `Modal` |
| Layout | `src/components/layout/BottomNav.tsx` | `<BottomNav/>` con `NavLink` a `/explore`, `/matches`, `/me` |
| MapBackground | `src/components/MapBackground.tsx` | `<MapBackground userLocation plans className />` — `plans: { id; lat; lng }[]` |
| QueryClient | `src/main.tsx` | `QueryClientProvider` con `defaultOptions.queries.staleTime = 30_000`, `refetchOnWindowFocus: true` |
| Router | `src/router.tsx` | `createBrowserRouter` con `RequireAuth` envolviendo rutas protegidas. `/explore`, `/plans/:planId` ya registradas (F3). `/plans/:planId/applications`, `/matches`, `/matches/:matchId` **aún no** (las añade este plan). |
| Toaster | `src/main.tsx` | `<Toaster/>` de sonner montado |
| Vitest | `vitest.config.ts`, `src/test/setup.ts` | jsdom + `@testing-library/jest-dom` globales; mock de `@/api/client` vía `vi.mock` |

> Si alguna de las firmas anteriores no coincide con lo que existe en el repo al ejecutar, **detener** y reconciliar antes de continuar: este plan depende literalmente de esos nombres.

**Convenciones de rutas de import** (idénticas a F3 para minimizar fricción):
- Este plan usa exclusivamente **imports relativos** (`../types`, `../../components/ui/Button`, `../../../auth/useAuth`), igual que el código de F0-F3. No se introduce el alias `@/`.

**Stack de test:** Vitest (globals: `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`), `@testing-library/react`, `renderHook`+`waitFor` de `@testing-library/react`. Los hooks de React Query se testean con un `newClient()` + `QueryClientProvider` wrapper. Se mockean `../../api/client` y `../../../api/client` con `vi.mock`. Patrón TDD: test rojo → implementación → verde → commit en schemas y hooks; componentes de presentación pura se implementan directo con verificación `tsc`.

---

## File Structure

Archivos a crear/modificar en F4 (todos con ruta absoluta desde la raíz del repo):

```
frontend/src/features/matching/
├── types.ts                              # NUEVO — ApplicationOut, ApplicationIn, MatchOut, MatchParticipant, re-export de enums
├── schemas.ts                            # NUEVO — applicationInSchema (message opcional max 500)
├── hooks.ts                              # NUEVO — useApply, useApplications, useAccept, useReject, useWithdraw, useMyApplications (infinite), useMatches (infinite), useMatch, useCompleteMatch, useCancelMatch
├── constants.ts                          # NUEVO — APPLICATION_STATUS_META, MATCH_STATUS_META (label es-AR + clase tailwind)
├── components/
│   ├── ApplySheet.tsx                    # NUEVO — bottom-sheet con textarea opcional (react-hook-form + zod)
│   ├── ApplicationCard.tsx               # NUEVO — fila de postulación (vista host): applicant, message, status, aceptar/rechazar
│   ├── MatchCard.tsx                     # NUEVO — fila de match para lista (migrado/expandido de MatchesView 233-256)
│   ├── MatchParticipantList.tsx          # NUEVO — lista de participantes con avatar/rol
│   └── ConfirmActionDialog.tsx           # NUEVO — wrapper sobre ConfirmDialog de F0 con estados loading
└── pages/
    ├── ApplicationsPage.tsx              # NUEVO — /plans/:planId/applications (host): GET /plans/{id}/applications + aceptar/rechazar
    ├── MatchesPage.tsx                   # NUEVO — /matches (migrado de MatchesView App.tsx:233-256): GET /matches paginado
    ├── MatchDetailPage.tsx               # NUEVO — /matches/:matchId: GET /matches/{id} + complete/cancel + teasers chat/safety
    └── MyApplicationsPage.tsx            # NUEVO — /me/applications: GET /me/applications paginado + retirar

frontend/src/features/matching/__tests__/
├── schemas.test.ts                       # NUEVO — validación applicationInSchema
└── hooks.test.tsx                        # NUEVO — todos los hooks con mocks (queries + mutaciones + invalidaciones)

frontend/src/features/plans/pages/PlanDetailPage.tsx   # MODIFICAR — conectar onApply → abrir ApplySheet
frontend/src/router.tsx                                # MODIFICAR — registrar /plans/:planId/applications, /matches, /matches/:matchId, /me/applications
```

**Decisiones de descomposición:**
- `types.ts` y `schemas.ts` se separan (igual que F3): el primero es puramente tipos TS (espejo del contrato), el segundo son los schemas zod ejecutables. Así los hooks pueden importar tipos sin arrastrar zod al bundle de listados.
- `MyApplicationsPage` vive en `features/matching/pages/` (no en `features/users/`) porque su dominio es "mis postulaciones", no el perfil. La ruta `/me/applications` cuelga de `/me` solo por UX de navegación.
- `ApplicationCard` y `MatchCard` son filas de lista reutilizables y testeables de forma aislada; `ApplySheet` y `ConfirmActionDialog` son hojas presentacionales con su mutation inyectada.
- La **ubicación exacta** se renderiza con `MapBackground` (ya existe) centrado en `[exact_location_lat, exact_location_lng]`. Si ambos son `null` (no participante o el host no la fijó) → mostramos "Ubicación no disponible" en lugar del mapa. No se necesita lógica de permisos extra: el backend ya filtra.
- Las teasers de chat (F5) y safety (F6) son `Link`/`button` que apuntan a `/matches/:matchId/chat` y `/matches/:matchId/safety`. Esas rutas **no existen todavía** en el router; el botón muestra un toast "Próximamente" si F5/F6 no registraron la ruta. Esto evita romper F4 si F5 aún no corrió.

---

## Task 1: Tipos de Matching (`types.ts`) y constantes

**Files:**
- Create: `frontend/src/features/matching/types.ts`
- Create: `frontend/src/features/matching/constants.ts`
- (Verify): `frontend/src/types/common.ts` — confirmar que `HostSummary`, `PaginatedOut<T>`, `OKMessage` existen.

- [ ] **Step 1: Verificar tipos comunes**

Abrir `frontend/src/types/common.ts`. Deben existir:

```ts
export interface HostSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}

export interface PaginatedOut<T> {
  items: T[];
  next_cursor: string | null;
}

export interface OKMessage {
  message: string;
}
```

Si alguno falta (no debería tras F0), añadirlo. `HostSummary` ya lo define F3.

- [ ] **Step 2: Crear `frontend/src/features/matching/types.ts`**

```ts
// frontend/src/features/matching/types.ts
// Espejo de la sección "Matching (sin prefijo)" de docs/API_CONTRACT.md.

import type { HostSummary, PaginatedOut, OKMessage } from '../../types/common';

// Re-export de enums para que las features consuman desde un único punto.
export type {
  ApplicationStatus,
  MatchStatus,
  MatchRole,
} from '../../types/enums';

/** applicant embebe los campos de HostSummary (mismos campos que UserSummary en el contrato). */
export type ApplicantSummary = HostSummary;

/** Body de POST /plans/{plan_id}/applications (ApplicationIn en el contrato). */
export interface ApplicationIn {
  message?: string | null; // ..500
}

/**
 * Respuesta de POST /plans/{id}/applications, GET /plans/{id}/applications,
 * GET /me/applications (item).
 */
export interface ApplicationOut {
  id: string;
  plan_id: string;
  applicant: ApplicantSummary;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  created_at: string; // ISO 8601
  decided_at: string | null; // ISO 8601 — fecha de accept/reject/withdraw
}

/** GET /plans/{id}/applications devuelve un array directo (NO PaginatedOut). */
export type ApplicationList = ApplicationOut[];

/** GET /me/applications es paginado por cursor. */
export type MyApplicationsPage = PaginatedOut<ApplicationOut>;

/** Item del array `participants` de MatchOut. */
export interface MatchParticipant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'host' | 'participant';
  joined_at: string; // ISO 8601
}

/**
 * Respuesta de GET /matches, GET /matches/{id}, POST /matches/{id}/complete,
 * POST /matches/{id}/cancel. Y de POST /applications/{id}/accept cuando se
 * forma el match (puede devolver null si todavía no se alcanza max_participants).
 */
export interface MatchOut {
  id: string;
  plan_id: string;
  status: 'active' | 'completed' | 'cancelled';
  started_at: string; // ISO 8601
  ended_at: string | null; // ISO 8601
  location_sharing_active: boolean;
  participants: MatchParticipant[];
  /**
   * Ubicación exacta del encuentro. Solo visible para participantes:
   * el backend devuelve null si el solicitante no es participante.
   * null también puede significar que el host no fijó ubicación exacta.
   */
  exact_location_lat: number | null;
  exact_location_lng: number | null;
}

/** GET /matches es paginado por cursor. */
export type MatchesPage = PaginatedOut<MatchOut>;

/** Re-export de OKMessage para que las pages no importen de types/common indirectamente. */
export type { OKMessage };

/** Query params del listado de mis postulaciones / matches. */
export interface CursorQuery {
  limit?: number; // 1..100, default 50
  before?: string; // ISO 8601 — valor de next_cursor de la página anterior
}
```

- [ ] **Step 3: Crear `frontend/src/features/matching/constants.ts`**

```ts
// frontend/src/features/matching/constants.ts
import type { ApplicationStatus, MatchStatus } from './types';

export interface ApplicationStatusMeta {
  id: ApplicationStatus;
  label: string; // es-AR
  /** Clases tailwind para el badge de estado. */
  badgeClass: string;
}

/** Meta de los 4 estados de ApplicationStatus. */
export const APPLICATION_STATUS_META: Record<ApplicationStatus, ApplicationStatusMeta> = {
  pending: {
    id: 'pending',
    label: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  accepted: {
    id: 'accepted',
    label: 'Aceptada',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    id: 'rejected',
    label: 'Rechazada',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
  withdrawn: {
    id: 'withdrawn',
    label: 'Retirada',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

export interface MatchStatusMeta {
  id: MatchStatus;
  label: string;
  badgeClass: string;
}

/** Meta de los 3 estados de MatchStatus. */
export const MATCH_STATUS_META: Record<MatchStatus, MatchStatusMeta> = {
  active: {
    id: 'active',
    label: 'Activo',
    badgeClass: 'bg-brand-50 text-brand-600 border-brand-200',
  },
  completed: {
    id: 'completed',
    label: 'Finalizado',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  cancelled: {
    id: 'cancelled',
    label: 'Cancelado',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

/** Tamaño de página por defecto para listados paginados (matches, mis postulaciones). */
export const MATCHING_PAGE_SIZE = 50;
```

- [ ] **Step 4: Verificar tipos compilan**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores. (Si `@/types/enums` no existe todavía porque F0 no corrió, ver nota de prerrequisitos.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/matching/types.ts frontend/src/features/matching/constants.ts frontend/src/types/common.ts
git commit -m "feat(matching): añadir tipos y constantes del dominio Matching"
```

---

## Task 2: Schema zod de `ApplicationIn` + tests

**Files:**
- Create: `frontend/src/features/matching/schemas.ts`
- Test: `frontend/src/features/matching/__tests__/schemas.test.ts`

- [ ] **Step 1: Escribir el test de validación (TDD)**

```ts
// frontend/src/features/matching/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { applicationInSchema } from '../schemas';

describe('applicationInSchema', () => {
  it('acepta un body vacío (message opcional)', () => {
    expect(applicationInSchema.parse({})).toEqual({});
  });

  it('acepta message null', () => {
    expect(applicationInSchema.parse({ message: null })).toEqual({ message: null });
  });

  it('acepta message con texto válido', () => {
    expect(applicationInSchema.parse({ message: 'Hola, me gustaría sumarme' })).toEqual({
      message: 'Hola, me gustaría sumarme',
    });
  });

  it('acepta message de exactamente 500 caracteres', () => {
    const msg = 'a'.repeat(500);
    expect(applicationInSchema.parse({ message: msg })).toEqual({ message: msg });
  });

  it('rechaza message de 501 caracteres', () => {
    expect(() => applicationInSchema.parse({ message: 'a'.repeat(501) })).toThrow();
  });

  it('rechaza message vacío (string "") — el backend espera null o texto', () => {
    // String vacío no es válido: o se omite o se envía null.
    expect(() => applicationInSchema.parse({ message: '' })).toThrow();
  });

  it('rechaza message que no es string ni null', () => {
    expect(() => applicationInSchema.parse({ message: 123 })).toThrow();
    expect(() => applicationInSchema.parse({ message: [] })).toThrow();
  });

  it('normaliza whitespace solo → null (no enviamos mensaje vacío)', () => {
    expect(applicationInSchema.parse({ message: '   ' })).toEqual({ message: null });
  });

  it('recorta mensaje con espacios alrededor', () => {
    expect(applicationInSchema.parse({ message: '  hola  ' })).toEqual({ message: 'hola' });
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `cd frontend && npx vitest run src/features/matching/__tests__/schemas.test.ts`
Expected: FAIL — `Cannot find module '../schemas'`.

- [ ] **Step 3: Implementar `schemas.ts`**

```ts
// frontend/src/features/matching/schemas.ts
import { z } from 'zod';

/**
 * Schema de ApplicationIn (POST /plans/{id}/applications).
 * El contrato dice: `message?: string | null` con máximo 500.
 *
 * Reglas de UI:
 * - Si el usuario deja el textarea vacío o solo espacios → enviamos `message: null`
 *   (no un string vacío). El backend lo persiste como null.
 * - Recortamos whitespace alrededor para no contar padding en el límite de 500.
 */
export const applicationInSchema = z.object({
  message: z
    .union([z.string().max(500), z.null()])
    .optional()
    .transform((v) => {
      // undefined → no tocamos (se omite en el payload final vía .partial)
      if (v === undefined) return null;
      if (v === null) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .refine(
      (v) => v === null || v.length <= 500,
      { message: 'El mensaje no puede superar los 500 caracteres' },
    ),
});

export type ApplicationInForm = z.infer<typeof applicationInSchema>;
```

> **Nota:** el `.transform` convierte strings solo-whitespace a `null`, así el usuario no envía mensajes vacíos. El `.refine` refuerza el límite de 500 sobre el valor ya recortado. El payload final que se envía a `apiPost` es siempre `{ message: string | null }`.

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/matching/__tests__/schemas.test.ts`
Expected: PASS — todos los casos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/matching/schemas.ts frontend/src/features/matching/__tests__/schemas.test.ts
git commit -m "test(matching): validar ApplicationIn con zod"
```

---

## Task 3: Hooks de datos (`hooks.ts`) + tests

**Files:**
- Create: `frontend/src/features/matching/hooks.ts`
- Test: `frontend/src/features/matching/__tests__/hooks.test.tsx`

**Documentación clave de paginación:**
- `GET /plans/{id}/applications` → `ApplicationOut[]` (**array directo, sin cursor**) → `useQuery`.
- `GET /me/applications` y `GET /matches` → `PaginatedOut<T>` con `next_cursor` → `useInfiniteQuery`. `getNextPageParam = (lastPage) => lastPage.next_cursor ?? undefined`. El `before` de la siguiente página es el `next_cursor` de la anterior; React Query v5 lo recibe como segundo arg de `queryFn` (`pageParam`).
- `GET /matches/{id}` → `MatchOut` → `useQuery`.
- Mutaciones (`POST /applications/{id}/accept|reject`, `DELETE /applications/{id}`, `POST /plans/{id}/applications`, `POST /matches/{id}/complete|cancel`) invalidan las keys afectadas. `accept` puede devolver un `MatchOut` (si se forma match) → además de invalidar `['matches']`, mostramos toast específico según si vino match o null.

**Query keys canónicas:**
- `['applications', planId]` — postulaciones de un plan (host).
- `['my-applications']` — mis postulaciones (paginado).
- `['matches']` — mis matches (paginado).
- `['matches', matchId]` — detalle de un match.

- [ ] **Step 1: Escribir tests de hooks con mocks**

```tsx
// frontend/src/features/matching/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useApply,
  useApplications,
  useAccept,
  useReject,
  useWithdraw,
  useMyApplications,
  useMatches,
  useMatch,
  useCompleteMatch,
  useCancelMatch,
} from '../hooks';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost, apiDelete } from '../../api/client';
import type {
  ApplicationOut,
  MatchOut,
  MyApplicationsPage,
  MatchesPage,
} from '../types';

const mGet = vi.mocked(apiGet);
const mPost = vi.mocked(apiPost);
const mDel = vi.mocked(apiDelete);

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeApp(overrides: Partial<ApplicationOut> = {}): ApplicationOut {
  return {
    id: 'app1',
    plan_id: 'plan1',
    applicant: {
      id: 'u2',
      display_name: 'Lucía',
      avatar_url: null,
      reputation_score: 4.7,
      verification_level: 'email',
    },
    status: 'pending',
    message: 'Me sumo',
    created_at: '2026-07-09T17:00:00Z',
    decided_at: null,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchOut> = {}): MatchOut {
  return {
    id: 'm1',
    plan_id: 'plan1',
    status: 'active',
    started_at: '2026-07-09T18:00:00Z',
    ended_at: null,
    location_sharing_active: true,
    participants: [
      {
        user_id: 'u1',
        display_name: 'Martín',
        avatar_url: null,
        role: 'host',
        joined_at: '2026-07-09T18:00:00Z',
      },
      {
        user_id: 'u2',
        display_name: 'Lucía',
        avatar_url: null,
        role: 'participant',
        joined_at: '2026-07-09T18:00:00Z',
      },
    ],
    exact_location_lat: -34.588,
    exact_location_lng: -58.431,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useApply', () => {
  it('POST /plans/{id}/applications y al éxito invalida ["applications", planId] y ["my-applications"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeApp({ id: 'newApp' }));

    const { result } = renderHook(() => useApply('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate({ message: 'Hola' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/plans/plan1/applications', { message: 'Hola' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
  });
});

describe('useApplications', () => {
  it('usa key ["applications", planId] y GET /plans/{id}/applications (array directo)', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makeApp()]);
    const { result } = renderHook(() => useApplications('plan1'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans/plan1/applications');
    expect(result.current.data).toHaveLength(1);
  });

  it('no habilita la query si planId es undefined', async () => {
    const client = newClient();
    const { result } = renderHook(() => useApplications(undefined), {
      wrapper: withClient(client),
    });
    expect(mGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAccept', () => {
  it('POST /applications/{id}/accept y al éxito invalida applications, my-applications y matches', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch()); // se formó match

    const { result } = renderHook(() => useAccept('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/applications/app1/accept');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
  });

  it('acepta null (sin match todavía) sin romper', async () => {
    const client = newClient();
    mPost.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAccept('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useReject', () => {
  it('POST /applications/{id}/reject y al éxito invalida applications', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce({ message: 'Postulación rechazada' });

    const { result } = renderHook(() => useReject('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/applications/app1/reject');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
  });
});

describe('useWithdraw', () => {
  it('DELETE /applications/{id} y al éxito invalida ["my-applications"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mDel.mockResolvedValueOnce({ message: 'Postulación retirada' });

    const { result } = renderHook(() => useWithdraw(), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mDel).toHaveBeenCalledWith('/applications/app1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
  });
});

describe('useMyApplications', () => {
  it('usa useInfiniteQuery con getNextPageParam = next_cursor', async () => {
    const client = newClient();
    const page: MyApplicationsPage = {
      items: [makeApp()],
      next_cursor: '2026-07-09T17:00:00Z',
    };
    mGet.mockResolvedValueOnce(page);

    const { result } = renderHook(() => useMyApplications(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/me/applications', {
      params: { limit: 50 },
    });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('hasNextPage=false cuando next_cursor es null', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce({ items: [makeApp()], next_cursor: null });

    const { result } = renderHook(() => useMyApplications(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useMatches', () => {
  it('usa useInfiniteQuery con GET /matches', async () => {
    const client = newClient();
    const page: MatchesPage = {
      items: [makeMatch()],
      next_cursor: null,
    };
    mGet.mockResolvedValueOnce(page);

    const { result } = renderHook(() => useMatches(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/matches', { params: { limit: 50 } });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useMatch', () => {
  it('usa key ["matches", id] y GET /matches/{id}', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce(makeMatch({ id: 'abc' }));
    const { result } = renderHook(() => useMatch('abc'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/matches/abc');
    expect(result.current.data?.id).toBe('abc');
  });
});

describe('useCompleteMatch', () => {
  it('POST /matches/{id}/complete e invalida ["matches"] y detalle', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch({ id: 'm1', status: 'completed' }));

    const { result } = renderHook(() => useCompleteMatch('m1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('m1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/matches/m1/complete');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches', 'm1'] });
  });
});

describe('useCancelMatch', () => {
  it('POST /matches/{id}/cancel e invalida ["matches"] y detalle', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch({ id: 'm1', status: 'cancelled' }));

    const { result } = renderHook(() => useCancelMatch('m1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('m1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/matches/m1/cancel');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches', 'm1'] });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/matching/__tests__/hooks.test.tsx`
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 3: Implementar `hooks.ts`**

```ts
// frontend/src/features/matching/hooks.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '../../api/client';
import type { ApiError } from '../../api/errors';
import { MATCHING_PAGE_SIZE } from './constants';
import type {
  ApplicationIn,
  ApplicationList,
  ApplicationOut,
  CursorQuery,
  MatchOut,
  MatchesPage,
  MyApplicationsPage,
} from './types';

/** Serializa CursorQuery a params de apiGet. Omite undefined. */
function cursorParams(q: CursorQuery): { params: Record<string, number | string> } {
  const params: Record<string, number | string> = { limit: q.limit ?? MATCHING_PAGE_SIZE };
  if (q.before) params.before = q.before;
  return { params };
}

/** Devuelve un mensaje es-AR según el code del ApiError. */
function errorMessage(err: unknown, fallback: string): string {
  const e = err as ApiError | null;
  if (!e) return fallback;
  switch (e.code) {
    case 'conflict':
      return 'Ya te habías postulado a este plan.';
    case 'validation_error':
      return e.detail ?? 'No se puede realizar esta acción sobre el plan.';
    case 'not_found':
      return 'El recurso no existe o ya no está disponible.';
    default:
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// Queries de lectura
// ---------------------------------------------------------------------------

/**
 * GET /plans/{id}/applications — lista de postulaciones a un plan propio (host).
 * Devuelve un **array directo** (ApplicationOut[]), NO paginado. Por eso useQuery.
 */
export function useApplications(planId: string | undefined) {
  return useQuery({
    queryKey: ['applications', planId],
    queryFn: () => apiGet<ApplicationList>(`/plans/${planId}/applications`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

/**
 * GET /me/applications — mis postulaciones, paginado por cursor.
 * next_cursor (ISO del último item) se pasa como `before` en la siguiente página.
 */
export function useMyApplications() {
  return useInfiniteQuery({
    queryKey: ['my-applications'],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<MyApplicationsPage>(
        '/me/applications',
        cursorParams({ before: pageParam }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MyApplicationsPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * GET /matches — mis matches, paginado por cursor.
 */
export function useMatches() {
  return useInfiniteQuery({
    queryKey: ['matches'],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<MatchesPage>('/matches', cursorParams({ before: pageParam })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MatchesPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/** GET /matches/{id} — detalle de un match. */
export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['matches', matchId],
    queryFn: () => apiGet<MatchOut>(`/matches/${matchId}`),
    enabled: Boolean(matchId),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

/**
 * POST /plans/{planId}/applications — postularse a un plan.
 * Errores esperados: 409 conflict (ya postulado), 422 validation_error (plan cerrado/propio).
 */
export function useApply(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationIn) =>
      apiPost<ApplicationOut>(`/plans/${planId}/applications`, input),
    onSuccess: () => {
      // El host todavía no la ve (está pendiente), pero invalidamos por si tenía
      // la pestaña abierta. El postulante la verá en "mis postulaciones".
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Te postulaste. El organizador revisará tu solicitud.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo enviar la postulación.'));
    },
  });
}

/**
 * POST /applications/{id}/accept — aceptar postulación (host).
 * Devuelve MatchOut | null: null si todavía no se alcanza max_participants.
 * Recibe planId para invalidar la lista correcta de aplicaciones.
 */
export function useAccept(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<MatchOut | null>(`/applications/${applicationId}/accept`),
    onSuccess: (match: MatchOut | null) => {
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      if (match) {
        toast.success('¡Se formó un match! Ya pueden coordinar el encuentro.');
      } else {
        toast.success('Postulación aceptada.');
      }
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo aceptar la postulación.'));
    },
  });
}

/** POST /applications/{id}/reject — rechazar postulación (host). */
export function useReject(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<{ message: string }>(`/applications/${applicationId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Postulación rechazada.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo rechazar la postulación.'));
    },
  });
}

/** DELETE /applications/{id} — retirar postulación propia. */
export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiDelete<{ message: string }>(`/applications/${applicationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Postulación retirada.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo retirar la postulación.'));
    },
  });
}

/**
 * POST /matches/{id}/complete — finalizar match (participante).
 * Recibe matchId para invalidar el detalle además de la lista.
 */
export function useCompleteMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<MatchOut>(`/matches/${matchId}/complete`),
    onSuccess: (updated: MatchOut) => {
      qc.setQueryData(['matches', matchId], updated);
      qc.invalidateQueries({ queryKey: ['matches', matchId] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Match finalizado. ¡Gracias por usar GAD!');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo finalizar el match.'));
    },
  });
}

/** POST /matches/{id}/cancel — cancelar match (participante). */
export function useCancelMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<MatchOut>(`/matches/${matchId}/cancel`),
    onSuccess: (updated: MatchOut) => {
      qc.setQueryData(['matches', matchId], updated);
      qc.invalidateQueries({ queryKey: ['matches', matchId] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Match cancelado.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo cancelar el match.'));
    },
  });
}
```

> **Notas de implementación:**
> - `useInfiniteQuery` en React Query v5 requiere `initialPageParam`. Lo dejamos `undefined` y el primer fetch no manda `before`. El backend devuelve la página más reciente primero cuando `before` no está.
> - `errorMessage` mapea los codes del contrato (`conflict`, `validation_error`, `not_found`) a mensajes es-AR contextuales. El interceptor global de 401 ya maneja `invalid_token`/`auth_error`, así que aquí no los tocamos.
> - `useAccept` y `useCompleteMatch`/`useCancelMatch` hacen `setQueryData` para feedback inmediato + `invalidateQueries` para refetch en background (patrón de F3).

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/matching/__tests__/hooks.test.tsx`
Expected: PASS — todos los casos.

> **Nota sobre el wrapper `api/client`:** los tests asumen que `apiGet(path, { params })` serializa `params` a query string, igual que en F3. Si el cliente real de F0 usa otra firma, ajustar tanto el mock como `cursorParams`. Verificar la firma real de `api/client.ts` antes de continuar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/matching/hooks.ts frontend/src/features/matching/__tests__/hooks.test.tsx
git commit -m "feat(matching): hooks de datos y mutaciones con React Query"
```

---

## Task 4: Componentes presentacionales (`ApplicationCard`, `MatchCard`, `MatchParticipantList`, `ConfirmActionDialog`)

**Files:**
- Create: `frontend/src/features/matching/components/ApplicationCard.tsx`
- Create: `frontend/src/features/matching/components/MatchCard.tsx`
- Create: `frontend/src/features/matching/components/MatchParticipantList.tsx`
- Create: `frontend/src/features/matching/components/ConfirmActionDialog.tsx`

Estos cuatro componentes son de presentación pura (reciben props + callbacks). No llevan test dedicado propio: su contrato queda validado por el render de las páginas y los tests de hooks. Se implementan directo y se verifica con `tsc`.

- [ ] **Step 1: Implementar `ApplicationCard.tsx`**

```tsx
// frontend/src/features/matching/components/ApplicationCard.tsx
import { Check, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';
import { formatRating, formatRelativeTime } from '../../../lib/format';
import { APPLICATION_STATUS_META } from '../constants';
import type { ApplicationOut } from '../types';

interface Props {
  application: ApplicationOut;
  /** true si la aplicación está siendo procesada (aceptar/rechazar) → deshabilita botones. */
  actionLoading?: boolean;
  onAccept?: (applicationId: string) => void;
  onReject?: (applicationId: string) => void;
}

/**
 * Fila de postulación vista desde el host. Muestra applicant (avatar, nombre,
 * reputación, verificación), mensaje opcional, estado y botones aceptar/rechazar
 * (solo visibles si está pending y hay handler).
 */
export function ApplicationCard({
  application,
  actionLoading = false,
  onAccept,
  onReject,
}: Props) {
  const meta = APPLICATION_STATUS_META[application.status];
  const a = application.applicant;
  const isPending = application.status === 'pending';

  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={a.display_name} src={a.avatar_url ?? undefined} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{a.display_name}</h3>
            <Badge className="bg-gray-100 text-gray-600">
              {formatRating(a.reputation_score)} ★
            </Badge>
            {a.verification_level !== 'none' && (
              <Badge className="bg-brand-50 text-brand-600">
                {a.verification_level === 'google' ? 'Google' : 'Email'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Postuló {formatRelativeTime(application.created_at)}
          </p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </div>

      {application.message && (
        <p className="text-sm text-gray-700 bg-gray-50/60 rounded-xl p-3 border border-gray-100">
          {application.message}
        </p>
      )}

      {isPending && (onAccept || onReject) && (
        <div className="flex gap-2">
          {onAccept && (
            <Button
              size="sm"
              className="flex-1"
              disabled={actionLoading}
              onClick={() => onAccept(application.id)}
            >
              <Check className="w-4 h-4" />
              Aceptar
            </Button>
          )}
          {onReject && (
            <Button
              size="sm"
              variant="ghost"
              className={cn('flex-1', !onAccept && 'text-red-600')}
              disabled={actionLoading}
              onClick={() => onReject(application.id)}
            >
              <X className="w-4 h-4" />
              Rechazar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implementar `MatchCard.tsx`**

```tsx
// frontend/src/features/matching/components/MatchCard.tsx
import { ChevronRight, MessageCircle, Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { cn } from '../../../lib/utils';
import { formatRelativeTime } from '../../../lib/format';
import { MATCH_STATUS_META } from '../constants';
import type { MatchOut } from '../types';

interface Props {
  match: MatchOut;
  onClick?: (matchId: string) => void;
  /** Muestra un botón de chat rápido (solo si match activo). */
  showChatButton?: boolean;
}

/**
 * Fila de match para la lista (migrado/expandido de MatchesView App.tsx:233-256).
 * Muestra los otros participantes (excluyendo al usuario actual si se pasa currentUserId),
 * el título descriptivo armado con display_names, el estado y la hora de inicio.
 */
export function MatchCard({ match, onClick, showChatButton = false }: Props) {
  const meta = MATCH_STATUS_META[match.status];
  const names = match.participants.map((p) => p.display_name).join(' · ');
  const otherAvatars = match.participants.slice(0, 3);
  const startedLabel = formatRelativeTime(match.started_at);

  return (
    <div
      onClick={() => onClick?.(match.id)}
      className={cn(
        'glass-panel p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform',
        onClick && 'cursor-pointer',
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(match.id);
        }
      }}
    >
      {/* Avatares apilados */}
      <div className="flex -space-x-2">
        {otherAvatars.map((p) => (
          <Avatar
            key={p.user_id}
            name={p.display_name}
            src={p.avatar_url ?? undefined}
            size={44}
            className="ring-2 ring-white"
          />
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{names}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <Users className="w-3.5 h-3.5" />
          <span>{match.participants.length} participantes</span>
          <span>·</span>
          <span>{startedLabel}</span>
        </div>
      </div>

      <Badge className={meta.badgeClass}>{meta.label}</Badge>

      {showChatButton && match.status === 'active' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(match.id);
          }}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-sm active:scale-95"
          aria-label="Abrir chat"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      ) : (
        onClick && <ChevronRight className="w-5 h-5 text-gray-400" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implementar `MatchParticipantList.tsx`**

```tsx
// frontend/src/features/matching/components/MatchParticipantList.tsx
import { Crown, User } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { cn } from '../../../lib/utils';
import { formatRating, formatRelativeTime } from '../../../lib/format';
import type { MatchParticipant } from '../types';

interface Props {
  participants: MatchParticipant[];
  /** Resalta al usuario actual (si se pasa su id). */
  currentUserId?: string;
}

/** Lista de participantes de un match con avatar, rol (host/participante) y joined_at. */
export function MatchParticipantList({ participants, currentUserId }: Props) {
  // Orden: host primero.
  const sorted = [...participants].sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === 'host' ? -1 : 1;
  });

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((p) => {
        const isHost = p.role === 'host';
        const isMe = currentUserId === p.user_id;
        return (
          <li
            key={p.user_id}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50"
          >
            <Avatar name={p.display_name} src={p.avatar_url ?? undefined} size={40} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {p.display_name}
                  {isMe && <span className="text-xs text-gray-500 ml-1">(vos)</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                {isHost ? (
                  <span className="flex items-center gap-1 text-brand-600 font-medium">
                    <Crown className="w-3 h-3" /> Organizador
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> Participante
                  </span>
                )}
                <span>·</span>
                <span>Se sumó {formatRelativeTime(p.joined_at)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Implementar `ConfirmActionDialog.tsx`**

```tsx
// frontend/src/features/matching/components/ConfirmActionDialog.tsx
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Wrapper fino sobre el ConfirmDialog de F0 para reusarlo en
 * "finalizar match", "cancelar match", "retirar postulación", etc.
 * Expone props con defaults es-AR.
 */
export function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      loading={loading}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 5: Verificar que compilan**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

> **Supuestos de componentes de UI (F0):** `Avatar` acepta props `{ name; src?; size?; className? }`; `Badge` acepta `{ children; className }`; `Button` acepta `{ variant?; size?; disabled?; onClick?; className?; children }` con `variant: 'primary' | 'ghost'`; `ConfirmDialog` acepta `{ open; title; message; confirmLabel; cancelLabel; danger?; loading?; onConfirm; onClose }`. Si las firmas reales difieren, ajustar los componentes de matching.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/matching/components/ApplicationCard.tsx \
        frontend/src/features/matching/components/MatchCard.tsx \
        frontend/src/features/matching/components/MatchParticipantList.tsx \
        frontend/src/features/matching/components/ConfirmActionDialog.tsx
git commit -m "feat(matching): componentes presentacionales ApplicationCard/MatchCard/ParticipantList/ConfirmActionDialog"
```

---

## Task 5: `ApplySheet` (bottom-sheet de postulación)

**Files:**
- Create: `frontend/src/features/matching/components/ApplySheet.tsx`

Bottom-sheet con `react-hook-form` + `applicationInSchema`. Textarea opcional (max 500) para mensaje al host. Llama `useApply(planId)`. Botón "Postularme" dispara la mutación; al éxito, cierra el sheet (el hook ya toastea).

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/matching/components/ApplySheet.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { applicationInSchema, type ApplicationInForm } from '../schemas';
import { useApply } from '../hooks';

interface Props {
  planId: string;
  planTitle: string;
  onClose: () => void;
  onApplied?: () => void;
}

/** Bottom-sheet para postularse a un plan con mensaje opcional (max 500). */
export function ApplySheet({ planId, planTitle, onClose, onApplied }: Props) {
  const apply = useApply(planId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ApplicationInForm>({
    resolver: zodResolver(applicationInSchema),
    defaultValues: { message: null },
    mode: 'onChange',
  });

  const messageValue = watch('message');
  // messageValue puede ser null (inicial) o string; contamos length del string.
  const charCount = (typeof messageValue === 'string' ? messageValue : '').length;
  const MAX = 500;

  const onSubmit = (values: ApplicationInForm) => {
    apply.mutate(
      // El schema ya normaliza: undefined/null/whitespace → null.
      { message: values.message ?? null },
      {
        onSuccess: () => {
          onApplied?.();
          onClose();
        },
      },
    );
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[80vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Postularme</h2>
            <p className="text-sm text-gray-500 mt-0.5">{planTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 flex-shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Mensaje al organizador (opcional)
            </label>
            <Textarea
              rows={4}
              maxLength={MAX}
              placeholder="Contale algo al organizador: por qué te sumás, disponibilidad, etc."
              {...register('message')}
              error={errors.message?.message as string | undefined}
            />
            <div className="flex justify-end text-xs text-gray-400">
              {charCount}/{MAX}
            </div>
          </div>

          <Button type="submit" disabled={apply.isPending}>
            {apply.isPending ? 'Enviando...' : 'Postularme'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/matching/components/ApplySheet.tsx
git commit -m "feat(matching): ApplySheet con react-hook-form + zod"
```

---

## Task 6: `ApplicationsPage` (`/plans/:planId/applications`) — vista host

**Files:**
- Create: `frontend/src/features/matching/pages/ApplicationsPage.tsx`

Lee `planId` de la URL, `GET /plans/{id}/applications` (array directo) → `ApplicationOut[]`. Cada `pending` muestra botones aceptar/rechazar (mutations `useAccept`/`useReject`). Carga el plan vía `usePlan` de F3 para mostrar título y contexto. Lista vacía → `EmptyState`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/matching/pages/ApplicationsPage.tsx
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Inbox } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ApplicationCard } from '../components/ApplicationCard';
import { useAccept, useApplications, usePlan, useReject } from '../hooks';
import type { ApiError } from '../../../api/errors';

export default function ApplicationsPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  const planQuery = usePlan(planId);
  const appsQuery = useApplications(planId);
  const accept = useAccept(planId ?? '');
  const reject = useReject(planId ?? '');

  const plan = planQuery.data;
  const applications = appsQuery.data ?? [];
  const pending = applications.filter((a) => a.status === 'pending');
  const decided = applications.filter((a) => a.status !== 'pending');

  const apiErr = appsQuery.error as ApiError | null;
  const isLoading = appsQuery.isLoading;

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">Postulaciones</h1>
          <p className="text-xs text-gray-500 truncate">
            {plan ? plan.title : 'Cargando plan...'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {isLoading && <Spinner label="Cargando postulaciones..." />}

        {!isLoading && appsQuery.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar las postulaciones.'}
            onRetry={() => void appsQuery.refetch()}
          />
        )}

        {!isLoading && !appsQuery.isError && applications.length === 0 && (
          <EmptyState
            title="Todavía no hay postulaciones"
            hint="Cuando alguien se postule a tu plan, aparecerá acá para que la aceptes o rechaces."
            icon={<Inbox className="w-8 h-8 text-gray-300" />}
          />
        )}

        {/* Pendientes primero */}
        {pending.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">
              Pendientes ({pending.length})
            </h2>
            {pending.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                actionLoading={accept.isPending || reject.isPending}
                onAccept={(id) => accept.mutate(id)}
                onReject={(id) => reject.mutate(id)}
              />
            ))}
          </section>
        )}

        {/* Ya decididas */}
        {decided.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Decididas</h2>
            {decided.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/matching/pages/ApplicationsPage.tsx
git commit -m "feat(matching): ApplicationsPage con aceptar/rechazar (host)"
```

---

## Task 7: `MyApplicationsPage` (`/me/applications`) — mis postulaciones

**Files:**
- Create: `frontend/src/features/matching/pages/MyApplicationsPage.tsx`

`GET /me/applications` paginado → `useMyApplications` (infinite). Cada item muestra plan (link a `/plans/:planId`), estado (badge) y botón "Retirar" si está `pending` (`useWithdraw`). Botón "cargar más" si `hasNextPage`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/matching/pages/MyApplicationsPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Inbox, MapPin } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmActionDialog } from '../components/ConfirmActionDialog';
import { APPLICATION_STATUS_META } from '../constants';
import { useMyApplications, useWithdraw } from '../hooks';
import { formatRating, formatRelativeTime } from '../../../lib/format';
import type { ApiError } from '../../../api/errors';
import type { ApplicationOut } from '../types';

export default function MyApplicationsPage() {
  const navigate = useNavigate();
  const query = useMyApplications();
  const withdraw = useWithdraw();
  const [pendingWithdraw, setPendingWithdraw] = useState<string | null>(null);

  const applications = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/me')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Mis postulaciones</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {query.isLoading && <Spinner label="Cargando tus postulaciones..." />}

        {!query.isLoading && query.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar tus postulaciones.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && applications.length === 0 && (
          <EmptyState
            title="No tenés postulaciones"
            hint="Explorá planes cercanos y postulate desde el detalle de un plan."
            icon={<Inbox className="w-8 h-8 text-gray-300" />}
            actionLabel="Explorar planes"
            onAction={() => navigate('/explore')}
          />
        )}

        {applications.map((app) => (
          <MyApplicationRow
            key={app.id}
            application={app}
            onOpenPlan={() => navigate(`/plans/${app.plan_id}`)}
            onWithdraw={() => setPendingWithdraw(app.id)}
          />
        ))}

        {query.hasNextPage && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? (
                <>
                  <Spinner size={16} /> Cargando...
                </>
              ) : (
                'Cargar más'
              )}
            </Button>
          </div>
        )}
      </div>

      <ConfirmActionDialog
        open={pendingWithdraw !== null}
        title="¿Retirar postulación?"
        message="Si retirás tu postulación, el organizador ya no la verá como pendiente. Podés postularte de nuevo más adelante."
        confirmLabel="Sí, retirar"
        danger
        loading={withdraw.isPending}
        onConfirm={() => {
          if (pendingWithdraw) {
            withdraw.mutate(pendingWithdraw, {
              onSettled: () => setPendingWithdraw(null),
            });
          }
        }}
        onClose={() => setPendingWithdraw(null)}
      />
    </div>
  );
}

function MyApplicationRow({
  application,
  onOpenPlan,
  onWithdraw,
}: {
  application: ApplicationOut;
  onOpenPlan: () => void;
  onWithdraw: () => void;
}) {
  const meta = APPLICATION_STATUS_META[application.status];
  const a = application.applicant;

  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={a.display_name} src={a.avatar_url ?? undefined} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">Postulaste {formatRelativeTime(application.created_at)}</p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </div>

      {application.message && (
        <p className="text-sm text-gray-600 bg-gray-50/60 rounded-xl p-3 border border-gray-100">
          “{application.message}”
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenPlan}
          className="flex items-center gap-2 text-sm text-brand-600 font-medium active:scale-95"
        >
          <MapPin className="w-4 h-4" />
          Ver plan
          <ChevronRight className="w-4 h-4" />
        </button>

        {application.status === 'pending' && (
          <button
            type="button"
            onClick={onWithdraw}
            className="text-sm text-red-600 font-medium active:scale-95"
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/matching/pages/MyApplicationsPage.tsx
git commit -m "feat(matching): MyApplicationsPage paginado con retirar postulación"
```

---

## Task 8: `MatchesPage` (`/matches`) — migración de MatchesView

**Files:**
- Create: `frontend/src/features/matching/pages/MatchesPage.tsx`

Migra `MatchesView` (App.tsx:233-256) del mockup con datos reales. `GET /matches` paginado → `useMatches`. Cada match se renderiza con `MatchCard` y abre `/matches/:matchId` al click. Lista vacía → `EmptyState` con link a explorar. Estados activos/completados/cancelados agrupados opcionalmente.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/matching/pages/MatchesPage.tsx
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { MatchCard } from '../components/MatchCard';
import { useMatches } from '../hooks';
import type { ApiError } from '../../../api/errors';

export default function MatchesPage() {
  const navigate = useNavigate();
  const query = useMatches();

  const matches = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  // Separamos activos del resto para UX.
  const active = matches.filter((m) => m.status === 'active');
  const past = matches.filter((m) => m.status !== 'active');

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col pt-safe-top">
      {/* Header (migrado de MatchesView App.tsx:235-239) */}
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
        <p className="text-sm text-gray-500 mt-1">Tus salidas confirmadas</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {query.isLoading && <Spinner label="Cargando tus matches..." />}

        {!query.isLoading && query.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar tus matches.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && matches.length === 0 && (
          <EmptyState
            title="No tenés matches todavía"
            hint="Cuando un organizador acepte tu postulación —o aceptes una al plan que creaste— aparecerá acá."
            icon={<MessageCircle className="w-8 h-8 text-gray-300" />}
            actionLabel="Explorar planes"
            onAction={() => navigate('/explore')}
          />
        )}

        {/* Activos */}
        {active.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Activos</h2>
            {active.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={(id) => navigate(`/matches/${id}`)}
                showChatButton
              />
            ))}
          </section>
        )}

        {/* Historial (completados/cancelados) */}
        {past.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Historial</h2>
            {past.map((match) => (
              <MatchCard key={match.id} match={match} onClick={(id) => navigate(`/matches/${id}`)} />
            ))}
          </section>
        )}

        {query.hasNextPage && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/matching/pages/MatchesPage.tsx
git commit -m "feat(matching): MatchesPage migrado de MatchesView con datos reales"
```

---

## Task 9: `MatchDetailPage` (`/matches/:matchId`)

**Files:**
- Create: `frontend/src/features/matching/pages/MatchDetailPage.tsx`

`GET /matches/{id}` → `MatchOut`. Muestra participantes (`MatchParticipantList`), ubicación exacta (mapa si `exact_location_lat/lng` no son null; si no, "Ubicación no disponible"), estado. Botones complete/cancel (`useCompleteMatch`/`useCancelMatch`) con confirmación. Teasers de chat (F5) y safety (F6): botones que navegan a `/matches/:matchId/chat` y `/matches/:matchId/safety` con fallback a toast si la ruta no existe todavía. Solo se muestran acciones si el match está `active`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/matching/pages/MatchDetailPage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MapPin, MessageCircle, Shield, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { MatchParticipantList } from '../components/MatchParticipantList';
import { ConfirmActionDialog } from '../components/ConfirmActionDialog';
import { MATCH_STATUS_META } from '../constants';
import { useAuth } from '../../../auth/useAuth';
import { useCompleteMatch, useCancelMatch, useMatch } from '../hooks';
import { formatDateTime } from '../../../lib/format';
import type { ApiError } from '../../../api/errors';

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: match, isLoading, isError, error, refetch } = useMatch(matchId);
  const complete = useCompleteMatch(matchId ?? '');
  const cancel = useCancelMatch(matchId ?? '');

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const apiErr = error as ApiError | null;
  const isNotFound = apiErr?.status === 404 || apiErr?.code === 'not_found';

  if (isLoading) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner label="Cargando match..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center p-6">
        {isNotFound ? (
          <ErrorState
            message="Este match no existe o no tenés acceso."
            onRetry={() => navigate('/matches', { replace: true })}
            retryLabel="Volver a matches"
          />
        ) : (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudo cargar el match'}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    );
  }

  if (!match) return null;

  const meta = MATCH_STATUS_META[match.status];
  const isActive = match.status === 'active';
  const hasExactLocation =
    match.exact_location_lat !== null && match.exact_location_lng !== null;
  const names = match.participants.map((p) => p.display_name).join(' · ');

  const openChat = () => {
    // F5 registra /matches/:matchId/chat. Si aún no existe, react-router muestra la
    // ruta padre (este mismo detalle) o un 404. Para no romper F4, navegamos y dejamos
    // que F5 añada la ruta; si no existe, el Outlet del layout manejará el fallback.
    navigate(`/matches/${matchId}/chat`);
  };

  const openSafety = () => {
    navigate(`/matches/${matchId}/safety`);
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/matches')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{names}</h1>
          <p className="text-xs text-gray-500">
            Inició {formatDateTime(match.started_at)}
          </p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Ubicación exacta */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Punto de encuentro
          </h2>
          {hasExactLocation ? (
            <div className="rounded-2xl overflow-hidden border border-gray-100 h-48">
              <MapBackground
                userLocation={[match.exact_location_lat!, match.exact_location_lng!]}
                plans={[
                  {
                    id: 'meet',
                    lat: match.exact_location_lat!,
                    lng: match.exact_location_lng!,
                  },
                ]}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 flex flex-col items-center justify-center text-center gap-2 bg-white">
              <MapPin className="w-6 h-6 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">
                Ubicación no disponible
              </p>
              <p className="text-xs text-gray-400">
                El organizador no fijó un punto exacto o todavía no tenés acceso.
              </p>
            </div>
          )}
        </section>

        {/* Participantes */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Participantes ({match.participants.length})
          </h2>
          <MatchParticipantList
            participants={match.participants}
            currentUserId={auth.user?.id}
          />
        </section>

        {/* Acciones rápidas: chat + safety (teasers de F5/F6) */}
        {isActive && (
          <section className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={openChat} className="flex-col h-auto py-4">
              <MessageCircle className="w-6 h-6 mb-1" />
              <span className="text-sm">Chat</span>
            </Button>
            <Button variant="ghost" onClick={openSafety} className="flex-col h-auto py-4">
              <Shield className="w-6 h-6 mb-1" />
              <span className="text-sm">Seguridad</span>
            </Button>
          </section>
        )}

        {/* Estado final */}
        {match.ended_at && (
          <p className="text-xs text-gray-500 text-center">
            {match.status === 'completed' ? 'Finalizado' : 'Cancelado'} el{' '}
            {formatDateTime(match.ended_at)}
          </p>
        )}

        {/* Acciones de cierre del match */}
        {isActive && (
          <section className="flex flex-col gap-2 mt-2">
            <Button onClick={() => setConfirmComplete(true)}>
              <Check className="w-5 h-5" />
              Finalizar match
            </Button>
            <Button variant="ghost" className="text-red-600" onClick={() => setConfirmCancel(true)}>
              <X className="w-5 h-5" />
              Cancelar match
            </Button>
          </section>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmComplete}
        title="¿Finalizar match?"
        message="Marcá el encuentro como finalizado. Esto habilita las reseñas del otro participante."
        confirmLabel="Sí, finalizar"
        loading={complete.isPending}
        onConfirm={() => {
          complete.mutate(undefined, {
            onSettled: () => setConfirmComplete(false),
          });
        }}
        onClose={() => setConfirmComplete(false)}
      />

      <ConfirmActionDialog
        open={confirmCancel}
        title="¿Cancelar match?"
        message="Si cancelás el match, no podrán seguir coordinando ni dejar reseñas. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        danger
        loading={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(undefined, {
            onSettled: () => setConfirmCancel(false),
          });
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}
```

> **Notas de implementación:**
> - `formatDateTime` se asume en `lib/format` (F0). Si en F0 la función disponible es solo `formatRelativeTime`, sustituirla: `formatRelativeTime(match.started_at)`. Verificar la firma real antes de continuar.
> - Las teasers de chat/safety navegan a rutas que F5/F6 registrarán. Si F5 no corrió, `navigate('/matches/:id/chat')` caerá en el fallback del router (típicamente redirect a `/matches` o un 404). Para evitar romper F4 en integración, podría añadirse un guard `if (routeExists)`, pero react-router-dom v7 no expone chequeo de rutas en runtime de forma simple; la convención es confiar en que F5/F6 se ejecuten después. Si se quiere degradar elegante sin esperar F5, el botón puede mostrar `toast.info('El chat estará disponible pronto (F5).')` en lugar de `navigate`. **Decisión:** se deja `navigate` para que la feature sea funcional en cuanto F5 exista; documentar el acoplamiento.
> - `useAuth().user?.id` resalta "(vos)" en `MatchParticipantList`.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/matching/pages/MatchDetailPage.tsx
git commit -m "feat(matching): MatchDetailPage con ubicación exacta, complete/cancel y teasers chat/safety"
```

---

## Task 10: Conectar "Postularme" en `PlanDetailPage` (F3)

**Files:**
- Modify: `frontend/src/features/plans/pages/PlanDetailPage.tsx`

F3 dejó `onApply` como stub vacío en `PlanDetailSheet`. F4 lo conecta: abre el `ApplySheet` con `planId`. Solo aplica si el usuario **no** es host (el sheet ya no se muestra para hosts, pero por seguridad el handler verifica).

- [ ] **Step 1: Modificar `PlanDetailPage.tsx`**

Abrir `frontend/src/features/plans/pages/PlanDetailPage.tsx`. Añadir import de `ApplySheet` y estado local `showApply`. Conectar el handler `onApply` del `PlanDetailSheet`.

Localizar el bloque de imports y añadir (junto a los imports existentes de F3):

```ts
// frontend/src/features/plans/pages/PlanDetailPage.tsx — añadir import
import { ApplySheet } from '../../matching/components/ApplySheet';
```

Añadir estado dentro del componente `PlanDetailPage` (junto a `showEdit`/`confirmCancel` existentes):

```ts
const [showApply, setShowApply] = useState(false);
```

Modificar el `PlanDetailSheet` para que `onApply` abra el sheet (reemplazar el stub vacío `onApply={() => {}}` existente):

```tsx
<PlanDetailSheet
  plan={plan}
  userLocation={gps.location}
  isHost={isHost}
  onClose={() => navigate('/explore')}
  onEdit={() => setShowEdit(true)}
  onCancel={() => setConfirmCancel(true)}
  onApply={() => {
    // Solo un no-host puede postularse.
    if (!isHost) setShowApply(true);
  }}
/>
```

Añadir el `ApplySheet` al final del JSX (junto a `EditPlanSheet` y `ConfirmDialog` existentes):

```tsx
{!isHost && showApply && (
  <ApplySheet
    planId={plan.id}
    planTitle={plan.title}
    onClose={() => setShowApply(false)}
    onApplied={() => {
      // useApply ya invalida ['my-applications'] y toastea.
      // Opcional: redirigir a "Mis postulaciones".
    }}
  />
)}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

> Si `PlanDetailPage` de F3 ya no tiene el stub `onApply` vacío (porque F3 evolucionó), localizar el botón "Postularme" en `PlanDetailSheet` y asegurarse de que llame al `onApply` prop, y que `PlanDetailPage` lo conecte a `setShowApply(true)`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/pages/PlanDetailPage.tsx
git commit -m "feat(matching): conectar botón Postularme en PlanDetailPage a ApplySheet"
```

---

## Task 11: Registrar rutas en el router

**Files:**
- Modify: `frontend/src/router.tsx`

Registra `/plans/:planId/applications`, `/matches`, `/matches/:matchId`, `/me/applications` bajo `RequireAuth` con `React.lazy` (code-split por página). Mantén las rutas de F0-F3 existentes.

> **Supuesto:** `router.tsx` ya existe (F0) con un `createBrowserRouter` que envuelve rutas protegidas con `<RequireAuth>`, y F3 ya registró `/explore`, `/plans/new`, `/plans/:planId`. Si la estructura exacta difiere, insertar estas rutas en el bloque protegido equivalente.

- [ ] **Step 1: Modificar `router.tsx`**

Localizar el bloque de imports lazy (donde F3 añadió `ExplorePage`, `CreatePlanPage`, `PlanDetailPage`). Añadir:

```ts
// frontend/src/router.tsx — añadir al bloque de imports lazy existente
const ApplicationsPage = lazy(() => import('./features/matching/pages/ApplicationsPage'));
const MyApplicationsPage = lazy(() => import('./features/matching/pages/MyApplicationsPage'));
const MatchesPage = lazy(() => import('./features/matching/pages/MatchesPage'));
const MatchDetailPage = lazy(() => import('./features/matching/pages/MatchDetailPage'));
```

Dentro del `children` del layout protegido (junto a las rutas de F3), añadir:

```tsx
{
  path: 'plans/:planId/applications',
  element: <PageSuspense><ApplicationsPage /></PageSuspense>,
},
{
  path: 'matches',
  element: <PageSuspense><MatchesPage /></PageSuspense>,
},
{
  path: 'matches/:matchId',
  element: <PageSuspense><MatchDetailPage /></PageSuspense>,
},
{
  path: 'me/applications',
  element: <PageSuspense><MyApplicationsPage /></PageSuspense>,
},
```

> `PageSuspense` ya existe (definido por F3: `<Suspense fallback={<Spinner full />}>`). Reusarlo. Si F3 no lo definió con ese nombre, usar el wrapper que exista o definirlo inline.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Smoke test del router**

Run: `cd frontend && npm run build`
Expected: build exitoso; aparecen chunks `ApplicationsPage-*.js`, `MyApplicationsPage-*.js`, `MatchesPage-*.js`, `MatchDetailPage-*.js`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "feat(matching): registrar rutas /matches, /matches/:id, /plans/:id/applications, /me/applications"
```

---

## Task 12: Enlace de navegación a "Mis postulaciones" (opcional, desde el perfil)

**Files:**
- Modify: `frontend/src/features/users/pages/ProfilePage.tsx` (F2)

Para que el usuario pueda llegar a "Mis postulaciones" sin URL directa, se añade un acceso desde el `ProfilePage` de F2. Si F2 no existe todavía o no tiene este patrón, este task puede posponerse a la fase de integración; pero dejando el enlace listo, el flujo F4 es navegable.

- [ ] **Step 1: Añadir enlace en `ProfilePage`**

Localizar `frontend/src/features/users/pages/ProfilePage.tsx`. En la lista de acciones del perfil (junto a "Editar perfil", "Contactos de confianza"), añadir:

```tsx
// frontend/src/features/users/pages/ProfilePage.tsx — añadir en la lista de acciones
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

// dentro del componente:
const navigate = useNavigate();

// en el JSX de la lista de acciones:
<button
  type="button"
  onClick={() => navigate('/me/applications')}
  className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform"
>
  <div className="flex items-center gap-3">
    <ClipboardList className="w-5 h-5 text-gray-400" />
    <span className="font-medium text-gray-700">Mis postulaciones</span>
  </div>
  <ChevronRight className="w-5 h-5 text-gray-300" />
</button>
```

> Si `ProfilePage` de F2 no sigue este patrón de botones-lista, ubicar el contenedor equivalente y añadir el acceso con el mismo estilo visual. El objetivo es que exista un punto de entrada navegable a `/me/applications`.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/pages/ProfilePage.tsx
git commit -m "feat(matching): enlace a Mis postulaciones desde el perfil"
```

---

## Verificación final (Definition of Done)

Antes de cerrar F4, ejecutar y confirmar:

- [ ] `cd frontend && npx tsc --noEmit` → sin errores.
- [ ] `cd frontend && npm run build` → build verde, chunks de matching generados.
- [ ] `cd frontend && npx vitest run` → todos los tests pasan (incluye los de F0-F3 y los nuevos de matching: schemas + hooks).
- [ ] Navegación manual (con backend levantado en `:8000` y dos usuarios A/B):
  - **Postularse:** A crea un plan. B entra a `/plans/:id`, toca "Postularme" → abre `ApplySheet` → escribe mensaje opcional → submit → `POST /plans/:id/applications` 201 → toast "Te postulaste".
  - **409 ya postulado:** B intenta postularse de nuevo → toast "Ya te habías postulado a este plan."
  - **422 plan propio:** A entra a su propio plan → botón "Postularme" no aparece (es host, ve editar/cancelar).
  - **Vista host:** A entra a `/plans/:id/applications` → ve la postulación de B (pendiente) → "Aceptar" → `POST /applications/:id/accept` → si alcanza `max_participants`, toast "¡Se formó un match!".
  - **Rechazar:** A rechaza otra postulación → toast "Postulación rechazada" → la app pasa a "Decididas".
  - **Retirar:** B entra a `/me/applications` → ve su postulación pendiente → "Retirar" → confirmación → `DELETE /applications/:id` → toast "Postulación retirada".
  - **Matches:** ambos entran a `/matches` → ven el match activo → click → `/matches/:id`.
  - **Ubicación exacta:** en `MatchDetailPage`, si el plan tenía coords exactas, se ve el mapa; si no, "Ubicación no disponible".
  - **Finalizar:** "Finalizar match" → confirmación → `POST /matches/:id/complete` → estado pasa a "Finalizado" y desaparecen botones de acción.
  - **Cancelar:** (con otro match) "Cancelar match" → confirmación → estado "Cancelado".
  - **404 match ajeno:** `/matches/<uuid-ajeno>` → `ErrorState` "Este match no existe o no tenés acceso".
  - **Paginación:** si hay >50 matches/postulaciones, aparece botón "Cargar más".

## Notas de consistencia con F0-F3 / F5+

- **Query keys:** F4 usa `['applications', planId]`, `['my-applications']`, `['matches']`, `['matches', matchId]`. F5 (Chat) leerá `['matches', matchId]` para saber si el match sigue activo (y deshabilitar el input si no). F6 (Safety) invalidará `['matches']` al activar/desactivar `location_sharing_active`. Mantener la jerarquía.
- **Invalidación cruzada:** `useAccept` invalida `['matches']` porque al formarse un match el usuario pasa a tener uno nuevo. `useCompleteMatch`/`useCancelMatch` actualizan el detalle y la lista. Si F5 añade `['messages', matchId]`, no se invalida desde aquí (F5 se encarga de su caché).
- **`PlanDetailPage` + `ApplySheet`:** el handler `onApply` que F3 dejó como stub ahora abre el sheet. F5/F6 no tocan esto. Si se añade lógica de "ya estás en un match con este plan", ese check va en `ApplySheet` (verificar `useMyApplications` antes de abrir, o manejar el 422 del backend — ya toasteado).
- **Paginación:** `GET /plans/{id}/applications` es **array directo** (igual que `GET /plans`). `GET /me/applications` y `GET /matches` son paginados. Esto está documentado en `hooks.ts` y `types.ts`. Si el backend añade cursor a `/plans/{id}/applications` en el futuro, migrar `useApplications` a `useInfiniteQuery`.
- **Teasers chat/safety:** `MatchDetailPage` navega a `/matches/:id/chat` y `/matches/:id/safety`. Estas rutas las registran F5 y F6 respectivamente. Si se ejecuta F4 sin F5, los botones navegan a una ruta inexistente → el router fallback aplica. Documentar el orden de ejecución (F4 → F5 → F6) en el roadmap.
- **`lib/format`:** se usa `formatDateTime`, `formatRelativeTime`, `formatRating`. Si F0 solo definió `formatRelativeTime` y `formatRating`, añadir `formatDateTime(iso)` en `lib/format.ts` (formato `d 'de' MMM, HH:mm` con locale es) o sustituir las llamadas por `formatRelativeTime`. Verificar la firma real antes de continuar.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El backend no devuelve `next_cursor` correctamente (devuelve siempre null) | `useInfiniteQuery.hasNextPage` será false tras la primera página; el botón "Cargar más" no aparece. No rompe la UI. Reportar como bug del backend. |
| `useAccept` devuelve null cuando el usuario esperaba match (plan con max_participants > 1) | El toast diferencia: "Postulación aceptada." (null) vs "¡Se formó un match!" (MatchOut). UX clara. |
| La ubicación exacta es null para el host mismo | El host ve "Ubicación no disponible" en su propio match si no fijó coords. Aceptable: el flujo de fijar ubicación exacta puede ser parte de F6 (safety) o una edición futura del plan. |
| Race condition: dos hosts aceptan la última postulación simultáneamente | El backend valida atomicidad; el segundo `accept` devuelve 422 "ya decidida" → `errorMessage` toastea "No se puede realizar esta acción sobre el plan." |
| Teasers chat/safety rompen si F5/F6 no corrieron | Documentado: F4 asume el orden F4→F5→F6. Si se quiere degradar elegante, cambiar `navigate(...)` por `toast.info('Próximamente')` en `MatchDetailPage`. |
| `datetime-local` + offset en `started_at`/`ended_at` | Estos campos son de solo lectura (vienen del backend, ISO con Z). `formatDateTime` los parsea con `new Date(iso)`; no hay input del usuario. |

---

## Resumen de commits (orden de ejecución)

1. `feat(matching): añadir tipos y constantes del dominio Matching`
2. `test(matching): validar ApplicationIn con zod`
3. `feat(matching): hooks de datos y mutaciones con React Query`
4. `feat(matching): componentes presentacionales ApplicationCard/MatchCard/ParticipantList/ConfirmActionDialog`
5. `feat(matching): ApplySheet con react-hook-form + zod`
6. `feat(matching): ApplicationsPage con aceptar/rechazar (host)`
7. `feat(matching): MyApplicationsPage paginado con retirar postulación`
8. `feat(matching): MatchesPage migrado de MatchesView con datos reales`
9. `feat(matching): MatchDetailPage con ubicación exacta, complete/cancel y teasers chat/safety`
10. `feat(matching): conectar botón Postularme en PlanDetailPage a ApplySheet`
11. `feat(matching): registrar rutas /matches, /matches/:id, /plans/:id/applications, /me/applications`
12. `feat(matching): enlace a Mis postulaciones desde el perfil`
