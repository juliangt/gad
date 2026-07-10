# Planes Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el dominio Plans en el frontend de GAD (Fase F3): explorar el mapa con planes reales del backend, crearlos con un formulario validado por zod, ver su detalle, y editarlos/cancelarlos como host. Sustituir `MOCK_PLANS` por datos vivos.

**Architecture:** Feature-based: `src/features/plans/` contiene `types.ts` (espejo del contrato), `hooks.ts` (TanStack Query v5), `components/` (PlanCard, GpsIndicator, ActivityPicker, PlanFilters, PlanDetailSheet, EditPlanSheet) y `pages/` (ExplorePage, CreatePlanPage, PlanDetailPage). Un hook `useUserLocation` envuelve `navigator.geolocation` (vía `lib/geo.ts` de F0) y produce los estados `searching/fixed/denied`. Los hooks de datos consumen `api/client.ts` (F0). React Router v7 expone `/explore`, `/plans/new`, `/plans/:planId`. Mutaciones invalidan la key `['plans']`. La paginación de `GET /plans` es un **array directo sin cursor** (documentado y respetado).

**Tech Stack:** React 19, TypeScript, react-router-dom v7, TanStack Query v5, react-hook-form, zod, date-fns v4 (locale `es`), react-leaflet, lucide-react, Tailwind v4 (glassmorphism), Vitest + @testing-library/react + jsdom, sonner.

---

## Prerrequisitos (de F0-F2)

Este plan asume que las siguientes piezas ya existen y funcionan (no se reimplementan aquí):

| Pieza | Archivo | Interfaz que se consume en F3 |
|---|---|---|
| API client | `src/api/client.ts` | `apiGet<T>(path, opts?)`, `apiPost<T>(path, body, opts?)`, `apiPatch<T>(path, body)`, `apiDelete<T>(path)` — lanzan `ApiError(code, status, detail)` y aplican el interceptor 401→refresh |
| ApiError | `src/api/errors.ts` | `new ApiError(code, status, detail)`; campos públicos `.code`, `.status`, `.detail` |
| Auth | `src/auth/useAuth.ts` | `useAuth()` → `{ user: UserPublic \| null, status }` (UserPublic tiene `id`, `display_name`, `verification_level`, `reputation_score`) |
| Geolocation | `src/lib/geo.ts` | `getCurrentPosition(opts?): Promise<{lat:number; lng:number}>` (rechaza con `GeolocationError`); `haversineMeters(lat1,lng1,lat2,lng2): number` |
| Formato | `src/lib/format.ts` | `formatDistance(meters): string`, `formatRelativeTime(iso, locale?): string`, `formatRating(n): string` |
| Types comunes | `src/types/common.ts` | `HostSummary` (`{ id; display_name; avatar_url; reputation_score; verification_level }`), `ErrorOut`, `OKMessage` |
| Enums | `src/types/enums.ts` | `ActivityType`, `PlanMode`, `PlanStatus`, `VerificationLevel` (union de strings literales) |
| UI | `src/components/ui/` | `Button`, `Input`, `Textarea`, `Spinner`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Badge`, `Avatar`, `Modal`, `BottomSheet` (con mismas clases `glass-panel`/`glass-button`) |
| Layout | `src/components/layout/BottomNav.tsx` | `<BottomNav/>` con `NavLink` a `/explore`, `/matches`, `/me` |
| MapBackground | `src/components/MapBackground.tsx` | `<MapBackground userLocation plans onPlanClick className />` — `plans: { id; lat; lng }[]` |
| QueryClient | `src/main.tsx` | `QueryClientProvider` con `defaultOptions.queries.staleTime = 30_000`, `refetchOnWindowFocus: true` |
| Router | `src/router.tsx` | `createBrowserRouter` con `RequireAuth` envolviendo rutas protegidas; `/explore`, `/plans/new`, `/plans/:planId` **aún no registradas** (las añade este plan) |
| Toaster | `src/main.tsx` | `<Toaster/>` de sonner montado |
| Vitest | `vitest.config.ts`, `src/test/setup.ts` | jsdom + `@testing-library/jest-dom` globales; mock de `@/lib/geo` y `@/api/client` vía `vi.mock` |

> Si alguna de las firmas anteriores no coincide con lo que existe en el repo al ejecutar, **detener** y reconciliar antes de continuar: este plan depende literalmente de esos nombres.

**Convenciones de rutas de import:**
- En el repo actual el alias `@` apunta a `frontend/` (ver `vite.config.ts`). Por ello los imports absolutos usan `@/frontend/src/...` NO — el alias es desde dentro de `frontend/`, así que desde un archivo en `frontend/src/...` se escribe `@/src/...`. **Sin embargo**, los archivos del frontend existentes (`App.tsx`, `MapBackground.tsx`) usan imports **relativos** (`./lib/utils`, `../lib/utils`). Para minimizar fricción con lo que ya existe, **este plan usa exclusivamente imports relativos** (`../types`, `../../components/ui/Button`, etc.), igual que el código migrado de F0/F1/F2. No se introduce el alias `@/`.

**Stack de test:** Vitest (globals: `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`), `@testing-library/react`, `renderHook`+`waitFor` de `@testing-library/react`. Los hooks de React Query se testean con un `createTestQueryClient()` + `QueryClientProvider` wrapper. Se mockean `@/api/client` y `@/lib/geo` con `vi.mock`.

---

## File Structure

Archivos a crear/modificar en F3 (todos con ruta absoluta desde la raíz del repo):

```
frontend/src/features/plans/
├── types.ts                              # NUEVO — PlanIn, PlanOut, PlanListItem, PlanUpdateIn, ActivityType/PlanMode/PlanStatus re-exportados, PlanFilters
├── schemas.ts                            # NUEVO — schemas zod: planInSchema, planUpdateInSchema
├── hooks.ts                              # NUEVO — usePlans, usePlan, useCreatePlan, useUpdatePlan, useCancelPlan, usePlanFilters
├── constants.ts                          # NUEVO — ACTIVITY_TYPES, ACTIVITY_META (icon,label,color), PLAN_MODES
├── components/
│   ├── GpsIndicator.tsx                  # NUEVO — migrado de App.tsx:66-94, re-tipado
│   ├── PlanCard.tsx                      # NUEVO — migrado de App.tsx:97-143, re-tipado PlanListItem
│   ├── ActivityPicker.tsx                # NUEVO — selector de 7 actividades (migrado/expandido de CreatePlanModal)
│   ├── PlanFilters.tsx                   # NUEVO — filtros por activity + mode en el header de explore
│   ├── PlanDetailSheet.tsx               # NUEVO — sheet inferior de detalle (migrado de App.tsx:504-573), reutilizado en ExplorePage
│   └── EditPlanSheet.tsx                 # NUEVO — edición PATCH (host) con react-hook-form + zod
├── pages/
│   ├── ExplorePage.tsx                   # NUEVO — migrado de ExploreView App.tsx:179-231 con datos reales
│   ├── CreatePlanPage.tsx                # NUEVO — migrado de CreatePlanModal App.tsx:290-466 como página /plans/new
│   └── PlanDetailPage.tsx                # NUEVO — /plans/:planId (vista full-screen)
└── useUserLocation.ts                    # NUEVO — hook de geolocalización (idle/requesting/granted/denied)

frontend/src/features/plans/__tests__/
├── schemas.test.ts                       # NUEVO — validación planInSchema/planUpdateInSchema
├── hooks.test.tsx                        # NUEVO — usePlans, usePlan, useCreatePlan con mocks
├── useUserLocation.test.tsx              # NUEVO — estados del hook
├── PlanCard.test.tsx                     # NUEVO — render + distancia
└── GpsIndicator.test.tsx                 # NUEVO — 3 estados

frontend/src/router.tsx                   # MODIFICAR — registrar /explore, /plans/new, /plans/:planId
frontend/src/App.tsx                      # MODIFICAR — eliminar MOCK_PLANS y todo el código migrado a features/
frontend/src/types/common.ts              # (verificar) HostSummary ya definido; si no, añadir
```

**Decisiones de descomposición:**
- `types.ts` y `schemas.ts` se separan: el primero es puramente tipos TS (espejo del contrato), el segundo son los schemas zod ejecutables usados por los formularios. Así los hooks pueden importar tipos sin arrastrar zod al bundle de listados.
- `useUserLocation.ts` se separa de `hooks.ts` porque NO usa React Query (es estado local con side-effect sobre `navigator`), y podría reusarse en otras features (matching, safety) — pero por ahora vive en `features/plans/` y se exporta de ahí (F6 puede promoverlo a `src/hooks/` si reutiliza).
- `constants.ts` centraliza los metadatos de actividades (icono lucide, label es-AR, color de badge) para que `ActivityPicker`, `PlanCard` y `PlanFilters` compartan una sola fuente.
- `PlanDetailSheet` (bottom sheet) y `PlanDetailPage` (página completa) comparten la lógica de visualización; este plan opta por **página completa** como ruta (`/plans/:planId`) y mantiene el `PlanDetailSheet` reutilizable para el caso de explore sin perder URL. ExplorePage puede abrir el sheet para preview rápido, pero el detalle canónico es la página.
- `EditPlanSheet` es un bottom-sheet porque edita campos acotados (`title`, `description`, `scheduled_at`) — una página entera sería excesiva.

---

## Task 1: Tipos de Plans (`types.ts`) y constantes

**Files:**
- Create: `frontend/src/features/plans/types.ts`
- Create: `frontend/src/features/plans/constants.ts`
- (Verify): `frontend/src/types/common.ts` — confirmar que `HostSummary` existe.

- [ ] **Step 1: Verificar/crear `HostSummary` en `common.ts`**

Abrir `frontend/src/types/common.ts`. Si **no** contiene `HostSummary`, añadirlo:

```ts
// frontend/src/types/common.ts — añadir si no existe
export interface HostSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}
```

Si ya existe, omitir este paso.

- [ ] **Step 2: Crear `frontend/src/features/plans/types.ts`**

```ts
// frontend/src/features/plans/types.ts
// Espejo de la sección "Planes (/plans)" de docs/API_CONTRACT.md.

