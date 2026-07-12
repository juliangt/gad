# SP4 — Venues admin UI (Plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traer la carga y gestión completa de venues sponsoreados al panel admin consolidado: listado con filtros, alta/edición de venues, flujo de aprobación (approve/pause/revoke), y CRUD de ofertas. **Todos los endpoints ya existen** en el backend (`/admin/venues/*`); este sub-proyecto es puramente UI.

**Architecture:** Una página `VenuesAdminPage` con listado + modal de creación/edición + off-canvas (o sección expandible) para gestionar ofertas de cada venue. Reutiliza los hooks existentes (`useAdminVenues`, `useCreateVenue`, `useApproveVenue`, etc.) y añade los faltantes (`useUpdateVenue`, `useUpdateVenueOffer`, `useDeleteVenueOffer`). Sigue los patrones de `UsersAdminPage` y `ReportsAdminPage`.

**Tech Stack:** React 19 + React Query + Tailwind v4 + sonner + lucide-react.

**Spec de referencia:** `docs/superpowers/specs/2026-07-12-admin-panel-expansion-design.md` (Sub-proyecto 4).

**Dependencia:** Ninguna bloqueante (los endpoints `/admin/venues/*` ya existen). SP0 recomendado (para `require_feature('venues_sponsors')`).

---

## Estado actual de venues en el frontend

Hooks ya existentes en `features/admin/hooks.ts`:
- `useAdminVenues(status?)` → `GET /admin/venues` (useQuery, no infinite).
- `useCreateVenue()` → `POST /admin/venues`.
- `useApproveVenue()`, `usePauseVenue()`, `useRevokeVenue()` → acciones.
- `useCreateVenueOffer()` → `POST /admin/venues/{id}/offers`.

Tipos ya existentes en `features/admin/types.ts`:
- `VenueAdminOut`, `VenueOfferAdminOut`, `VenueCreateInput`, `VenueOfferCreateInput`.

Hooks **faltantes** (este plan los crea):
- `useUpdateVenue()` → `PATCH /admin/venues/{id}`.
- `useUpdateVenueOffer()` → `PATCH /admin/venues/{id}/offers/{offerId}`.
- `useDeleteVenueOffer()` → `DELETE /admin/venues/{id}/offers/{offerId}`.

Endpoint `GET /admin/venues/{id}` existe pero no se usa todavía — el listado ya trae el venue completo con offers (no hace falta fetch individual).

---

## File Structure

**Crear (frontend):**
- `frontend/src/features/admin/pages/VenuesAdminPage.tsx`
- `frontend/src/features/admin/components/VenueRow.tsx`
- `frontend/src/features/admin/components/VenueFormModal.tsx`
- `frontend/src/features/admin/components/VenueOffersPanel.tsx`

**Modificar (frontend):**
- `frontend/src/features/admin/hooks.ts` — hooks faltantes.
- `frontend/src/features/admin/components/AdminNav.tsx` — añadir "Venues".
- `frontend/src/router.tsx` — ruta `/admin/venues`.

---

## Task 1: Hooks faltantes de venues

**Files:**
- Modify: `frontend/src/features/admin/hooks.ts`
- Test: `frontend/src/features/admin/__tests__/hooks.test.tsx`

- [ ] **Step 1: Add hooks**

Edit `frontend/src/features/admin/hooks.ts` — add after `useCreateVenueOffer`:

