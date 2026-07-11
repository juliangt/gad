# Map Point Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al usuario elegir el punto de referencia del plan tocando el mapa, habilitar un input de `title` concatenado (max 32 chars) y mover `description` a "Opciones Avanzadas" como "Más detalles" opcional.

**Architecture:** Nuevo componente `MapPicker` que envuelve a `MapBackground` con props opcionales (`onMapClick`, `circle`, `pickerMarker`). `MapBackground` renderiza `MapClickHandler` (vía `useMapEvents`) y `RadiusCircle` (vía `<Circle>`) solo cuando esas props están presentes, sin romper `ExplorePage`. El form gana un campo `title_suffix` (max 32) que se concatena con el label de actividad en `onSubmit`.

**Tech Stack:** React 19, Vite, react-hook-form, zod, @tanstack/react-query, leaflet + react-leaflet@5.0.0, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-11-map-point-picker-design.md`

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `frontend/src/features/plans/schemas.ts` | Modificar | Agregar `title_suffix: z.string().max(32).default('')` |
| `frontend/src/features/plans/__tests__/schemas.test.ts` | Modificar | Tests de `title_suffix` y `description` |
| `frontend/src/components/MapBackground.tsx` | Modificar | Agregar props `onMapClick`, `circle`, `pickerMarker` + hijos `MapClickHandler` y `RadiusCircle` |
| `frontend/src/features/plans/components/MapPicker.tsx` | Crear | Wrapper que pasa props a `MapBackground` |
| `frontend/src/features/plans/pages/CreatePlanPage.tsx` | Modificar | Usar props de mapa, input `title_suffix`, Textarea `description`, quitar input `location.label` y backdrop full-screen, concatenación en `onSubmit` |
| `frontend/src/features/plans/__tests__/CreatePlanPage.test.tsx` | Crear | Tests del flujo de creación |
| `frontend/src/features/plans/types.ts` | Modificar (si hace falta) | Asegurar que `PlanIn` siga compatible |

---

## Task 1: Schema — agregar `title_suffix`

**Files:**
- Modify: `frontend/src/features/plans/schemas.ts:20-31`
- Test: `frontend/src/features/plans/__tests__/schemas.test.ts`

- [ ] **Step 1: Escribir test fallido para `title_suffix`**

Agregar a `frontend/src/features/plans/__tests__/schemas.test.ts`:

```ts
import { planInSchema } from '../schemas';