import type { HostSummary } from '../../types/common';
import type {
  ActivityType,
  PlanMode,
  PlanStatus,
} from '../../types/enums';

// Re-export de enums para que las features consuman desde un único punto.
export type { ActivityType, PlanMode, PlanStatus } from '../../types/enums';

/** Subset del location válido para crear plan. */
export interface PlanLocationInput {
  lat: number; // -90..90
  lng: number; // -180..180
  label: string; // 1..200
}

/** Body de POST /plans  (PlanIn en el contrato). */
export interface PlanIn {
  activity_type: ActivityType;
  mode: PlanMode;
  scheduled_at: string | null; // ISO 8601; obligatorio si mode === 'scheduled'
  window_minutes: number; // 15..1440, default 120
  max_participants: number; // 1..10, default 1
  title: string; // 1..200
  description: string | null; // ..1000
  location: PlanLocationInput;
  search_radius_m: number; // 100..50000, default 2000
}

/** Body de PATCH /plans/{id} (PlanUpdateIn en el contrato). Todos opcionales. */
export interface PlanUpdateIn {
  title?: string; // 1..200
  description?: string | null; // ..1000
  scheduled_at?: string | null; // ISO 8601
}

/** Respuesta de GET /plans/{id}, POST /plans, PATCH /plans/{id}, DELETE /plans/{id}. */
export interface PlanOut {
  id: string;
  activity_type: ActivityType;
  mode: PlanMode;
  scheduled_at: string | null;
  window_minutes: number;
  max_participants: number;
  current_participants: number;
  title: string;
  description: string | null;
  location_label: string;
  location_lat: number;
  location_lng: number;
  search_radius_m: number;
  status: PlanStatus;
  expires_at: string;
  host: HostSummary;
  created_at: string;
}

/**
 * Item de GET /plans. El contrato documenta que `GET /plans` devuelve
 * `PlanListItem[]` (= `PlanOut[]`) SIN cursor — NO es PaginatedOut.
 * Por eso `usePlans` usa `useQuery` (array directo), no `useInfiniteQuery`.
 */
export type PlanListItem = PlanOut;

/** Filtros de UI aplicables a GET /plans. `lat`/`lng` son obligatorios. */
export interface PlansQuery {
  lat: number;
  lng: number;
  radius?: number; // metros, 100..50000, default 2000
  activity?: ActivityType;
  mode?: PlanMode;
}

/** Estado interno de la UI de filtros (incluye 'all' = sin filtro). */
export interface PlanFiltersState {
  activity: ActivityType | 'all';
  mode: PlanMode | 'all';
}
```

- [ ] **Step 3: Crear `frontend/src/features/plans/constants.ts`**

```ts
// frontend/src/features/plans/constants.ts
import {
  Coffee,
  Beer,
  Utensils,
  Footprints,
  Trees,
  CalendarHeart,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityType, PlanMode } from './types';

export interface ActivityMeta {
  id: ActivityType;
  label: string; // es-AR
  icon: LucideIcon;
  /** Tailwind bg/text para chip seleccionado. */
  activeClass: string;
}

/** Las 7 actividades del enum ActivityType (orden de UI). */
export const ACTIVITY_TYPES: ActivityMeta[] = [
  { id: 'coffee', label: 'Café', icon: Coffee, activeClass: 'bg-brand-50 text-brand-600 border-brand-200' },
  { id: 'drinks', label: 'Cerveza', icon: Beer, activeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'food', label: 'Comida', icon: Utensils, activeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'walk', label: 'Caminata', icon: Footprints, activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'park', label: 'Parque', icon: Trees, activeClass: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'event', label: 'Evento', icon: CalendarHeart, activeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'other', label: 'Otro', icon: MapPin, activeClass: 'bg-gray-100 text-gray-700 border-gray-200' },
];

/** Lookup rápido id → meta. */
export const ACTIVITY_META: Record<ActivityType, ActivityMeta> = Object.fromEntries(
  ACTIVITY_TYPES.map((a) => [a.id, a]),
) as Record<ActivityType, ActivityMeta>;

export interface PlanModeMeta {
  id: PlanMode;
  label: string;
}

export const PLAN_MODES: PlanModeMeta[] = [
  { id: 'now', label: 'Ahora' },
  { id: 'scheduled', label: 'Agendar' },
];

/** Valores por defecto del formulario de creación (alineados con el backend). */
export const PLAN_DEFAULTS = {
  activity_type: 'coffee' as ActivityType,
  mode: 'now' as PlanMode,
  window_minutes: 120,
  max_participants: 1,
  search_radius_m: 2000,
} as const;

/** Rate limit documentado: POST /plans → 10/hora. */
export const PLAN_CREATE_RATE_LIMIT_PER_HOUR = 10;
```

- [ ] **Step 4: Verificar tipos compilan**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores. (Si `@/types/enums` no existe todavía porque F0 no corrió, ver nota de prerrequisitos.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/types.ts frontend/src/features/plans/constants.ts frontend/src/types/common.ts
git commit -m "feat(plans): añadir tipos y constantes del dominio Plans"
```

---

## Task 2: Schemas zod (`schemas.ts`) + tests

**Files:**
- Create: `frontend/src/features/plans/schemas.ts`
- Test: `frontend/src/features/plans/__tests__/schemas.test.ts`

- [ ] **Step 1: Escribir el test de validación (TDD)**

```ts
// frontend/src/features/plans/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { planInSchema, planUpdateInSchema } from '../schemas';

describe('planInSchema', () => {
  const validBase = {
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 1,
    title: 'Café de especialidad',
    description: 'Charlar un rato',
    location: { lat: -34.588, lng: -58.431, label: 'Palermo' },
    search_radius_m: 2000,
  } as const;

  it('acepta un plan now válido', () => {
    expect(planInSchema.parse(validBase)).toEqual(validBase);
  });

  it('acepta un plan scheduled con ISO válido', () => {
    const ok = { ...validBase, mode: 'scheduled', scheduled_at: '2026-07-10T18:30:00Z' };
    expect(planInSchema.parse(ok)).toEqual(ok);
  });

  it('rechaza plan scheduled sin scheduled_at (422 backend)', () => {
    const bad = { ...validBase, mode: 'scheduled', scheduled_at: null };
    expect(() => planInSchema.parse(bad)).toThrow();
  });

  it('rechaza title vacío', () => {
    expect(() => planInSchema.parse({ ...validBase, title: '' })).toThrow();
  });

  it('rechaza title > 200', () => {
    expect(() => planInSchema.parse({ ...validBase, title: 'x'.repeat(201) })).toThrow();
  });

  it('rechaza description > 1000', () => {
    expect(() => planInSchema.parse({ ...validBase, description: 'x'.repeat(1001) })).toThrow();
  });

  it('rechaza activity_type inválido', () => {
    expect(() => planInSchema.parse({ ...validBase, activity_type: 'party' })).toThrow();
  });

  it('rechaza mode inválido', () => {
    expect(() => planInSchema.parse({ ...validBase, mode: 'later' })).toThrow();
  });

  it('window_minutes fuera de rango 15..1440 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, window_minutes: 10 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, window_minutes: 1500 })).toThrow();
  });

  it('max_participants fuera de 1..10 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, max_participants: 0 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, max_participants: 11 })).toThrow();
  });

  it('search_radius_m fuera de 100..50000 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, search_radius_m: 50 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, search_radius_m: 60000 })).toThrow();
  });

  it('lat fuera de -90..90 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 91, lng: 0, label: 'x' } })).toThrow();
  });

  it('lng fuera de -180..180 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 0, lng: 181, label: 'x' } })).toThrow();
  });

  it('location.label vacío → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 0, lng: 0, label: '' } })).toThrow();
  });

  it('scheduled_at inválido (no ISO) → error', () => {
    expect(() => planInSchema.parse({ ...validBase, mode: 'scheduled', scheduled_at: 'mañana' })).toThrow();
  });
});

describe('planUpdateInSchema', () => {
  it('acepta objeto vacío (todo opcional)', () => {
    expect(planUpdateInSchema.parse({})).toEqual({});
  });

  it('acepta title + description', () => {
    expect(planUpdateInSchema.parse({ title: 'Nuevo', description: 'desc' })).toEqual({ title: 'Nuevo', description: 'desc' });
  });

  it('acepta description null', () => {
    expect(planUpdateInSchema.parse({ description: null })).toEqual({ description: null });
  });

  it('rechaza title > 200', () => {
    expect(() => planUpdateInSchema.parse({ title: 'x'.repeat(201) })).toThrow();
  });

  it('rechaza title vacío si viene', () => {
    expect(() => planUpdateInSchema.parse({ title: '' })).toThrow();
  });

  it('rechaza description > 1000', () => {
    expect(() => planUpdateInSchema.parse({ description: 'x'.repeat(1001) })).toThrow();
  });

  it('rechaza scheduled_at inválido', () => {
    expect(() => planUpdateInSchema.parse({ scheduled_at: 'no-iso' })).toThrow();
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/schemas.test.ts`
Expected: FAIL — `Cannot find module '../schemas'`.