```ts
export function useUpdateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, input }: { venueId: string; input: Partial<VenueCreateInput> }) =>
      apiPatch<VenueAdminOut>(`/admin/venues/${venueId}`, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    ...userActionToast('Venue actualizado.', 'No se pudo actualizar el venue.'),
  });
}

export function useUpdateVenueOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      venueId,
      offerId,
      input,
    }: {
      venueId: string;
      offerId: string;
      input: Partial<VenueOfferCreateInput> & { active?: boolean };
    }) => apiPatch<VenueOfferAdminOut>(`/admin/venues/${venueId}/offers/${offerId}`, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    ...userActionToast('Oferta actualizada.', 'No se pudo actualizar la oferta.'),
  });
}

export function useDeleteVenueOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, offerId }: { venueId: string; offerId: string }) =>
      apiDelete<OKMessage>(`/admin/venues/${venueId}/offers/${offerId}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    ...userActionToast('Oferta eliminada.', 'No se pudo eliminar la oferta.'),
  });
}
```

Add the type imports at the top of hooks.ts (`VenueOfferAdminOut`, `OKMessage` from `../../../types/common`).

- [ ] **Step 2: Add tests for the new hooks**

Edit `frontend/src/features/admin/__tests__/hooks.test.tsx` — add:

```tsx
it('useUpdateVenue pega al endpoint correcto', async () => {
  (client.apiPatch as any).mockResolvedValue({ id: 'v1', name: 'Actualizado' });
  const { result } = renderHook(() => useUpdateVenue(), { wrapper: createWrapper() });
  await result.current.mutateAsync({ venueId: 'v1', input: { name: 'Actualizado' } });
  expect(client.apiPatch).toHaveBeenCalledWith('/admin/venues/v1', { name: 'Actualizado' });
});

it('useDeleteVenueOffer usa DELETE', async () => {
  (client.apiDelete as any).mockResolvedValue({ message: 'ok' });
  const { result } = renderHook(() => useDeleteVenueOffer(), { wrapper: createWrapper() });
  await result.current.mutateAsync({ venueId: 'v1', offerId: 'o1' });
  expect(client.apiDelete).toHaveBeenCalledWith('/admin/venues/v1/offers/o1');
});
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run src/features/admin/__tests__/hooks.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/hooks.ts frontend/src/features/admin/__tests__/hooks.test.tsx
git commit -m "feat(admin-fe): hooks de venues faltantes (update, offers CRUD) (SP4-task1)"
```

---

## Task 2: VenueRow component

**Files:**
- Create: `frontend/src/features/admin/components/VenueRow.tsx`

- [ ] **Step 1: Create VenueRow**

`frontend/src/features/admin/components/VenueRow.tsx` — follows the `<li class="glass-panel">` pattern. Renders venue name, category badge, status badge, address, owner info, offer count, and action buttons conditional on status:

- `pending` → Approve.
- `active` → Pause.
- `paused` → Approve (re-activate).
- `active`/`paused` → Revoke (danger).
- Any status → Editar (abre `VenueFormModal`) and Gestionar ofertas (abre `VenueOffersPanel`).

```tsx
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { VenueAdminOut } from '../types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  active: 'success',
  paused: 'neutral',
  revoked: 'danger',
};

export interface VenueRowProps {
  venue: VenueAdminOut;
  onApprove: (id: string) => void;
  onPause: (id: string) => void;
  onRevoke: (id: string) => void;
  onEdit: (venue: VenueAdminOut) => void;
  onManageOffers: (venue: VenueAdminOut) => void;
  busy?: boolean;
}

export function VenueRow({ venue, onApprove, onPause, onRevoke, onEdit, onManageOffers, busy }: VenueRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 truncate">{venue.name}</h3>
            <Badge variant={STATUS_VARIANT[venue.status] ?? 'neutral'}>{venue.status}</Badge>
          </div>
          <p className="text-sm text-gray-600">{venue.address}</p>
          <p className="mt-1 text-xs text-gray-500">
            {venue.category} · {venue.offers.length} oferta(s) · {venue.owner_name} ({venue.owner_email})
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {venue.status === 'pending' && (
            <Button size="sm" onClick={() => onApprove(venue.id)} disabled={busy}>Aprobar</Button>
          )}
          {venue.status === 'active' && (
            <Button size="sm" variant="secondary" onClick={() => onPause(venue.id)} disabled={busy}>Pausar</Button>
          )}
          {venue.status === 'paused' && (
            <Button size="sm" onClick={() => onApprove(venue.id)} disabled={busy}>Activar</Button>
          )}
          {(venue.status === 'active' || venue.status === 'paused') && (
            <Button size="sm" variant="danger" onClick={() => onRevoke(venue.id)} disabled={busy}>Revocar</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEdit(venue)} disabled={busy}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => onManageOffers(venue)} disabled={busy}>Ofertas</Button>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/components/VenueRow.tsx
git commit -m "feat(admin-fe): VenueRow con acciones por estado (SP4-task2)"
```

---

## Task 3: VenueFormModal (create + edit)

**Files:**
- Create: `frontend/src/features/admin/components/VenueFormModal.tsx`

- [ ] **Step 1: Create VenueFormModal**

`frontend/src/features/admin/components/VenueFormModal.tsx` — modal with form fields from `VenueCreateInput`: `name`, `category` (select of `ActivityType`), `address`, `lat` (number), `lng` (number), `owner_name`, `owner_email`, `owner_phone` (optional). Handles both create (POST) and edit (PATCH). Pre-fills fields when editing (receives `venue?: VenueAdminOut`).

```tsx
import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useCreateVenue, useUpdateVenue } from '../hooks';
import type { VenueAdminOut, VenueCreateInput } from '../types';

