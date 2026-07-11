# Design: Map point picker + title/description refactor (issue #24)

- **Issue:** [#24 — elegir punto central del plan tocando el mapa + radio de búsqueda con botones predefinidos](https://github.com/juliangt/gad/issues/24)
- **Fecha:** 2026-07-11
- **Branch:** `feature/issue-24-map-point-picker`
- **Estado:** Aprobado (pendiente de implementación)

## Resumen

Al crear un plan, el usuario podrá tocar el mapa para elegir el punto de referencia (lat/lng) en lugar de depender únicamente del GPS. El campo `title` (hoy oculto y autoderivado) pasa a ser un input visible donde el usuario escribe una referencia de hasta 32 caracteres, que se concatena con el label de la actividad elegida. El campo `description` (hoy forzado a `null`) pasa a vivir dentro de "Opciones avanzadas" como un Textarea con label "Más detalles" y placeholder "Opcional". Se elimina el input visible de `location.label`. El radio de búsqueda (ya implementado con `RadiusPicker`) se enlaza a un círculo visual en el mapa.

## Contexto actual

| Pedido | Estado en el código |
|---|---|
| Click en mapa → coords | ❌ No existe. `MapBackground` es de solo lectura. |
| Círculo de radio visual | ❌ No existe. |
| Radio con botones predefinidos | ✅ Ya existe `RadiusPicker` (1km/2km/5km, 3 botones), ya dentro de "Opciones Avanzadas". |
| "Opciones Avanzadas" colapsable | ✅ Ya existe (`showAdvanced`, `CreatePlanPage.tsx:76,306-384`). Contiene: Participantes, Radio, Vigencia. |
| Campo `title` oculto | ✅ Oculto y autoderivado (`useEffect` `CreatePlanPage.tsx:70-74`, `onSubmit:131,139`). |
| Campo `description` | ❌ Forzado a `null` en `onSubmit` (`CreatePlanPage.tsx:140`). No hay Textarea. |
| Input `location.label` visible | ✅ Existe ("Barrio o referencia", `CreatePlanPage.tsx:281-285`). Se eliminará. |
| `useUserLocation.setManualLocation` | ✅ Ya existe y sin usar — punto natural para enchufar el click. |

**Stack:** React 19 + Vite + react-hook-form + zod + @tanstack/react-query; mapas con `leaflet` + `react-leaflet@5.0.0` (que exporta `Circle` y `useMapEvents`).

## Decisiones de diseño (validadas con el usuario)

1. **Click en mapa + GPS:** el GPS funciona como punto inicial automático (si hay permiso). El click en el mapa permite ajustar el punto. No hay botón explícito de GPS. Fallback al centro de CABA (`-34.5900, -58.4300`) si no hay GPS.
2. **Radio:** se incluye el círculo visual + los botones predefinidos existentes (`RadiusPicker`). No se modifica `RadiusPicker`.
3. **Campo `title`:** pasa a ser un input visible. El valor final se arma como **concatenación** del label autoderivado de la actividad + lo que ingrese el usuario. El input del usuario se limita a **32 caracteres**.
4. **`location.label`:** se elimina el input visible. En `onSubmit`, `location.label` se completa con el texto que el usuario escribió en el input de `title` (sin el prefijo de actividad), o un fallback si está vacío (para cumplir `min(1)` del schema).
5. **`description`:** va dentro de "Opciones Avanzadas" (colapsable existente). Label visual "Más detalles", placeholder "Opcional". El bloque inicia colapsado y **conserva el texto** al cerrar/reabrir (es estado de react-hook-form, no se pierde).
6. **Enfoque de implementación:** Enfoque A — nuevo componente `MapPicker` que envuelve a `MapBackground` con props opcionales nuevas. `MapBackground` queda como fondo puro; `ExplorePage` no se rompe.

## Arquitectura y componentes

### `MapPicker` (nuevo) — `frontend/src/features/plans/components/MapPicker.tsx`

Componente que envuelve a `MapBackground` y le pasa props opcionales para habilitar la selección de punto. Internamente, cuando esas props están presentes, `MapBackground` renderiza dos hijos adicionales dentro del `MapContainer`:

- **`MapClickHandler`**: usa `useMapEvents({ click: (e) => onMapClick?.(e.latlng.lat, e.latlng.lng) })` de react-leaflet. No renderiza nada visible.
- **`RadiusCircle`**: renderiza un `<Circle>` de react-leaflet con `center={circle.center}` y `radius={circle.radiusM}` (en metros), más un `<Marker>` con un icono de "punto de referencia" en `pickerMarker`.

### `MapBackground` (modificación) — `frontend/src/components/MapBackground.tsx`

Gana tres props opcionales en `MapBackgroundProps`:

```ts
onMapClick?: (lat: number, lng: number) => void;
circle?: { center: [number, number]; radiusM: number } | null;
pickerMarker?: [number, number] | null;
```

Cuando `onMapClick` está definido, renderiza `<MapClickHandler onMapClick={onMapClick} />`. Cuando `circle` está definido, renderiza `<RadiusCircle center={circle.center} radiusM={circle.radiusM} />`. Cuando `pickerMarker` está definido, renderiza un `<Marker>` con un icono de pin. Sin estas props (caso `ExplorePage`), el componente queda exactamente como hoy.

### `CreatePlanPage` (modificación) — `frontend/src/features/plans/pages/CreatePlanPage.tsx`

- El `MapBackground` de fondo (líneas 156-158) pasa a usarse con las props nuevas: `onMapClick={(lat,lng) => gps.setManualLocation(lat,lng)}`, `circle={{ center: puntoActual, radiusM: watch('search_radius_m') }}`, `pickerMarker={gps.location}`.
- Se **quita el backdrop translúcido full-screen** (`bg-black/40 backdrop-blur-sm`, líneas 161-165) o se limita su `pointer-events` al área del sheet, para que el área de mapa por encima del sheet reciba taps reales de Leaflet.
- Se agrega un **hint sutil** sobre el sheet: "Tocá el mapa para ubicar tu plan".
- Sección "Ubicación": se elimina el `<Input>` de `location.label` (líneas 281-285) y la línea de coordenadas en texto + botón "Activar GPS / Actualizar" (líneas 289-303). Se reemplaza por el input de `title` (ver abajo).
- Se agrega el `<Input>` visible para `title` (ver sección "Campo title").
- Se elimina el `useEffect` que sobreescribe `title` (líneas 70-74) y el `finalTitle` hardcodeado en `onSubmit` (líneas 131, 139).
- Se agrega el `<Textarea>` para `description` dentro de "Opciones Avanzadas" (ver sección "Campo description").

### Stacking sheet ↔ mapa táctil

El bottom-sheet se mantiene abajo. El área de mapa visible por encima del sheet es táctil: el usuario toca ahí para ubicar el punto. El backdrop translúcido full-screen se quita o se limita al área del sheet (mediante `pointer-events`). El bottom-sheet conserva su comportamiento actual (drag-to-close, scroll interno).

## Campo `title` (antes oculto) → input de referencia, concatenado

### Schema del form — `frontend/src/features/plans/schemas.ts`

Se agrega un campo al `planInSchema`:

```ts
title_suffix: z.string().max(32).default(''),
```

Este campo **no viaja al backend** tal cual; se concatena en `onSubmit`. `title` sigue siendo el campo final (1..200, siempre válido porque incluye el prefijo autoderivado).

`title` se mantiene en el schema para compatibilidad, pero en el form se registra el input contra `title_suffix` (no contra `title`). El valor final de `title` se calcula en `onSubmit`.

### UI

`<Input>` visible, registrado contra `title_suffix`, con:
- Label: "Referencia"
- Placeholder: "Palermo, plaza del barrio" (ejemplo orientativo)
- `maxLength` HTML = 32
- No marcado como requerido (el `title` final siempre tiene al menos el label autoderivado)

### `onSubmit` — concatenación

```ts
const activityLabel = ACTIVITY_META[values.activity_type as ActivityType]?.label || 'Nuevo Plan';
const suffix = values.title_suffix?.trim() ?? '';
const finalTitle = suffix ? `${activityLabel} · ${suffix}` : activityLabel;
```

`location.label` en `onSubmit` se setea con `suffix` (el texto del usuario sin prefijo) o, si está vacío, un fallback `'—'` para cumplir `min(1)` del schema. Así backend sigue recibiendo `location.label` no vacío.

`title` en el payload = `finalTitle`.

## Campo `description` → "Opciones Avanzadas"

Dentro del bloque colapsable `showAdvanced` existente (`CreatePlanPage.tsx:316-384`), se agrega un `<Textarea>` (componente existente en `components/ui/Textarea.tsx`, acepta `invalid` y `forwardRef`) registrado contra `description`, con:

- Label visible: **"Más detalles"**
- Placeholder: **"Opcional"**
- `maxLength` HTML = 1000 (alinea con `schemas.ts:28`; ver "Discrepancia de longitud" abajo)

En `onSubmit`, `description` pasa de `null` fijo a `values.description?.trim() ? values.description : null`.

"Opciones Avanzadas" sigue iniciando colapsado y conserva el texto al cerrar/reabrir (estado de react-hook-form, no se pierde).

## Radio — ya hecho, solo se enlaza al círculo

`RadiusPicker` ya existe (1km/2km/5km, 3 botones, dentro de "Opciones Avanzadas"). El círculo del `MapPicker` se alimenta de `watch('search_radius_m')` para actualizarse en vivo al cambiar el botón. No se modifica `RadiusPicker`. Los valores (1000/2000/5000) respetan `100..50000` del schema.

## Casos límite / error handling

- **GPS denegado o sin permiso:** el mapa arranca en el centro de CABA (fallback existente). El usuario puede tocar el mapa para elegir igual. El círculo se dibuja desde el primer click o con el punto de fallback.
- **Sin click previo:** si el usuario no toca el mapa pero GPS funcionó, se usan las coords del GPS (comportamiento actual). Si tampoco hay GPS, se usa CABA. El círculo se dibuja con ese punto.
- **Validación:** `location.lat/lng` siempre tienen un valor (GPS o CABA), así que no hay caso "sin ubicación". `title` siempre ≥ 1 char por el prefijo autoderivado. `title_suffix` ≤ 32 por schema. `description` ≤ 1000 o `null`.

## Discrepancia de longitud (nota, fuera de alcance)

`description` tiene `max(1000)` en el schema FE (`schemas.ts:28`) pero `max(2000)` en el schema BE (`backend/src/gad/plans/schemas.py:23`). No se resuelve en este issue para no mezclar alcance; se deja documentada. El `maxLength` HTML y el `max(1000)` del form FE se mantienen.

## Testing

No existen tests para `CreatePlanPage` hoy. Se crean:

- **`schemas.test.ts`** (extender el existente): `title_suffix` respeta `max(32)`; `title_suffix` default `''`; `description` acepta `null` y string ≤ 1000; rechaza > 1000.
- **`CreatePlanPage.test.tsx`** (nuevo): flujo de click en mapa → `gps.setManualLocation` llamado con lat/lng correctos → submit envía `title` concatenado (`"Café · Palermo"` cuando hay suffix, `"Café"` cuando no) + `description` (string o null) + `location.label` (suffix o fallback). Caso GPS denegado → fallback CABA.
- **`MapPicker.test.tsx`** (nuevo, si la infra de test de Leaflet lo permite): `onMapClick` se invoca con lat/lng al simular click; `Circle` y `Marker` se renderizan cuando `circle`/`pickerMarker` están presentes.

## Alcance (YAGNI)

**Dentro:**
- Click en mapa → coords (vía `MapPicker` + `MapBackground` props nuevas).
- Círculo de radio visual enlazado a `search_radius_m`.
- Input `title` visible, concatenado con label de actividad, max 32 chars.
- `description` dentro de "Opciones Avanzadas" como "Más detalles" / "Opcional".
- Eliminar input `location.label` visible.
- Quitar/limitar backdrop full-screen para que el mapa sea táctil.
- Tests de schema, `CreatePlanPage` y `MapPicker`.

**Fuera:**
- Geocoding (barrio → coords) o reverse geocoding.
- Búsqueda por texto.
- Cambios en `ExplorePage` o `EditPlanSheet`.
- Cambios en backend o schema BE.
- Modificar `RadiusPicker`.
- Resolver la discrepancia de longitud de `description` (FE 1000 vs BE 2000).