- [ ] **Step 3: Implementar `schemas.ts`**

```ts
// frontend/src/features/plans/schemas.ts
import { z } from 'zod';
import { ACTIVITY_TYPES, PLAN_MODES } from './constants';

const activityEnum = z.enum(
  ACTIVITY_TYPES.map((a) => a.id) as [string, ...string[]],
);
const modeEnum = z.enum(PLAN_MODES.map((m) => m.id) as [string, ...string[]]);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1).max(200),
});

/**
 * Schema de PlanIn. La regla de negocio clave es:
 * si mode === 'scheduled', scheduled_at es obligatorio y debe ser ISO válido.
 */
export const planInSchema = z
  .object({
    activity_type: activityEnum,
    mode: modeEnum,
    scheduled_at: z.union([z.string().datetime(), z.null()]).default(null),
    window_minutes: z.number().int().min(15).max(1440).default(120),
    max_participants: z.number().int().min(1).max(10).default(1),
    title: z.string().min(1).max(200),
    description: z.union([z.string().max(1000), z.null()]).default(null),
    location: locationSchema,
    search_radius_m: z.number().int().min(100).max(50000).default(2000),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'scheduled' && !val.scheduled_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduled_at'],
        message: 'Elegí cuándo querés que suceda el plan',
      });
    }
  });

export type PlanInForm = z.infer<typeof planInSchema>;

/** PlanUpdateIn: todos los campos opcionales. */
export const planUpdateInSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.union([z.string().max(1000), z.null()]).optional(),
    scheduled_at: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .strict();

export type PlanUpdateForm = z.infer<typeof planUpdateInSchema>;
```

> Nota: `z.string().datetime()` en zod valida strings ISO 8601 con offset/Z. Coincide con lo que pide el backend.

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/schemas.test.ts`
Expected: PASS — todos los casos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/schemas.ts frontend/src/features/plans/__tests__/schemas.test.ts
git commit -m "test(plans): validar PlanIn y PlanUpdateIn con zod"
```

---

## Task 3: Hook de geolocalización (`useUserLocation`)

**Files:**
- Create: `frontend/src/features/plans/useUserLocation.ts`
- Test: `frontend/src/features/plans/__tests__/useUserLocation.test.tsx`

Este hook no usa React Query: es estado local con side-effect sobre `navigator.geolocation` (vía `lib/geo.ts::getCurrentPosition`). Produce los estados que consume `GpsIndicator`.

- [ ] **Step 1: Escribir el test del hook**

```tsx
// frontend/src/features/plans/__tests__/useUserLocation.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { useUserLocation } from '../useUserLocation';

vi.mock('../../lib/geo', () => ({
  getCurrentPosition: vi.fn(),
}));

import { getCurrentPosition } from '../../lib/geo';

const mockGeo = vi.mocked(getCurrentPosition);

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe('useUserLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca en estado idle con location null', () => {
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('pasa a requesting al llamar request() y a granted con coords al resolver', async () => {
    mockGeo.mockResolvedValueOnce({ lat: -34.59, lng: -58.43 });
    const { result } = renderHook(() => useUserLocation(), { wrapper });

    let p!: Promise<void>;
    act(() => {
      p = result.current.request();
    });
    expect(result.current.status).toBe('requesting');

    await act(async () => {
      await p;
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual([-34.59, -58.43]);
  });

  it('pasa a denied si getCurrentPosition rechaza (permiso denegado)', async () => {
    mockGeo.mockRejectedValueOnce(new Error('User denied Geolocation'));
    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await act(async () => {
      await result.current.request().catch(() => {});
    });
    expect(result.current.status).toBe('denied');
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('setManualLocation fija coordenadas y pasa a granted (fallback)', () => {
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    act(() => {
      result.current.setManualLocation(-34.6, -58.4);
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual([-34.6, -58.4]);
  });

  it('reset vuelve a idle', async () => {
    mockGeo.mockResolvedValueOnce({ lat: -34.59, lng: -58.43 });
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await act(async () => {
      await result.current.request();
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/useUserLocation.test.tsx`
Expected: FAIL — `Cannot find module '../useUserLocation'`.

- [ ] **Step 3: Implementar el hook**

```ts
// frontend/src/features/plans/useUserLocation.ts
import { useCallback, useState } from 'react';
import { getCurrentPosition } from '../../lib/geo';

export type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export interface UseUserLocationResult {
  status: GpsStatus;
  /** [lat, lng] o null. */
  location: [number, number] | null;
  error: Error | null;
  /** Pide permiso y lee la posición. No lanza: captura a estado `denied`. */
  request: () => Promise<void>;
  /** Fallback manual (input de barrio → coords resueltas externamente). */
  setManualLocation: (lat: number, lng: number) => void;
  reset: () => void;
}

export function useUserLocation(): UseUserLocationResult {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const request = useCallback(async () => {
    setStatus('requesting');
    setError(null);
    try {
      const pos = await getCurrentPosition();
      setLocation([pos.lat, pos.lng]);
      setStatus('granted');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('denied');
    }
  }, []);

  const setManualLocation = useCallback((lat: number, lng: number) => {
    setLocation([lat, lng]);
    setError(null);
    setStatus('granted');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setLocation(null);
    setError(null);
  }, []);

  return { status, location, error, request, setManualLocation, reset };
}
```

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/useUserLocation.test.tsx`
Expected: PASS — 5 casos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/useUserLocation.ts frontend/src/features/plans/__tests__/useUserLocation.test.tsx
git commit -m "feat(plans): hook useUserLocation con estados GPS"
```

---

## Task 4: Hooks de datos (`hooks.ts`) + tests

**Files:**
- Create: `frontend/src/features/plans/hooks.ts`
- Test: `frontend/src/features/plans/__tests__/hooks.test.tsx`

**Documentación clave de paginación:** `GET /plans` devuelve `PlanListItem[]` (array directo, **no** `PaginatedOut`). Por eso `usePlans` usa `useQuery`, no `useInfiniteQuery`. Esto difiere de matches/notifications/reviews (que sí son paginados por cursor) — queda documentado en el código.

- [ ] **Step 1: Escribir tests de hooks con mocks**

```tsx
// frontend/src/features/plans/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePlans,
  usePlan,
  useCreatePlan,
  useUpdatePlan,
  useCancelPlan,
} from '../hooks';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import type { PlanOut } from '../types';

const mGet = vi.mocked(apiGet);
const mPost = vi.mocked(apiPost);
const mPatch = vi.mocked(apiPatch);
const mDel = vi.mocked(apiDelete);

function makePlan(overrides: Partial<PlanOut> = {}): PlanOut {
  return {
    id: 'p1',
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 2,
    current_participants: 1,
    title: 'Café',
    description: 'desc',
    location_label: 'Palermo',
    location_lat: -34.588,
    location_lng: -58.431,
    search_radius_m: 2000,
    status: 'open',
    expires_at: '2026-07-10T18:00:00Z',
    host: {
      id: 'u1',
      display_name: 'Sofía',
      avatar_url: null,
      reputation_score: 4.9,
      verification_level: 'email',
    },
    created_at: '2026-07-09T17:00:00Z',
    ...overrides,
  };
}

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

beforeEach(() => vi.clearAllMocks());

describe('usePlans', () => {
  it('usa la query key correcta y llama GET /plans con query params', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makePlan()]);
    const { result } = renderHook(
      () => usePlans({ lat: -34.59, lng: -58.43, radius: 2000 }),
      { wrapper: withClient(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans', {
      params: { lat: -34.59, lng: -58.43, radius: 2000 },
    });
    expect(result.current.data).toHaveLength(1);
  });

  it('omite activity/mode undefined', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => usePlans({ lat: 0, lng: 0, activity: 'coffee', mode: 'now' }),
      { wrapper: withClient(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans', {
      params: { lat: 0, lng: 0, activity: 'coffee', mode: 'now' },
    });
  });

  it('no habilita la query si lat/lng son null', async () => {
    const client = newClient();
    const { result } = renderHook(() => usePlans(null), {
      wrapper: withClient(client),
    });
    expect(mGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('usePlan', () => {
  it('usa key ["plans", id] y GET /plans/{id}', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce(makePlan({ id: 'abc' }));
    const { result } = renderHook(() => usePlan('abc'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans/abc');
    expect(result.current.data?.id).toBe('abc');
  });
});

describe('useCreatePlan', () => {
  it('POST /plans y al éxito invalida ["plans"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makePlan({ id: 'new1' }));

    const { result } = renderHook(() => useCreatePlan(), {
      wrapper: withClient(client),
    });
    result.current.mutate({
      activity_type: 'coffee',
      mode: 'now',
      scheduled_at: null,
      window_minutes: 120,
      max_participants: 1,
      title: 'Café',
      description: null,
      location: { lat: -34.59, lng: -58.43, label: 'Palermo' },
      search_radius_m: 2000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/plans', expect.objectContaining({ title: 'Café' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
  });
});

describe('useUpdatePlan', () => {
  it('PATCH /plans/{id} e invalida detalle + lista', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPatch.mockResolvedValueOnce(makePlan({ id: 'p9', title: 'Nuevo' }));

    const { result } = renderHook(() => useUpdatePlan('p9'), {
      wrapper: withClient(client),
    });
    result.current.mutate({ title: 'Nuevo' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPatch).toHaveBeenCalledWith('/plans/p9', { title: 'Nuevo' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'p9'] });
  });
});

describe('useCancelPlan', () => {
  it('DELETE /plans/{id} e invalida lista', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mDel.mockResolvedValueOnce(makePlan({ id: 'p9', status: 'cancelled' }));

    const { result } = renderHook(() => useCancelPlan(), {
      wrapper: withClient(client),
    });
    result.current.mutate('p9');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mDel).toHaveBeenCalledWith('/plans/p9');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/hooks.test.tsx`