const CATEGORIES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'];

interface VenueFormModalProps {
  open: boolean;
  onClose: () => void;
  venue?: VenueAdminOut | null; // si viene, es edición
}

export function VenueFormModal({ open, onClose, venue }: VenueFormModalProps) {
  const create = useCreateVenue();
  const update = useUpdateVenue();
  const isEdit = Boolean(venue);

  const [form, setForm] = useState<VenueCreateInput>({
    name: venue?.name ?? '',
    category: venue?.category ?? 'coffee',
    address: venue?.address ?? '',
    lat: venue?.lat ?? 0,
    lng: venue?.lng ?? 0,
    owner_name: venue?.owner_name ?? '',
    owner_email: venue?.owner_email ?? '',
    owner_phone: venue?.owner_phone ?? null,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && venue) {
      update.mutate({ venueId: venue.id, input: form }, { onSuccess: onClose });
    } else {
      create.mutate(form, { onSuccess: onClose });
    }
  }

  const loading = create.isPending || update.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar venue' : 'Nuevo venue'}>
      <form onSubmit={submit} className="space-y-3">
        <label className="text-sm">
          Nombre
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm">
          Categoría
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Dirección
          <Input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Latitud
            <Input type="number" step="any" required value={form.lat}
              onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} />
          </label>
          <label className="text-sm">
            Longitud
            <Input type="number" step="any" required value={form.lng}
              onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} />
          </label>
        </div>
        <label className="text-sm">
          Nombre del responsable
          <Input required value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
        </label>
        <label className="text-sm">
          Email del responsable
          <Input type="email" required value={form.owner_email}
            onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
        </label>
        <label className="text-sm">
          Teléfono (opcional)
          <Input value={form.owner_phone ?? ''}
            onChange={(e) => setForm({ ...form, owner_phone: e.target.value || null })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/components/VenueFormModal.tsx
git commit -m "feat(admin-fe): modal de creación/edición de venue (SP4-task3)"
```

---

## Task 4: VenueOffersPanel (CRUD de ofertas)

**Files:**
- Create: `frontend/src/features/admin/components/VenueOffersPanel.tsx`

- [ ] **Step 1: Create VenueOffersPanel**

`frontend/src/features/admin/components/VenueOffersPanel.tsx` — shows the offers of a venue in a list, with inline add/edit/delete. Uses `useCreateVenueOffer`, `useUpdateVenueOffer`, `useDeleteVenueOffer`. Rendered as a modal or an off-canvas panel.

Fields per offer: `title`, `description`, `redemption_method` (select: `code`/`qr`/`mention`), `valid_from` (datetime-local), `valid_until` (datetime-local), `active` (checkbox).

```tsx
import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Badge } from '../../../components/ui/Badge';
import {
  useCreateVenueOffer,
  useUpdateVenueOffer,
  useDeleteVenueOffer,
} from '../hooks';
import type { VenueAdminOut, VenueOfferCreateInput, VenueOfferAdminOut } from '../types';

const REDEMPTION_METHODS = ['code', 'qr', 'mention'];