describe('planInSchema — title_suffix', () => {
  const validBase = {
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 1,
    title: 'Café',
    description: null,
    location: { lat: -34.59, lng: -58.43, label: 'Palermo' },
    search_radius_m: 1000,
  };

  it('acepta title_suffix vacío con default ""', () => {
    const parsed = planInSchema.parse({ ...validBase });
    expect(parsed.title_suffix).toBe('');
  });

  it('acepta title_suffix de hasta 32 caracteres', () => {
    const parsed = planInSchema.parse({ ...validBase, title_suffix: 'a'.repeat(32) });
    expect(parsed.title_suffix).toHaveLength(32);
  });

  it('rechaza title_suffix de más de 32 caracteres', () => {
    const result = planInSchema.safeParse({ ...validBase, title_suffix: 'a'.repeat(33) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/schemas.test.ts`
Expected: FAIL — `title_suffix` no existe en el schema / `undefined`.

- [ ] **Step 3: Implementar `title_suffix` en el schema**

En `frontend/src/features/plans/schemas.ts`, dentro de `planInSchema` (el `z.object` de líneas 20-31), agregar después de `title`:

```ts
    title: z.string().min(1).max(200),
    title_suffix: z.string().max(32).default(''),
    description: z.union([z.string().max(1000), z.null()]).default(null),
```

- [ ] **Step 4: Correr test y verificar que pasa**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/plans/schemas.ts frontend/src/features/plans/__tests__/schemas.test.ts
git commit -m "feat(plans): add title_suffix field to planInSchema (max 32 chars)"
```

---

## Task 2: `MapBackground` — props opcionales `onMapClick`, `circle`, `pickerMarker`

**Files:**
- Modify: `frontend/src/components/MapBackground.tsx`

- [ ] **Step 1: Agregar imports de `Circle`, `useMapEvents` y tipos**

En `frontend/src/components/MapBackground.tsx`, modificar el import de react-leaflet (línea 2):

```ts
import { MapContainer, TileLayer, Marker, useMap, Circle, useMapEvents } from 'react-leaflet';
```

- [ ] **Step 2: Agregar componentes hijos `MapClickHandler` y `RadiusCircle`**

Después de `MapCenterUpdater` (antes de la interfaz `PlanLocation`, ~línea 42), agregar:

```ts
// Captura clicks del mapa y los reenvía vía callback
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Dibuja el círculo de radio de búsqueda y el pin del punto elegido
function RadiusCircle({
  center,
  radiusM,
  pickerMarker,
}: {
  center: [number, number];
  radiusM: number;
  pickerMarker?: [number, number] | null;
}) {
  return (
    <>
      <Circle
        center={center}
        radius={radiusM}
        pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.08, weight: 1.5 }}
      />
      {pickerMarker && <Marker position={pickerMarker} icon={planIcon} />}
    </>
  );
}
```

- [ ] **Step 3: Extender `MapBackgroundProps` con las props opcionales**

Modificar la interfaz `MapBackgroundProps` (líneas 52-57):

```ts
export interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
  /** Si está definido, el mapa captura clicks para elegir un punto. */
  onMapClick?: (lat: number, lng: number) => void;
  /** Si está definido, dibuja un círculo de radio de búsqueda. */
  circle?: { center: [number, number]; radiusM: number } | null;
  /** Pin del punto de referencia elegido (se dibuja junto al círculo). */
  pickerMarker?: [number, number] | null;
}
```

- [ ] **Step 4: Desestructurar las props nuevas y renderizar los hijos condicionalmente**

Modificar la firma del componente (línea 59) y el render del `MapContainer` (líneas 65-88):

```ts
export function MapBackground({
  userLocation,
  plans,
  className,
  onPlanClick,
  onMapClick,
  circle,
  pickerMarker,
}: MapBackgroundProps) {
  const center: [number, number] = userLocation || [-34.5900, -58.4300];

  return (
    <div className={cn("absolute inset-0 z-0", className)}>
      <MapContainer
        center={center}
        zoom={15}
        zoomControl={false}
        className="w-full h-full"
      >
        <TileLayer url={TILE_URL} />
        {userLocation && <MapCenterUpdater center={userLocation} />}

        {userLocation && <Marker position={userLocation} icon={userIcon} />}

        {plans.map((plan) => (
          <Marker
            key={plan.id}
            position={[plan.lat, plan.lng]}
            icon={planIcon}
            eventHandlers={{ click: () => onPlanClick?.(plan.id) }}
          />
        ))}

        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {circle && (
          <RadiusCircle center={circle.center} radiusM={circle.radiusM} pickerMarker={pickerMarker} />
        )}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MapBackground.tsx
git commit -m "feat(map): add optional onMapClick, circle, pickerMarker props to MapBackground"
```

---

## Task 3: `MapPicker` — wrapper component

**Files:**
- Create: `frontend/src/features/plans/components/MapPicker.tsx`

- [ ] **Step 1: Crear `MapPicker.tsx`**

```tsx
// frontend/src/features/plans/components/MapPicker.tsx
import { MapBackground, type MapBackgroundProps } from '../../../components/MapBackground';

/**
 * Wrapper sobre MapBackground que expone solo las props relevantes para
 * la selección de punto en el flujo de creación de plan.
 * Reenvía onMapClick, circle y pickerMarker a MapBackground.
 */
export interface MapPickerProps {
  userLocation: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  circle: { center: [number, number]; radiusM: number } | null;
  pickerMarker?: [number, number] | null;
  className?: string;
}

export function MapPicker({
  userLocation,
  onMapClick,
  circle,
  pickerMarker,
  className,
}: MapPickerProps) {
  const props: MapBackgroundProps = {
    userLocation,
    plans: [],
    className,
    onMapClick,
    circle,
    pickerMarker,
  };
  return <MapBackground {...props} />;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/plans/components/MapPicker.tsx
git commit -m "feat(plans): add MapPicker wrapper component"
```

---

## Task 4: `CreatePlanPage` — integrar mapa táctil + quitar backdrop full-screen

**Files:**
- Modify: `frontend/src/features/plans/pages/CreatePlanPage.tsx:156-165, 276-304`

- [ ] **Step 1: Reemplazar el `MapBackground` de fondo por `MapPicker` con props**

Modificar el import (línea 18) — reemplazar `MapBackground` por `MapPicker`:

```ts
import { MapPicker } from '../components/MapPicker';
```

Modificar el bloque del mapa de fondo (líneas 156-165). Reemplazar:

```tsx
      {/* Mapa de fondo */}
      <div className="absolute inset-0 z-0">
        <MapBackground userLocation={gps.location} plans={[]} />
      </div>

      {/* Backdrop translúcido */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 animate-in fade-in duration-200"
        onClick={() => navigate('/explore')}
        aria-hidden="true"
      />
```

por:

```tsx
      {/* Mapa de fondo táctil */}
      <div className="absolute inset-0 z-0">
        <MapPicker
          userLocation={gps.location}
          onMapClick={(lat, lng) => gps.setManualLocation(lat, lng)}
          circle={{
            center: gps.location ?? [-34.5900, -58.4300],
            radiusM: watch('search_radius_m'),
          }}
          pickerMarker={gps.location}
        />
      </div>

      {/* Backdrop solo sobre el área del sheet (pointer-events-none para no bloquear el mapa) */}
      <div
        className="absolute inset-x-0 bottom-0 top-[12vh] bg-black/20 backdrop-blur-[2px] z-10 pointer-events-none"
        aria-hidden="true"
      />
```

Nota: el backdrop ya no es clickeable (no cierra al tocar fuera); el cierre se mantiene vía el botón X y drag-to-close. Si se quiere preservar "tocar fuera cierra", se puede agregar un div clickeable `absolute inset-0 z-[5]` con `onClick` que **no** cubra el área del mapa táctil — pero la default es `pointer-events-none` para priorizar el mapa.

- [ ] **Step 2: Reemplazar la sección "Ubicación" (quitar input `location.label` y línea de coords/GPS, agregar hint + input `title_suffix`)**

La sección "Ubicación" actual (líneas 276-304) y el campo `title` se reescriben. Reemplazar todo el bloque de "Ubicación":

```tsx
          {/* Ubicación: punto de referencia via mapa */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Ubicación
            </label>
            <p className="text-xs text-gray-400">Tocá el mapa para ubicar tu plan</p>
          </section>

          {/* Referencia (campo title antes oculto) */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Referencia
            </label>
            <Input
              placeholder="Palermo, plaza del barrio"
              maxLength={32}
              {...register('title_suffix')}
            />
            {errors.title_suffix && (
              <p className="text-xs text-red-500 mt-1">{errors.title_suffix.message as string}</p>
            )}
          </section>
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores (puede haber warnings de `title` no registrado — se resuelve en Task 5).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/plans/pages/CreatePlanPage.tsx
git commit -m "feat(plans): integrate MapPicker, remove location.label input, add title_suffix input"
```

---

## Task 5: `CreatePlanPage` — concatenación de `title` + `description` en "Opciones Avanzadas"

**Files:**
- Modify: `frontend/src/features/plans/pages/CreatePlanPage.tsx:70-74, 129-151, 316-384`

- [ ] **Step 1: Eliminar el `useEffect` que sobreescribe `title`**

Eliminar el bloque de líneas 70-74:

```ts
  // Actualizar el título del formulario automáticamente según la actividad seleccionada
  useEffect(() => {
    const label = ACTIVITY_META[activityType as ActivityType]?.label || 'Nuevo Plan';
    setValue('title', label, { shouldValidate: true });
  }, [activityType, setValue]);
```

- [ ] **Step 2: Agregar import de `Textarea`**

Modificar el import de UI (línea 9) — agregar:

```ts
import { Textarea } from '../../../components/ui/Textarea';
```

- [ ] **Step 3: Modificar `onSubmit` — concatenar `title` y respetar `description`**

Reemplazar la función `onSubmit` (líneas 129-151):

```ts
  const onSubmit = (values: PlanInForm) => {
    const activityLabel = ACTIVITY_META[values.activity_type as ActivityType]?.label || 'Nuevo Plan';
    const suffix = values.title_suffix?.trim() ?? '';
    const finalTitle = suffix ? `${activityLabel} · ${suffix}` : activityLabel;

    const payload: PlanIn = {
      activity_type: values.activity_type as ActivityType,
      mode: values.mode as PlanMode,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      window_minutes: values.window_minutes,
      max_participants: values.max_participants,
      title: finalTitle,
      description: values.description?.trim() ? values.description : null,
      location: {
        label: suffix || '—',
        lat: gps.location?.[0] ?? values.location.lat,
        lng: gps.location?.[1] ?? values.location.lng,
      },
      search_radius_m: values.search_radius_m,
    };
    createPlan.mutate(payload, {
      onSuccess: (plan) => navigate(`/plans/${plan.id}`, { replace: true }),
    });
  };
```

- [ ] **Step 4: Agregar el Textarea de `description` dentro de "Opciones Avanzadas"**

Dentro del bloque `{showAdvanced && (...)}` (líneas 316-384), agregar como **primer** `<section>` del contenedor (antes de "Participantes"):

```tsx
              {/* Más detalles (campo description antes forzado a null) */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Más detalles
                </label>
                <Textarea
                  placeholder="Opcional"
                  maxLength={1000}
                  rows={3}
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-xs text-red-500 mt-1">{errors.description.message as string}</p>
                )}
              </section>
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/plans/pages/CreatePlanPage.tsx
git commit -m "feat(plans): concatenate title_suffix, add description textarea in advanced options"
```

---

## Task 6: Tests de `CreatePlanPage`

**Files:**
- Create: `frontend/src/features/plans/__tests__/CreatePlanPage.test.tsx`

- [ ] **Step 1: Verificar la infra de test de mapa existente**

Run: `cd frontend && grep -rl "react-leaflet\|MapContainer" src/**/__tests__/*.test.tsx 2>/dev/null || echo "no existing map tests"`
Si no hay tests de mapa, se mockea `MapBackground`/`MapPicker` para no depender de Leaflet en tests unitarios.

- [ ] **Step 2: Escribir los tests**

Crear `frontend/src/features/plans/__tests__/CreatePlanPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreatePlanPage from '../pages/CreatePlanPage';

// Mock de MapPicker para evitar montar Leaflet real
vi.mock('../components/MapPicker', () => ({
  MapPicker: ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => (
    <div data-testid="map-picker" onClick={() => onMapClick(-34.6, -58.4)} />
  ),
}));

// Mock de useUserLocation
vi.mock('../useUserLocation', () => ({
  useUserLocation: () => ({
    location: [-34.59, -58.43] as [number, number],
    status: 'granted',
    request: vi.fn(),
    setManualLocation: vi.fn(),
    reset: vi.fn(),
    error: null,
  }),
}));

// Mock de useCreatePlan
vi.mock('../hooks', () => ({
  useCreatePlan: () => ({
    mutate: vi.fn((payload, opts) => opts?.onSuccess?.({ id: 'plan-1' })),
    isPending: false,
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreatePlanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreatePlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza el input de Referencia con placeholder correcto', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Palermo, plaza del barrio')).toBeInTheDocument();
  });

  it('no renderiza el input de location.label (Barrio o referencia)', () => {
    renderPage();
    expect(screen.queryByPlaceholderText(/Barrio o referencia/)).not.toBeInTheDocument();
  });

  it('al abrir Opciones Avanzadas muestra el Textarea "Más detalles" con placeholder "Opcional"', () => {
    renderPage();
    fireEvent.click(screen.getByText(/OPCIONES AVANZADAS/i));
    expect(screen.getByText('Más detalles')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Opcional')).toBeInTheDocument();
  });

  it('el hint "Tocá el mapa" se muestra inicialmente', () => {
    renderPage();
    expect(screen.getByText(/Tocá el mapa para ubicar tu plan/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Correr tests y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/plans/__tests__/CreatePlanPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/plans/__tests__/CreatePlanPage.test.tsx
git commit -m "test(plans): add CreatePlanPage tests for map hint, title_suffix, description"
```

---

## Task 7: Verificación final — typecheck + lint + tests completos

**Files:** ninguno (verificación)

- [ ] **Step 1: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Lint**

Run: `cd frontend && npx eslint src/features/plans/ src/components/MapBackground.tsx --max-warnings=0`
Expected: sin errores. Si hay warnings de `activityType` sin uso tras quitar el `useEffect`, eliminar la variable `activityType` si ya no se usa (verificar con `watch`).

- [ ] **Step 3: Tests del feature plans**

Run: `cd frontend && npx vitest run src/features/plans/`
Expected: todos PASS.

- [ ] **Step 4: Build**

Run: `cd frontend && npx vite build`
Expected: build exitoso.

- [ ] **Step 5: Commit final (si hubo fixes de lint)**

```bash
git add -A
git commit -m "chore(plans): lint fixes for map point picker"
```

(Solo si hubo cambios; si todo limpio, omitir.)