Expected: FAIL — `Cannot find module '../hooks'`.

- [ ] **Step 3: Implementar `hooks.ts`**

```ts
// frontend/src/features/plans/hooks.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client';
import { toast } from 'sonner';
import {
  PLAN_CREATE_RATE_LIMIT_PER_HOUR,
} from './constants';
import type {
  PlanIn,
  PlanListItem,
  PlanOut,
  PlansQuery,
  PlanUpdateIn,
} from './types';

/** Query params numéricos como espera el wrapper api/client. */
function toQuery(q: PlansQuery): Record<string, number | string> {
  const params: Record<string, number | string> = { lat: q.lat, lng: q.lng };
  if (q.radius !== undefined) params.radius = q.radius;
  if (q.activity) params.activity = q.activity;
  if (q.mode) params.mode = q.mode;
  return params;
}

/**
 * GET /plans — devuelve un array directo (PlanListItem[]), NO paginado.
 * El contrato API documenta que /plans no usa cursor; por eso useQuery y no
 * useInfiniteQuery. Si en el futuro el backend añade cursor, migrar aquí.
 *
 * `query` es `null` mientras no haya ubicación del usuario → la query queda
 * deshabilitada y no dispara requests sin lat/lng (que darían 422).
 */
export function usePlans(
  query: PlansQuery | null,
  options?: Omit<UseQueryOptions<PlanListItem[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: query
      ? ['plans', { lat: query.lat, lng: query.lng, radius: query.radius, activity: query.activity, mode: query.mode }]
      : ['plans', 'disabled'],
    queryFn: () =>
      apiGet<PlanListItem[]>('/plans', { params: toQuery(query!) }),
    enabled: query !== null,
    staleTime: 30_000,
    ...options,
  });
}

/** GET /plans/{id} */
export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: ['plans', planId],
    queryFn: () => apiGet<PlanOut>(`/plans/${planId}`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

/** POST /plans — rate limit documentado 10/hora (manejado vía 429). */
export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanIn) => apiPost<PlanOut>('/plans', input),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(`Plan "${plan.title}" publicado`);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'rate_limit_exceeded') {
        toast.error(
          `Alcanzaste el límite de ${PLAN_CREATE_RATE_LIMIT_PER_HOUR} planes por hora. Intentá más tarde.`,
        );
      } else {
        toast.error('No se pudo publicar el plan. Intentá de nuevo.');
      }
    },
  });
}

/** PATCH /plans/{id} — solo host. */
export function useUpdatePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanUpdateIn) =>
      apiPatch<PlanOut>(`/plans/${planId}`, input),
    onSuccess: (plan) => {
      qc.setQueryData(['plans', planId], plan);
      qc.invalidateQueries({ queryKey: ['plans', planId] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan actualizado');
    },
    onError: () => toast.error('No se pudo actualizar el plan.'),
  });
}

/** DELETE /plans/{id} — cancela (host). */
export function useCancelPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiDelete<PlanOut>(`/plans/${planId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan cancelado');
    },
    onError: () => toast.error('No se pudo cancelar el plan.'),
  });
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/hooks.test.tsx`
Expected: PASS — todos los casos.

> **Nota sobre el wrapper `api/client`:** los tests asumen que `apiGet(path, { params })` serializa `params` a query string. Si el cliente real de F0 usa otra forma (ej. `apiGet(\`${path}?lat=...\`)` o un segundo argumento `query`), ajustar tanto la firma del mock como la llamada en `toQuery` para que coincidan. **Verificar la firma real de `api/client.ts` antes de continuar.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/hooks.ts frontend/src/features/plans/__tests__/hooks.test.tsx
git commit -m "feat(plans): hooks usePlans/usePlan/useCreatePlan/useUpdatePlan/useCancelPlan"
```

---

## Task 5: `GpsIndicator` (migrado de App.tsx:66-94)

**Files:**
- Create: `frontend/src/features/plans/components/GpsIndicator.tsx`
- Test: `frontend/src/features/plans/__tests__/GpsIndicator.test.tsx`

Migración fiel del componente visual del mockup, re-tipada con el `GpsStatus` del hook `useUserLocation`. `searching` ahora mapea desde `requesting` (lo decide el padre).

- [ ] **Step 1: Test de render**

```tsx
// frontend/src/features/plans/__tests__/GpsIndicator.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsIndicator } from '../components/GpsIndicator';