interface VenueOffersPanelProps {
  open: boolean;
  onClose: () => void;
  venue: VenueAdminOut | null;
}

export function VenueOffersPanel({ open, onClose, venue }: VenueOffersPanelProps) {
  const createOffer = useCreateVenueOffer();
  const updateOffer = useUpdateVenueOffer();
  const deleteOffer = useDeleteVenueOffer();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VenueOfferCreateInput & { active?: boolean }>({
    title: '', description: '', redemption_method: 'code',
    valid_from: '', valid_until: '',
  });

  function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!venue) return;
    createOffer.mutate(
      { venueId: venue.id, input: form },
      { onSuccess: () => { setShowForm(false); setForm({ title: '', description: '', redemption_method: 'code', valid_from: '', valid_until: '' }); } },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ofertas — ${venue?.name ?? ''}`}>
      <div className="space-y-3">
        {venue?.offers.length === 0 && (
          <p className="text-sm text-gray-600">Sin ofertas. Creá la primera.</p>
        )}
        <ul className="space-y-2">
          {venue?.offers.map((offer) => (
            <li key={offer.id} className="rounded-xl bg-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{offer.title}</p>
                  <p className="text-xs text-gray-500">
                    {offer.redemption_method} · hasta {new Date(offer.valid_until).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={offer.active ? 'success' : 'neutral'}>
                    {offer.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <label className="text-xs">
                    <input
                      type="checkbox"
                      checked={offer.active}
                      onChange={() =>
                        updateOffer.mutate({
                          venueId: venue.id, offerId: offer.id,
                          input: { active: !offer.active },
                        })
                      }
                    /> activar
                  </label>
                  <Button size="sm" variant="danger"
                    onClick={() => deleteOffer.mutate({ venueId: venue.id, offerId: offer.id })}>
                    Eliminar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {!showForm ? (
          <Button variant="secondary" onClick={() => setShowForm(true)}>Nueva oferta</Button>
        ) : (
          <form onSubmit={submitOffer} className="space-y-2 rounded-xl bg-gray-50 p-3">
            <Input required placeholder="Título" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Descripción" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
              value={form.redemption_method}
              onChange={(e) => setForm({ ...form, redemption_method: e.target.value })}>
              {REDEMPTION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="datetime-local" required value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              <Input type="datetime-local" required value={form.valid_until}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={createOffer.isPending}>Crear oferta</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/components/VenueOffersPanel.tsx
git commit -m "feat(admin-fe): panel de gestión de ofertas de venue (SP4-task4)"
```

---

## Task 5: VenuesAdminPage (página consolidadora)

**Files:**
- Create: `frontend/src/features/admin/pages/VenuesAdminPage.tsx`
- Modify: `frontend/src/features/admin/components/AdminNav.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Create VenuesAdminPage**

`frontend/src/features/admin/pages/VenuesAdminPage.tsx` — follows `UsersAdminPage` pattern. Header sticky + `AdminNav`, FILTERS for status (`pending`/`active`/`paused`/`revoked`), "Nuevo venue" button (opens `VenueFormModal`), `<ul>` of `<VenueRow>`. Manages state for the form modal (create/edit) and the offers panel.

```tsx
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { VenueRow } from '../components/VenueRow';
import { VenueFormModal } from '../components/VenueFormModal';
import { VenueOffersPanel } from '../components/VenueOffersPanel';
import {
  useAdminVenues,
  useApproveVenue,
  usePauseVenue,
  useRevokeVenue,
} from '../hooks';
import type { VenueAdminOut } from '../types';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'Activos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'revoked', label: 'Revocados' },
];