describe('GpsIndicator', () => {
  it('muestra "Buscando señal..." en searching', () => {
    render(<GpsIndicator status="searching" />);
    expect(screen.getByText(/Buscando señal/i)).toBeInTheDocument();
  });

  it('muestra "Ubicación precisa" en fixed', () => {
    render(<GpsIndicator status="fixed" />);
    expect(screen.getByText(/Ubicación precisa/i)).toBeInTheDocument();
  });

  it('muestra "Sin ubicación" en denied', () => {
    render(<GpsIndicator status="denied" />);
    expect(screen.getByText(/Sin ubicación/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/GpsIndicator.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

```tsx
// frontend/src/features/plans/components/GpsIndicator.tsx
import { AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type IndicatorStatus = 'searching' | 'fixed' | 'denied';

interface Props {
  status: IndicatorStatus;
  className?: string;
}

/**
 * Migrado de App.tsx:66-94. Mantiene los 3 estados visuales:
 * searching (ámbar, pulso), fixed (brand), denied (rojo).
 */
export function GpsIndicator({ status, className }: Props) {
  return (
    <div
      className={cn(
        'glass-panel rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium transition-all',
        status === 'searching' && 'text-amber-600 border-amber-200/50',
        status === 'fixed' && 'text-brand-600 border-brand-200/50',
        status === 'denied' && 'text-red-500 border-red-200/50',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {status === 'searching' && (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Buscando señal...
        </>
      )}
      {status === 'fixed' && (
        <>
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          Ubicación precisa
        </>
      )}
      {status === 'denied' && (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          Sin ubicación
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/GpsIndicator.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/components/GpsIndicator.tsx frontend/src/features/plans/__tests__/GpsIndicator.test.tsx
git commit -m "feat(plans): migrar GpsIndicator con tipos y a11y"
```

---

## Task 6: `PlanCard` (migrado de App.tsx:97-143)

**Files:**
- Create: `frontend/src/features/plans/components/PlanCard.tsx`
- Test: `frontend/src/features/plans/__tests__/PlanCard.test.tsx`

Re-tipado con `PlanListItem`. La distancia se calcula con `haversineMeters` entre `userLocation` y `plan.location_lat/lng`, formateada con `formatDistance`. Iconos por activity vía `ACTIVITY_META`.

- [ ] **Step 1: Test**

```tsx
// frontend/src/features/plans/__tests__/PlanCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanCard } from '../components/PlanCard';
import type { PlanListItem } from '../types';

vi.mock('../../../lib/geo', () => ({ haversineMeters: () => 350 }));
vi.mock('../../../lib/format', () => ({ formatDistance: (m: number) => `${m}m` }));

const plan: PlanListItem = {
  id: 'p1',
  activity_type: 'coffee',
  mode: 'now',
  scheduled_at: null,
  window_minutes: 120,
  max_participants: 2,
  current_participants: 1,
  title: 'Café de especialidad',
  description: 'desc',
  location_label: 'Palermo',
  location_lat: -34.588,
  location_lng: -58.431,
  search_radius_m: 2000,
  status: 'open',
  expires_at: '2026-07-10T18:00:00Z',
  host: { id: 'u1', display_name: 'Sofía', avatar_url: null, reputation_score: 4.9, verification_level: 'email' },
  created_at: '2026-07-09T17:00:00Z',
};

describe('PlanCard', () => {
  it('renderiza título y participantes current/max', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText('Café de especialidad')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('muestra distancia calculada desde haversine', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText(/A 350m de ti/i)).toBeInTheDocument();
  });

  it('muestra "Ahora" si mode=now', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText('Ahora')).toBeInTheDocument();
  });

  it('muestra hora formateada si mode=scheduled', () => {
    render(<PlanCard plan={{ ...plan, mode: 'scheduled', scheduled_at: '2026-07-09T18:30:00Z' }} userLocation={[-34.59, -58.43]} />);
    // Badge "Agendar" o la hora; aquí validamos que NO dice "Ahora"
    expect(screen.queryByText('Ahora')).not.toBeInTheDocument();
  });

  it('dispara onClick al clickear', () => {
    const onClick = vi.fn();
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} onClick={onClick} />);
    screen.getByText('Café de especialidad').closest('div')!.click();
    expect(onClick).toHaveBeenCalledWith('p1');
  });

  it('sin userLocation muestra distancia como "—" (no rompe)', () => {
    render(<PlanCard plan={plan} userLocation={null} />);
    expect(screen.getByText(/A — de ti/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/PlanCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `PlanCard`**

```tsx
// frontend/src/features/plans/components/PlanCard.tsx
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { haversineMeters } from '../../../lib/geo';
import { formatDistance } from '../../../lib/format';
import { ACTIVITY_META } from '../constants';
import type { PlanListItem } from '../types';

interface Props {
  plan: PlanListItem;
  userLocation: [number, number] | null;
  onClick?: (planId: string) => void;
}

export function PlanCard({ plan, userLocation, onClick }: Props) {
  const meta = ACTIVITY_META[plan.activity_type] ?? ACTIVITY_META.other;
  const ActivityIcon = meta.icon;
  const distanceLabel = userLocation
    ? formatDistance(haversineMeters(userLocation[0], userLocation[1], plan.location_lat, plan.location_lng))
    : '—';

  return (
    <div
      onClick={() => onClick?.(plan.id)}
      className="glass-panel p-4 rounded-2xl flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(plan.id);
        }
      }}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-900/5 flex items-center justify-center text-gray-700">
            <ActivityIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{plan.title}</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
              <MapPin className="w-3 h-3" />
              <span>A {distanceLabel} de ti</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1">
        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5',
            plan.mode === 'now' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-600',
          )}
        >
          {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
          {plan.mode === 'now' ? 'Ahora' : formatScheduled(plan.scheduled_at)}
        </div>
        <div className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {plan.current_participants}/{plan.max_participants}
        </div>
      </div>
    </div>
  );
}

/** Helper local: formato corto "18:30" para el badge scheduled. */
function formatScheduled(iso: string | null): string {
  if (!iso) return 'Agendado';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Agendado';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/PlanCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/components/PlanCard.tsx frontend/src/features/plans/__tests__/PlanCard.test.tsx
git commit -m "feat(plans): migrar PlanCard con tipos y distancia haversine"
```

---

## Task 7: `ActivityPicker`

**Files:**
- Create: `frontend/src/features/plans/components/ActivityPicker.tsx`

Selector de las 7 actividades. Se usa en `CreatePlanPage`. No lleva test dedicado (componente de presentación simple); su contrato queda validado por el test de `CreatePlanPage`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/components/ActivityPicker.tsx
import { cn } from '../../../lib/utils';
import { ACTIVITY_TYPES } from '../constants';
import type { ActivityType } from '../types';

interface Props {
  value: ActivityType;
  onChange: (a: ActivityType) => void;
  className?: string;
}

/** Fila scrollable de chips de actividad (expandido a las 7 del enum). */
export function ActivityPicker({ value, onChange, className }: Props) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto hide-scrollbar pb-2', className)} role="radiogroup" aria-label="Actividad">
      {ACTIVITY_TYPES.map((act) => {
        const selected = act.id === value;
        const Icon = act.icon;
        return (
          <button
            key={act.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(act.id)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors border',
              selected
                ? act.activeClass
                : 'bg-gray-50 text-gray-600 border-gray-200',
            )}
          >
            <Icon className="w-4 h-4" />
            {act.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/components/ActivityPicker.tsx
git commit -m "feat(plans): ActivityPicker con 7 actividades"
```

---

## Task 8: `PlanFilters`

**Files:**
- Create: `frontend/src/features/plans/components/PlanFilters.tsx`

Barra de filtros opcional (activity + mode) sobre la lista. No aplica para el primer render; queda listo para activarse al tocar "Filtros".

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/components/PlanFilters.tsx
import { cn } from '../../../lib/utils';
import { ACTIVITY_TYPES, PLAN_MODES } from '../constants';
import type { PlanFiltersState } from '../types';

interface Props {
  value: PlanFiltersState;
  onChange: (next: PlanFiltersState) => void;
  className?: string;
}

export function PlanFilters({ value, onChange, className }: Props) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
        <Chip
          selected={value.activity === 'all'}
          onClick={() => onChange({ ...value, activity: 'all' })}
          label="Todas"
        />
        {ACTIVITY_TYPES.map((a) => (
          <Chip
            key={a.id}
            selected={value.activity === a.id}
            onClick={() => onChange({ ...value, activity: a.id })}
            label={a.label}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Chip
          selected={value.mode === 'all'}
          onClick={() => onChange({ ...value, mode: 'all' })}
          label="Cualquier momento"
        />
        {PLAN_MODES.map((m) => (
          <Chip
            key={m.id}
            selected={value.mode === m.id}
            onClick={() => onChange({ ...value, mode: m.id })}
            label={m.label}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
        selected
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white/80 text-gray-600 border-gray-200',
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/components/PlanFilters.tsx
git commit -m "feat(plans): PlanFilters por activity y mode"
```

---

## Task 9: `ExplorePage` (migrado de ExploreView App.tsx:179-231)

**Files:**
- Create: `frontend/src/features/plans/pages/ExplorePage.tsx`

Compone `MapBackground` + `GpsIndicator` + `PlanCard` lista + `PlanFilters` + FAB `/plans/new` + botón "centrar mapa". Usa `useUserLocation` (auto-request al montar) y `usePlans(location)` (React Query, staleTime 30s, refetch on focus — global en main.tsx). Entra a detalle vía `navigate('/plans/:id')`.

- [ ] **Step 1: Implementar `ExplorePage`**

```tsx
// frontend/src/features/plans/pages/ExplorePage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, Navigation, SlidersHorizontal } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { cn } from '../../../lib/utils';
import { GpsIndicator } from '../components/GpsIndicator';
import { PlanCard } from '../components/PlanCard';
import { PlanFilters } from '../components/PlanFilters';
import { usePlans } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import type { PlansQuery, PlanFiltersState } from '../types';

/** Mapea status del hook → status del GpsIndicator. */
function toIndicator(
  s: 'idle' | 'requesting' | 'granted' | 'denied',
): 'searching' | 'fixed' | 'denied' {
  if (s === 'granted') return 'fixed';
  if (s === 'denied') return 'denied';
  return 'searching';
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const gps = useUserLocation();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<PlanFiltersState>({ activity: 'all', mode: 'all' });
  const [recenterToken, setRecenterToken] = useState(0);

  // Pedir ubicación al montar.
  useEffect(() => {
    void gps.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plansQuery: PlansQuery | null = gps.location
    ? {
        lat: gps.location[0],
        lng: gps.location[1],
        radius: 5000,
        activity: filters.activity === 'all' ? undefined : filters.activity,
        mode: filters.mode === 'all' ? undefined : filters.mode,
      }
    : null;

  const { data: plans, isLoading, isError, error, refetch } = usePlans(plansQuery);

  const planMarkers = useMemo(
    () =>
      (plans ?? []).map((p) => ({
        id: p.id,
        lat: p.location_lat,
        lng: p.location_lng,
      })),
    [plans],
  );

  return (
    <div className="absolute inset-0">
      <MapBackground
        userLocation={gps.location}
        plans={planMarkers}
        onPlanClick={(id) => navigate(`/plans/${id}`)}
        // recenterToken se consume vía key para forzar re-mount del updater si MapBackground
        // no expone un método público. (Alternativa: pasar prop extra. Aquí usamos key.)
        key={`map-${recenterToken}`}
      />

      {/* Top floating area */}
      <div className="absolute top-0 w-full z-40 p-4 pt-safe-top flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-3xl font-bold tracking-tighter text-gray-900 drop-shadow-md">
            GAD
          </h1>
        </div>
        <div className="pointer-events-auto">
          <GpsIndicator status={toIndicator(gps.status)} />
        </div>
      </div>

      {/* Re-center + Filtros */}
      <div className="absolute bottom-44 right-4 z-40 flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            if (gps.location) setRecenterToken((t) => t + 1);
            else void gps.request();
          }}
          className="glass-button w-12 h-12 rounded-full flex items-center justify-center text-gray-700 shadow-lg"
          aria-label="Centrar mapa en mi ubicación"
        >
          <LocateFixed className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'glass-button w-12 h-12 rounded-full flex items-center justify-center shadow-lg',
            showFilters ? 'text-brand-600' : 'text-gray-700',
          )}
          aria-label="Mostrar filtros"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Filtros (toggle) */}
      {showFilters && (
        <div className="absolute top-16 left-0 w-full z-40 px-4 pointer-events-auto">
          <div className="glass-panel rounded-2xl p-3">
            <PlanFilters value={filters} onChange={setFilters} />
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div className="absolute bottom-20 w-full z-40 flex flex-col pointer-events-none">
        <div className="h-8 bg-gradient-to-t from-white/10 to-transparent w-full" />
        <div className="px-4 pb-6 flex flex-col gap-3 pointer-events-auto max-h-[40vh] overflow-y-auto hide-scrollbar">
          <div className="flex items-center justify-between mb-1 px-1">
            <h2 className="text-sm font-semibold text-gray-800 drop-shadow-sm">
              Cerca de ti
            </h2>
            <span className="text-xs font-medium text-brand-600 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full shadow-sm">
              {plans?.length ?? 0} planes
            </span>
          </div>

          {gps.status === 'denied' && (
            <div className="glass-panel rounded-2xl p-4 text-sm text-gray-700 flex flex-col gap-2">
              <p>
                Necesitamos tu ubicación para buscar planes cerca. Habilitá el permiso o
                ingresá un barrio.
              </p>
              <button
                type="button"
                onClick={() => void gps.request()}
                className="self-start text-brand-600 font-medium underline"
              >
                Reintentar GPS
              </button>
            </div>
          )}

          {gps.location && isLoading && <Spinner label="Buscando planes..." />}
          {gps.location && isError && (
            <ErrorState
              message={(error as { detail?: string })?.detail ?? 'No se pudieron cargar los planes'}
              onRetry={() => void refetch()}
            />
          )}
          {gps.location && !isLoading && !isError && (plans?.length ?? 0) === 0 && (
            <EmptyState
              title="No hay planes cerca"
              hint="Sé el primero en crear uno con el botón +"
            />
          )}

          {(plans ?? []).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              userLocation={gps.location}
              onClick={(id) => navigate(`/plans/${id}`)}
            />
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <button
          type="button"
          onClick={() => navigate('/plans/new')}
          className="bg-gray-900 text-white shadow-xl shadow-gray-900/20 w-14 h-14 rounded-full flex items-center justify-center transform transition-transform active:scale-95 border border-gray-800"
          aria-label="Crear plan"
        >
          <Navigation className="w-6 h-6 fill-current" />
        </button>
      </div>
    </div>
  );
}
```

> **Supuestos de componentes de UI:** `Spinner`, `ErrorState`, `EmptyState` existen en `components/ui/` (definidos en F0) con las props usadas (`label`, `message`+`onRetry`, `title`+`hint`). Si en F0 reciben otros nombres de props, ajustarlos aquí.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/pages/ExplorePage.tsx
git commit -m "feat(plans): ExplorePage con mapa real, GPS, lista y FAB"
```

---

## Task 10: `CreatePlanPage` (migrado de CreatePlanModal App.tsx:290-466)

**Files:**
- Create: `frontend/src/features/plans/pages/CreatePlanPage.tsx`

Página completa en `/plans/new` (no modal). Usa `react-hook-form` + `zod` (`planInSchema`) con resolver. La ubicación por defecto es la del usuario (vía `useUserLocation`); `location.label` es un input de texto. Mutation `useCreatePlan` → 201 → redirect `/plans/{id}`; 429 ya toastea el hook.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/pages/CreatePlanPage.tsx
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Calendar, ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ActivityPicker } from '../components/ActivityPicker';
import { PLAN_DEFAULTS, PLAN_MODES } from '../constants';
import { planInSchema, type PlanInForm } from '../schemas';
import { useCreatePlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import type { ActivityType, PlanMode } from '../types';

export default function CreatePlanPage() {
  const navigate = useNavigate();
  const gps = useUserLocation();
  const createPlan = useCreatePlan();

  useEffect(() => {
    void gps.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultValues: PlanInForm = useMemo(
    () => ({
      activity_type: PLAN_DEFAULTS.activity_type,
      mode: PLAN_DEFAULTS.mode,
      scheduled_at: null,
      window_minutes: PLAN_DEFAULTS.window_minutes,
      max_participants: PLAN_DEFAULTS.max_participants,
      title: '',
      description: null,
      location: {
        // Coords por defecto: las del usuario si ya hay, si no centro de CABA.
        lat: gps.location?.[0] ?? -34.5900,
        lng: gps.location?.[1] ?? -58.4300,
        label: '',
      },
      search_radius_m: PLAN_DEFAULTS.search_radius_m,
    }),
    // Solo calcular al montar; si el GPS llega después, el usuario puede tocar "usar mi ubicación".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlanInForm>({
    resolver: zodResolver(planInSchema),
    defaultValues,
    mode: 'onTouched',
  });

  const mode = watch('mode');

  const onSubmit = (values: PlanInForm) => {
    // Para mode=now, enviamos null (el backend usa "ahora").
    const payload = {
      ...values,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      // Forzar coords del usuario si las tenemos y el usuario no editó manualmente el label vacío.
      location: {
        ...values.location,
        lat: gps.location?.[0] ?? values.location.lat,
        lng: gps.location?.[1] ?? values.location.lng,
      },
    };
    createPlan.mutate(payload, {
      onSuccess: (plan) => navigate(`/plans/${plan.id}`, { replace: true }),
    });
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/explore')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Crear Plan</h1>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-5"
      >
        {/* Actividad */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            ¿Qué querés hacer?
          </label>
          <Controller
            control={control}
            name="activity_type"
            render={({ field }) => (
              <ActivityPicker value={field.value as ActivityType} onChange={field.onChange} />
            )}
          />
        </section>

        {/* Modalidad */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            ¿Cuándo?
          </label>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <div className="flex gap-2">
                {PLAN_MODES.map((m) => {
                  const selected = field.value === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        field.onChange(m.id as PlanMode);
                        if (m.id === 'now') setValue('scheduled_at', null);
                      }}
                      className={cn(
                        'flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border',
                        selected
                          ? 'bg-brand-50 text-brand-600 border-brand-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200',
                      )}
                    >
                      {m.id === 'now' ? <Clock className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </section>

        {/* Fecha/hora si scheduled */}
        {mode === 'scheduled' && (
          <section className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ¿Cuándo sucede?
            </label>
            <Input
              type="datetime-local"
              {...register('scheduled_at')}
              // datetime-local no admite ISO con Z; el usuario elige local y lo normalizamos antes del envío.
              onChange={(e) => {
                const v = e.target.value;
                setValue('scheduled_at', v ? new Date(v).toISOString() : null, { shouldValidate: true });
              }}
            />
            {errors.scheduled_at && (
              <p className="text-xs text-red-500">{errors.scheduled_at.message as string}</p>
            )}
          </section>
        )}

        {/* Título */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Título
          </label>
          <Input
            placeholder="Ej: Café de especialidad en Palermo"
            {...register('title')}
            error={errors.title?.message as string | undefined}
          />
        </section>

        {/* Descripción */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Descripción (opcional)
          </label>
          <Textarea
            rows={3}
            placeholder="Contá de qué se trata el plan..."
            {...register('description')}
            error={errors.description?.message as string | undefined}
          />
        </section>

        {/* Ubicación */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Ubicación
          </label>
          <Input
            placeholder="Barrio o referencia (ej: Palermo)"
            {...register('location.label')}
            error={errors.location?.label?.message as string | undefined}
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Coordenadas:{' '}
              {gps.location
                ? `${gps.location[0].toFixed(4)}, ${gps.location[1].toFixed(4)}`
                : '— sin GPS —'}
            </span>
            <button
              type="button"
              className="text-brand-600 font-medium underline"
              onClick={() => void gps.request()}
            >
              {gps.location ? 'Actualizar' : 'Activar GPS'}
            </button>
          </div>
        </section>

        {/* Participantes */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Cuánta gente busco (máx.)
          </label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={10}
              className="w-24"
              {...register('max_participants', { valueAsNumber: true })}
            />
            <span className="text-xs text-gray-500">Entre 1 y 10</span>
          </div>
          {errors.max_participants && (
            <p className="text-xs text-red-500">{errors.max_participants.message as string}</p>
          )}
        </section>

        {/* Radio de búsqueda */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Radio de búsqueda (metros)
          </label>
          <Input
            type="number"
            min={100}
            max={50000}
            step={100}
            {...register('search_radius_m', { valueAsNumber: true })}
          />
          {errors.search_radius_m && (
            <p className="text-xs text-red-500">{errors.search_radius_m.message as string}</p>
          )}
        </section>

        {/* Ventana de validez */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Vigencia del plan (minutos)
          </label>
          <Input
            type="number"
            min={15}
            max={1440}
            step={15}
            {...register('window_minutes', { valueAsNumber: true })}
          />
          {errors.window_minutes && (
            <p className="text-xs text-red-500">{errors.window_minutes.message as string}</p>
          )}
        </section>

        <Button type="submit" disabled={isSubmitting || createPlan.isPending} className="mt-2">
          {createPlan.isPending ? 'Publicando...' : 'Publicar Plan'}
        </Button>
      </form>
    </div>
  );
}
```

> **Notas de implementación:**
> - `datetime-local` produce strings tipo `2026-07-10T18:30` sin offset; se normaliza con `new Date(v).toISOString()` para enviar ISO con `Z` (lo exige `z.string().datetime()`). El backend interpreta UTC.
> - `Input` y `Textarea` asumen una prop `error?: string`. Si en F0 la firma difiere (ej. `aria-invalid` + mensaje externo), ajustar.
> - `window_minutes` y `search_radius_m` ya tienen defaults en el schema; el registro con `valueAsNumber` asegura tipos number.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/pages/CreatePlanPage.tsx
git commit -m "feat(plans): CreatePlanPage con react-hook-form + zod"
```

---

## Task 11: `PlanDetailSheet` (migrado de App.tsx:504-573)

**Files:**
- Create: `frontend/src/features/plans/components/PlanDetailSheet.tsx`

Sheet reutilizable (migrado del detalle inline del mockup) que muestra host (`HostSummary` con avatar, display_name, reputation_score, verification_level), descripción, participantes y badges de mode/distancia. Botones según rol: host → editar/cancelar; invitado → "Postularme" (esta acción se conecta en F4; aquí muestra toast "Próximamente").

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/components/PlanDetailSheet.tsx
import { Calendar, Check, Clock, MapPin, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { haversineMeters } from '../../../lib/geo';
import { formatDistance, formatRating } from '../../../lib/format';
import type { PlanOut } from '../types';

interface Props {
  plan: PlanOut;
  userLocation: [number, number] | null;
  /** true si el usuario actual es el host (puede editar/cancelar). */
  isHost: boolean;
  onClose?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onApply?: () => void;
}

export function PlanDetailSheet({
  plan,
  userLocation,
  isHost,
  onClose,
  onEdit,
  onCancel,
  onApply,
}: Props) {
  const distanceLabel = userLocation
    ? formatDistance(
        haversineMeters(userLocation[0], userLocation[1], plan.location_lat, plan.location_lng),
      )
    : '—';

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-2" />

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn(plan.mode === 'now' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-600')}>
                {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                {plan.mode === 'now' ? 'Ahora' : (plan.scheduled_at ?? 'Agendado')}
              </Badge>
              <Badge className="bg-gray-100 text-gray-600">
                <MapPin className="w-3.5 h-3.5" />
                A {distanceLabel}
              </Badge>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">{plan.title}</h2>
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

        {/* Host */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
          <Avatar
            name={plan.host.display_name}
            src={plan.host.avatar_url ?? undefined}
            size={48}
          />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Organizado por {plan.host.display_name}
            </h3>
            <p className="text-xs text-gray-500">
              Reputación: {formatRating(plan.host.reputation_score)} · {plan.host.verification_level}
            </p>
          </div>
          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-sm flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-brand-500" />
            {plan.current_participants}/{plan.max_participants}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Sobre el plan</h4>
          <p className="text-sm text-gray-600 leading-relaxed">
            {plan.description || 'Sin descripción'}
          </p>
        </div>

        {/* Acciones por rol */}
        {isHost ? (
          <div className="flex flex-col gap-2">
            <Button onClick={onEdit}>Editar plan</Button>
            <Button variant="ghost" className="text-red-600" onClick={onCancel}>
              Cancelar plan
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => {
              // F4 conecta este botón a useApply. Por ahora, toast informativo.
              onApply?.();
              if (!onApply) toast.info('Las postulaciones estarán disponibles pronto (F4).');
            }}
          >
            <Check className="w-5 h-5" />
            Postularme
          </Button>
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
git add frontend/src/features/plans/components/PlanDetailSheet.tsx
git commit -m "feat(plans): PlanDetailSheet con host, descripción y acciones por rol"
```

---

## Task 12: `EditPlanSheet` (PATCH, solo host)

**Files:**
- Create: `frontend/src/features/plans/components/EditPlanSheet.tsx`

Bottom-sheet con `react-hook-form` + `planUpdateInSchema` para editar `title`, `description`, `scheduled_at`. Solo accesible al host. Llama `useUpdatePlan(planId)`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/components/EditPlanSheet.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { planUpdateInSchema, type PlanUpdateForm } from '../schemas';
import { useUpdatePlan } from '../hooks';
import type { PlanOut } from '../types';

interface Props {
  plan: PlanOut;
  onClose: () => void;
  onSaved?: (plan: PlanOut) => void;
}

export function EditPlanSheet({ plan, onClose, onSaved }: Props) {
  const updatePlan = useUpdatePlan(plan.id);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PlanUpdateForm>({
    resolver: zodResolver(planUpdateInSchema),
    defaultValues: {
      title: plan.title,
      description: plan.description,
      scheduled_at: plan.scheduled_at,
    },
    mode: 'onTouched',
  });

  const onSubmit = (values: PlanUpdateForm) => {
    const payload = {
      title: values.title,
      description: values.description ?? null,
      scheduled_at: values.scheduled_at ?? null,
    };
    updatePlan.mutate(payload, {
      onSuccess: (updated) => {
        onSaved?.(updated);
        onClose();
      },
    });
  };

  return (
    <div className="absolute inset-0 z-[110] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[80vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Editar plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Título
            </label>
            <Input {...register('title')} error={errors.title?.message as string | undefined} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Descripción
            </label>
            <Textarea
              rows={4}
              {...register('description')}
              error={errors.description?.message as string | undefined}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Fecha y hora (solo si es agendado)
            </label>
            <Input
              type="datetime-local"
              defaultValue={
                plan.scheduled_at
                  ? new Date(plan.scheduled_at).toISOString().slice(0, 16)
                  : undefined
              }
              onChange={(e) => {
                const v = e.target.value;
                setValue('scheduled_at', v ? new Date(v).toISOString() : null, {
                  shouldValidate: true,
                });
              }}
            />
            {errors.scheduled_at && (
              <p className="text-xs text-red-500">{errors.scheduled_at.message as string}</p>
            )}
          </div>

          <Button type="submit" disabled={updatePlan.isPending}>
            {updatePlan.isPending ? 'Guardando...' : 'Guardar cambios'}
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
git add frontend/src/features/plans/components/EditPlanSheet.tsx
git commit -m "feat(plans): EditPlanSheet con PATCH validado"
```

---

## Task 13: `PlanDetailPage` (`/plans/:planId`) + cancelar

**Files:**
- Create: `frontend/src/features/plans/pages/PlanDetailPage.tsx`

Página canónica de detalle. Lee `planId` de la URL, `GET /plans/{id}` → `PlanOut`. Maneja 404. Determina `isHost` comparando `plan.host.id === useAuth().user?.id`. Botón cancelar abre `ConfirmDialog` → `useCancelPlan` → redirect `/explore`.

- [ ] **Step 1: Implementar**

```tsx
// frontend/src/features/plans/pages/PlanDetailPage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { PlanDetailSheet } from '../components/PlanDetailSheet';
import { EditPlanSheet } from '../components/EditPlanSheet';
import { usePlan, useCancelPlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import { useAuth } from '../../../auth/useAuth';
import type { ApiError } from '../../../api/errors';
import type { PlanOut } from '../types';

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const gps = useUserLocation();
  const { data: plan, isLoading, isError, error, refetch } = usePlan(planId);
  const cancelPlan = useCancelPlan();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const apiErr = error as ApiError | null;
  const isNotFound = apiErr?.status === 404 || apiErr?.code === 'not_found';

  if (isLoading) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner label="Cargando plan..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center p-6">
        {isNotFound ? (
          <ErrorState
            message="Este plan no existe o fue cancelado."
            onRetry={() => navigate('/explore', { replace: true })}
            retryLabel="Volver a explorar"
          />
        ) : (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudo cargar el plan'}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    );
  }

  if (!plan) return null;

  const isHost = auth.user?.id === plan.host.id;

  return (
    <div className="absolute inset-0">
      {/* Mini-mapa con la ubicación aproximada del plan */}
      <PlanDetailMap plan={plan} />

      {/* Back (top-left) */}
      <div className="absolute top-0 left-0 z-50 p-4 pt-safe-top">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-button w-9 h-9 rounded-full flex items-center justify-center text-gray-700"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <PlanDetailSheet
        plan={plan}
        userLocation={gps.location}
        isHost={isHost}
        onClose={() => navigate('/explore')}
        onEdit={() => setShowEdit(true)}
        onCancel={() => setConfirmCancel(true)}
        onApply={() => {
          // Se conecta en F4; dejamos el handler listo.
        }}
      />

      {showEdit && (
        <EditPlanSheet
          plan={plan}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            // useUpdatePlan ya invalida ['plans', planId]; el refetch es automático.
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar plan?"
        message="Vas a cancelar este plan. Los participantes serán notificados. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        cancelLabel="No, volver"
        danger
        loading={cancelPlan.isPending}
        onConfirm={() => {
          cancelPlan.mutate(plan.id, {
            onSuccess: () => navigate('/explore', { replace: true }),
            onSettled: () => setConfirmCancel(false),
          });
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

/** Mini-mapa con la ubicación del plan (sin markers de otros planes). */
function PlanDetailMap({ plan }: { plan: PlanOut }) {
  return (
    <div className="absolute inset-0 z-0">
      <MapBackground
        userLocation={[plan.location_lat, plan.location_lng]}
        plans={[{ id: plan.id, lat: plan.location_lat, lng: plan.location_lng }]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/pages/PlanDetailPage.tsx
git commit -m "feat(plans): PlanDetailPage con detalle, edición y cancelación"
```

---

## Task 14: Registrar rutas en el router + lazy loading

**Files:**
- Modify: `frontend/src/router.tsx`

Registra `/explore`, `/plans/new`, `/plans/:planId` bajo `RequireAuth` con `React.lazy` (code-split por página). `/` redirige a `/explore`.

> **Supuesto:** `router.tsx` ya existe (creado en F0) con un array `routes` o un `createBrowserRouter` que envuelve rutas protegidas con `<RequireAuth>`. Si la estructura exacta difiere, insertar estas tres rutas en el bloque protegido equivalente.

- [ ] **Step 1: Modificar `router.tsx`**

Localizar la sección de rutas protegidas (dentro del `children` de `RequireAuth`). Añadir imports lazy al inicio del archivo:

```ts
// frontend/src/router.tsx — añadir al bloque de imports existente
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner } from './components/ui/Spinner';

const ExplorePage = lazy(() => import('./features/plans/pages/ExplorePage'));
const CreatePlanPage = lazy(() => import('./features/plans/pages/CreatePlanPage'));
const PlanDetailPage = lazy(() => import('./features/plans/pages/PlanDetailPage'));

function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner full />}>{children}</Suspense>;
}
```

Y dentro del `children` del layout protegido (ajustar al nombre real del elemento; típicamente dentro de `RequireAuth`):

```tsx
// ruta índice → /explore
{ index: true, element: <Navigate to="/explore" replace /> },
{
  path: 'explore',
  element: <PageSuspense><ExplorePage /></PageSuspense>,
},
{
  path: 'plans/new',
  element: <PageSuspense><CreatePlanPage /></PageSuspense>,
},
{
  path: 'plans/:planId',
  element: <PageSuspense><PlanDetailPage /></PageSuspense>,
},
```

> Si `RequireAuth` se expone como un wrapper de `<Outlet/>`, estas rutas van como `children` del route que usa ese layout. Mantener las rutas de auth/perfil que ya existen (F1/F2).

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Smoke test del router**

Run (con backend no requerido para compilar): `cd frontend && npm run build`
Expected: build exitoso; aparecen chunks `ExplorePage-*.js`, `CreatePlanPage-*.js`, `PlanDetailPage-*.js`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "feat(plans): registrar rutas /explore, /plans/new, /plans/:planId"
```

---

## Task 15: Limpiar `App.tsx` (eliminar MOCK_PLANS y código migrado)

**Files:**
- Modify: `frontend/src/App.tsx`

`App.tsx` queda solo como shell: `<RouterProvider router={router}/>` (si F0 ya lo hizo así, este task es **no-op** y solo confirma que `MOCK_PLANS`, `GpsIndicator`, `PlanCard`, `ExploreView`, `CreatePlanModal` y el detalle inline **ya no existen** en `App.tsx`). Si todavía están (porque F0-F2 no los tocaron), eliminarlos.

- [ ] **Step 1: Reescribir `App.tsx` como shell mínimo**

```tsx
// frontend/src/App.tsx
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </>
  );
}
```

> Si F0/F1/F2 ya dejaron `App.tsx` en este estado, omitir la edición pero **confirmar** que no quedan referencias a `MOCK_PLANS`. Este paso garantiza que `MOCK_PLANS` se elimina en F3 según el spec §7.

- [ ] **Step 2: Verificar que no quedan referencias a MOCK_PLANS**

Run: `cd frontend && grep -rn "MOCK_PLANS" src/ || echo "OK: sin referencias"`
Expected: `OK: sin referencias`.

- [ ] **Step 3: Verificar build completo**

Run: `cd frontend && npm run build`
Expected: build verde, sin errores de TypeScript.

- [ ] **Step 4: Correr toda la suite de tests de Plans**

Run: `cd frontend && npx vitest run src/features/plans`
Expected: PASS — todos los tests de schemas, hooks, useUserLocation, PlanCard, GpsIndicator.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor(app): eliminar MOCK_PLANS y código migrado a features/plans"
```

---

## Verificación final (Definition of Done)

Antes de cerrar F3, ejecutar y confirmar:

- [ ] `cd frontend && npx tsc --noEmit` → sin errores.
- [ ] `cd frontend && npm run build` → build verde.
- [ ] `cd frontend && npx vitest run` → todos los tests pasan (incluye los de F0-F2).
- [ ] `cd frontend && grep -rn "MOCK_PLANS\|MOCK_PLAN" src/` → sin resultados.
- [ ] Navegación manual (con backend levantado en `:8000`):
  - Login → redirige a `/explore`.
  - `/explore` pide GPS; al aceptar, muestra el indicador "Ubicación precisa" y carga `GET /plans?lat=&lng=&radius=` (ver en Network).
  - FAB `+` → `/plans/new` con formulario; submit válido → `POST /plans` 201 → redirect `/plans/{id}`.
  - Submit con `mode=scheduled` sin fecha → validación zod bloquea.
  - Detalle de plan propio → botones "Editar" y "Cancelar plan" visibles; cancelar abre confirmación → `DELETE` → vuelta a `/explore`.
  - Detalle de plan ajeno → botón "Postularme" muestra toast "Próximamente (F4)".
  - Detalle de plan inexistente (`/plans/uuid-malo`) → `ErrorState` "Este plan no existe o fue cancelado".
  - GPS denegado → bloque "Necesitamos tu ubicación" con botón reintentar.

## Notas de consistencia con F0-F2 / F4+

- **Query keys:** este plan usa `['plans']` y `['plans', planId]`. F4 (Matching) las invalidará al aceptar/rechazar aplicaciones (porque `current_participants` cambia). Mantener la jerarquía.
- **`useUserLocation`:** se queda en `features/plans/` por ahora. F6 (Safety) necesitará `watchPosition`; entonces se promueve a `src/hooks/` y se añade el modo continuo. No duplicar.
- **Botón "Postularme":** el handler `onApply` queda listo en `PlanDetailSheet`; F4 lo conecta a `useApply(planId)` y reemplaza el toast.
- **Rate limit 10/hora de `POST /plans`:** el `toast.error` específico vive en `useCreatePlan.onError`. Si F0 tiene un interceptor global de 429, se duplica el mensaje; en ese caso, dejar que el interceptor global toquee y quitar el `onError` local. Verificar antes de mergear.
- **Paginación:** `GET /plans` es el único endpoint de lista **sin cursor** del contrato. Está documentado en `hooks.ts` y en `types.ts`. Si el backend añade cursor en el futuro, migrar `usePlans` a `useInfiniteQuery` y ajustar `ExplorePage` (que hoy espera un array).
- **`lib/format` y `lib/geo`:** dependen de F0. Si las firmas (`formatDistance`, `formatRating`, `haversineMeters`, `getCurrentPosition`) difieren, ajustar los imports/llamadas en `PlanCard`, `PlanDetailSheet`, `useUserLocation`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El backend devuelve `GET /plans` vacío en dev (no hay datos seed) | Sembrar 1-2 planes desde tests/integración; `EmptyState` ya guía al usuario a crear el primero. |
| `datetime-local` + zona horaria: el backend espera UTC con `Z` | Se normaliza con `new Date(v).toISOString()` en `CreatePlanPage` y `EditPlanSheet`. Documentado. |
| GPS denegado en iOS Safari | `useUserLocation` captura el rechazo y muestra el fallback UI; no rompe la página. |
| `MapBackground` recenter vía `key` causa flasheo | Aceptable en F3; si molesta, exponer un método `recenter()` en `MapBackground` (refactor menor, fuera de scope aquí). |
| Rate limit `POST /plans` frustra UX en testing | El toast explica el límite; los tests usan mocks que simulan 429 controladamente. |

---

## Resumen de commits (orden de ejecución)

1. `feat(plans): añadir tipos y constantes del dominio Plans`
2. `test(plans): validar PlanIn y PlanUpdateIn con zod`
3. `feat(plans): hook useUserLocation con estados GPS`
4. `feat(plans): hooks usePlans/usePlan/useCreatePlan/useUpdatePlan/useCancelPlan`
5. `feat(plans): migrar GpsIndicator con tipos y a11y`
6. `feat(plans): migrar PlanCard con tipos y distancia haversine`
7. `feat(plans): ActivityPicker con 7 actividades`
8. `feat(plans): PlanFilters por activity y mode`
9. `feat(plans): ExplorePage con mapa real, GPS, lista y FAB`
10. `feat(plans): CreatePlanPage con react-hook-form + zod`
11. `feat(plans): PlanDetailSheet con host, descripción y acciones por rol`
12. `feat(plans): EditPlanSheet con PATCH validado`
13. `feat(plans): PlanDetailPage con detalle, edición y cancelación`
14. `feat(plans): registrar rutas /explore, /plans/new, /plans/:planId`
15. `refactor(app): eliminar MOCK_PLANS y código migrado a features/plans`