export default function VenuesAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const query = useAdminVenues(status);
  const approve = useApproveVenue();
  const pause = usePauseVenue();
  const revoke = useRevokeVenue();
  const busy = approve.isPending || pause.isPending || revoke.isPending;

  const [formOpen, setFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueAdminOut | null>(null);
  const [offersVenue, setOffersVenue] = useState<VenueAdminOut | null>(null);

  const venues = query.data ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Venues sponsoreados</h1>
          <AdminNav />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div role="tablist" className="flex gap-1 p-1 bg-gray-100 rounded-lg overflow-x-auto">
            {FILTERS.map((f) => (
              <button key={f.label} role="tab" aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  status === f.value ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <Button onClick={() => { setEditingVenue(null); setFormOpen(true); }}>Nuevo venue</Button>
        </div>

        {query.isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : venues.length === 0 ? (
          <EmptyState icon={MapPin} title="Sin venues" description="No hay venues en este estado." />
        ) : (
          <ul className="space-y-2">
            {venues.map((v) => (
              <VenueRow
                key={v.id}
                venue={v}
                onApprove={(id) => approve.mutate(id)}
                onPause={(id) => pause.mutate(id)}
                onRevoke={(id) => revoke.mutate(id)}
                onEdit={(venue) => { setEditingVenue(venue); setFormOpen(true); }}
                onManageOffers={(venue) => setOffersVenue(venue)}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </main>

      <VenueFormModal open={formOpen} onClose={() => setFormOpen(false)} venue={editingVenue} />
      <VenueOffersPanel open={offersVenue !== null} onClose={() => setOffersVenue(null)} venue={offersVenue} />
    </div>
  );
}
```

- [ ] **Step 2: Add nav entry**

Edit `frontend/src/features/admin/components/AdminNav.tsx` — add to ITEMS:

```ts
{ to: '/admin/venues', label: 'Venues', icon: MapPin, end: false },
```

Import `MapPin` from `lucide-react`.

- [ ] **Step 3: Add route**

Edit `frontend/src/router.tsx` — add lazy import:

```tsx
const VenuesAdminPage = lazy(() => import('./features/admin/pages/VenuesAdminPage'));
```

Add inside `RequireAdminRoute` children:

```tsx
{ path: '/admin/venues', element: <PageSuspense><VenuesAdminPage /></PageSuspense> },
```

- [ ] **Step 4: Run type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/admin/`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/pages/VenuesAdminPage.tsx frontend/src/features/admin/components/AdminNav.tsx frontend/src/router.tsx
git commit -m "feat(admin-fe): página consolidada de venues admin (SP4-task5)"
```

---

## Self-Review (post-plan)

**Spec coverage (Sub-proyecto 4):**
- ✅ Listado con filtros por estado → Task 5.
- ✅ Carga de venues sponsoreados (create) → Task 3 (VenueFormModal) + Task 5.
- ✅ Edición de venues → Task 3 (VenueFormModal modo edit).
- ✅ Flujo approve/pause/revoke → Task 2 (VenueRow) + Task 5.
- ✅ CRUD de ofertas → Task 4 (VenueOffersPanel).

**Placeholder scan:** Sin TODOs. Todos los componentes tienen código completo.

**Type consistency:** `VenueAdminOut`, `VenueOfferAdminOut`, `VenueCreateInput`, `VenueOfferCreateInput` ya existen en `types.ts`. Hooks nuevos (`useUpdateVenue`, `useUpdateVenueOffer`, `useDeleteVenueOffer`) usan `apiPatch`/`apiDelete` con los paths correctos (`/admin/venues/{id}`, `/admin/venues/{id}/offers/{offerId}`). El hook existente `useCreateVenueOffer` se define como recibiendo `{ venueId, input }` (verificar firma actual — el reporte de exploración lo lista como recibiendo `input`; **verificar antes de ejecutar** que la firma coincida).

**Verificación a hacer antes de ejecutar Task 1:** confirmar la firma exacta de `useCreateVenueOffer` existente. Si recibe solo `input` (sin `venueId`), ajustar `VenueOffersPanel` para que pase el `venueId` por separado o adaptar la firma. El plan asume `{ venueId, input }` para consistencia con los hooks nuevos.

---

## Notas de ejecución

- **Sin dependencias bloqueantes** (endpoints ya existen).
- **Orden:** Task 1 (hooks) → Tasks 2-4 (componentes) → Task 5 (página + nav + ruta).
- **Verificación previa:** confirmar firma de `useCreateVenueOffer` existente antes de Task 1.
