# SP3 — Configuraciones globales UI (Plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página de configuración global en el panel admin con 5 tabs: Defaults de usuarios, Parámetros operativos, Feature flags, Mantenimiento & banner, y Auditoría. Cada tab consume los endpoints `/admin/settings/*` creados en SP0.

**Architecture:** Una sola página `SettingsAdminPage` con navegación por tabs local (estado de componente, sin react-router). Cada tab es un sub-componente que usa sus propios hooks (query + mutation). Los mutations invalidan las queries de lectura y muestran toasts. El tab de mantenimiento tiene confirmación reforzada por el riesgo de bloquear usuarios.

**Tech Stack:** React 19 + React Query + Tailwind v4 + sonner (toasts) + lucide-react.

**Spec de referencia:** `docs/superpowers/specs/2026-07-12-admin-panel-expansion-design.md` (Sub-proyecto 3).

**Dependencia:** SP0 completo (todos los endpoints `/admin/settings/*` deben existir).

---

## File Structure

**Crear (frontend):**
- `frontend/src/features/admin/pages/SettingsAdminPage.tsx`
- `frontend/src/features/admin/components/settings/UserDefaultsTab.tsx`
- `frontend/src/features/admin/components/settings/OperationalTab.tsx`
- `frontend/src/features/admin/components/settings/FeatureFlagsTab.tsx`
- `frontend/src/features/admin/components/settings/MaintenanceTab.tsx`
- `frontend/src/features/admin/components/settings/AuditTab.tsx`

**Modificar (frontend):**
- `frontend/src/features/admin/hooks.ts` — hooks de settings.
- `frontend/src/features/admin/types.ts` — tipos de settings.
- `frontend/src/features/admin/components/AdminNav.tsx` — añadir "Configuración".
- `frontend/src/router.tsx` — ruta `/admin/settings`.

---

## Task 1: Tipos y hooks de settings

**Files:**
- Modify: `frontend/src/features/admin/types.ts`
- Modify: `frontend/src/features/admin/hooks.ts`
- Test: `frontend/src/features/admin/__tests__/hooks.test.tsx`

- [ ] **Step 1: Add types**

Edit `frontend/src/features/admin/types.ts` — add:

```ts
export interface UserDefaultsOut {
  default_plan_validity_mins: number;
  default_search_radius_m: number;
  age_range_min: number;
  age_range_max: number;
  group_size_preference: string;
  gender_preference: string;
  activity_types: string[];
}

export interface OperationalSettingsOut {
  rate_limit_enabled: boolean;
  default_rate_limit: string;
  access_token_expire_minutes: number;
  refresh_token_expire_days: number;
  max_avatar_bytes: number;
  ws_max_message_rate: number;
}

export interface FeatureFlagOut {
  key: string;
  enabled: boolean;
  description: string | null;
}

export interface MaintenanceOut {
  enabled: boolean;
  message: string;
  banner_active: boolean;
  banner_message: string;
  banner_level: 'info' | 'warning';
  updated_by: string | null;
}

export interface AuditEventOut {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 2: Add hooks**

Edit `frontend/src/features/admin/hooks.ts` — extend `adminKeys`:

```ts
  userDefaults: () => ['admin', 'settings', 'user-defaults'] as const,
  operational: () => ['admin', 'settings', 'operational'] as const,
  featureFlags: () => ['admin', 'settings', 'feature-flags'] as const,
  maintenance: () => ['admin', 'settings', 'maintenance'] as const,
  audit: (action?: string) => ['admin', 'settings', 'audit', { action }] as const,
```

Add hooks:

```ts
export function useUserDefaults() {
  return useQuery({
    queryKey: adminKeys.userDefaults(),
    queryFn: () => apiGet<UserDefaultsOut>('/admin/settings/user-defaults'),
    staleTime: 30_000,
  });
}

export function useUpdateUserDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserDefaultsOut) =>
      apiPut<UserDefaultsOut>('/admin/settings/user-defaults', input),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.userDefaults(), updated);
      toast.success('Defaults actualizados.');
    },
    onError: () => toast.error('No se pudieron actualizar los defaults.'),
  });
}

export function useOperational() {
  return useQuery({
    queryKey: adminKeys.operational(),
    queryFn: () => apiGet<OperationalSettingsOut>('/admin/settings/operational'),
    staleTime: 30_000,
  });
}

export function useUpdateOperational() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OperationalSettingsOut) =>
      apiPut<OperationalSettingsOut>('/admin/settings/operational', input),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.operational(), updated);
      toast.success('Parámetros actualizados.');
    },
    onError: () => toast.error('No se pudieron actualizar los parámetros.'),
  });
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: adminKeys.featureFlags(),
    queryFn: () => apiGet<FeatureFlagOut[]>('/admin/settings/feature-flags'),
    staleTime: 30_000,
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiPut<FeatureFlagOut>(`/admin/settings/feature-flags/${key}`, { enabled }),
    onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.featureFlags() }),
    onError: () => toast.error('No se pudo actualizar el flag.'),
  });
}

export function useMaintenance() {
  return useQuery({
    queryKey: adminKeys.maintenance(),
    queryFn: () => apiGet<MaintenanceOut>('/admin/settings/maintenance'),
    staleTime: 10_000,
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<MaintenanceOut, 'updated_by'>) =>
      apiPut<MaintenanceOut>('/admin/settings/maintenance', input),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.maintenance(), updated);
      toast.success(updated.enabled ? 'Modo mantenimiento activado.' : 'Configuración guardada.');
    },
    onError: () => toast.error('No se pudo actualizar la configuración.'),
  });
}

export function useAuditLog(action?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(action),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AuditEventOut>>('/admin/settings/audit', {
        query: { action, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}
```

Add the necessary type imports at the top of hooks.ts.

- [ ] **Step 3: Add tests for settings hooks**

Edit `frontend/src/features/admin/__tests__/hooks.test.tsx` — add:

```tsx
it('useUserDefaults obtiene defaults', async () => {
  (client.apiGet as any).mockResolvedValue({ default_plan_validity_mins: 120 });
  const { result } = renderHook(() => useUserDefaults(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.data?.default_plan_validity_mins).toBe(120));
  expect(client.apiGet).toHaveBeenCalledWith('/admin/settings/user-defaults');
});

it('useUpdateFeatureFlag pega al endpoint correcto', async () => {
  (client.apiPut as any).mockResolvedValue({ key: 'reviews', enabled: false });
  const { result } = renderHook(() => useUpdateFeatureFlag(), { wrapper: createWrapper() });
  await result.current.mutateAsync({ key: 'reviews', enabled: false });
  expect(client.apiPut).toHaveBeenCalledWith('/admin/settings/feature-flags/reviews', { enabled: false });
});

it('useMaintenance lee el estado', async () => {
  (client.apiGet as any).mockResolvedValue({ enabled: false, banner_active: false });
  const { result } = renderHook(() => useMaintenance(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.data?.enabled).toBe(false));
});
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/features/admin/__tests__/hooks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/types.ts frontend/src/features/admin/hooks.ts frontend/src/features/admin/__tests__/hooks.test.tsx
git commit -m "feat(admin-fe): hooks y tipos de settings globales (SP3-task1)"
```

---

## Task 2: UserDefaultsTab

**Files:**
- Create: `frontend/src/features/admin/components/settings/UserDefaultsTab.tsx`

- [ ] **Step 1: Create the component**

`frontend/src/features/admin/components/settings/UserDefaultsTab.tsx`:

Form with fields: `default_plan_validity_mins` (number), `default_search_radius_m` (number), `age_range_min` (number), `age_range_max` (number), `group_size_preference` (select: `one_on_one`/`small_group`/`either`), `gender_preference` (select: `any`/`same`/`mixed`/`specific`), `activity_types` (multiselect of checkboxes from a fixed list of `ActivityType` values).

Pattern: load with `useUserDefaults`, populate a local form state on data arrival, submit with `useUpdateUserDefaults`. Use a `<form onSubmit>` with controlled inputs. Use the existing `Input` component for numbers and native `<select>` for selects (consistent with `ReportRow` which uses native select).

```tsx
import { useEffect, useState } from 'react';
import { useUserDefaults, useUpdateUserDefaults } from '../../hooks';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Spinner } from '../../../../components/ui/Spinner';
import { ErrorState } from '../../../../components/ui/ErrorState';
import type { UserDefaultsOut } from '../../types';

const ACTIVITY_TYPES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'];

export function UserDefaultsTab() {
  const { data, isLoading, isError, refetch } = useUserDefaults();
  const update = useUpdateUserDefaults();
  const [form, setForm] = useState<UserDefaultsOut | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!form) return null;

  function toggleActivity(a: string) {
    setForm((f) => f && ({
      ...f,
      activity_types: f.activity_types.includes(a)
        ? f.activity_types.filter((x) => x !== a)
        : [...f.activity_types, a],
    }));
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Validez de plan (min)
          <Input type="number" min={1} max={1440} value={form.default_plan_validity_mins}
            onChange={(e) => setForm({ ...form, default_plan_validity_mins: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Radio de búsqueda (m)
          <Input type="number" min={100} max={50000} value={form.default_search_radius_m}
            onChange={(e) => setForm({ ...form, default_search_radius_m: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Edad mínima
          <Input type="number" min={18} max={99} value={form.age_range_min}
            onChange={(e) => setForm({ ...form, age_range_min: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Edad máxima
          <Input type="number" min={18} max={99} value={form.age_range_max}
            onChange={(e) => setForm({ ...form, age_range_max: Number(e.target.value) })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Tamaño de grupo
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.group_size_preference}
            onChange={(e) => setForm({ ...form, group_size_preference: e.target.value })}>
            <option value="one_on_one">Uno a uno</option>
            <option value="small_group">Grupo pequeño</option>
            <option value="either">Cualquiera</option>
          </select>
        </label>
        <label className="text-sm">
          Preferencia de género
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.gender_preference}
            onChange={(e) => setForm({ ...form, gender_preference: e.target.value })}>
            <option value="any">Cualquiera</option>
            <option value="same">Mismo</option>
            <option value="mixed">Mixto</option>
            <option value="specific">Específico</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm mb-2">Tipos de actividad disponibles</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((a) => (
            <label key={a} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1 text-sm">
              <input type="checkbox" checked={form.activity_types.includes(a)} onChange={() => toggleActivity(a)} />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={update.isPending}>Guardar defaults</Button>
    </form>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/components/settings/UserDefaultsTab.tsx
git commit -m "feat(admin-fe): tab de defaults de usuario (SP3-task2)"
```

---

## Task 3: OperationalTab, FeatureFlagsTab, MaintenanceTab, AuditTab

**Files:**
- Create: `frontend/src/features/admin/components/settings/OperationalTab.tsx`
- Create: `frontend/src/features/admin/components/settings/FeatureFlagsTab.tsx`
- Create: `frontend/src/features/admin/components/settings/MaintenanceTab.tsx`
- Create: `frontend/src/features/admin/components/settings/AuditTab.tsx`

- [ ] **Step 1: Create OperationalTab**

`frontend/src/features/admin/components/settings/OperationalTab.tsx` — same form pattern as UserDefaultsTab. Fields editable: `rate_limit_enabled` (checkbox), `default_rate_limit` (text), `access_token_expire_minutes` (number), `refresh_token_expire_days` (number), `max_avatar_bytes` (number), `ws_max_message_rate` (number). Uses `useOperational` + `useUpdateOperational`. Submit button with loading state.

- [ ] **Step 2: Create FeatureFlagsTab**

`frontend/src/features/admin/components/settings/FeatureFlagsTab.tsx` — list of flags from `useFeatureFlags()`, each rendered as a `<li class="glass-panel">` with the key, description, and a toggle (native checkbox or a styled toggle). On toggle, calls `useUpdateFeatureFlag().mutate({ key, enabled })`. Uses optimistic disabled state while mutation is pending.

```tsx
import { useFeatureFlags, useUpdateFeatureFlag } from '../../hooks';
import { Spinner } from '../../../../components/ui/Spinner';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Badge } from '../../../../components/ui/Badge';

export function FeatureFlagsTab() {
  const { data, isLoading, isError, refetch } = useFeatureFlags();
  const update = useUpdateFeatureFlag();

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <ul className="space-y-2">
      {data?.map((flag) => (
        <li key={flag.key} className="glass-panel rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-sm font-medium">{flag.key}</p>
            {flag.description && <p className="text-sm text-gray-600">{flag.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={flag.enabled ? 'success' : 'neutral'}>
              {flag.enabled ? 'Activo' : 'Inactivo'}
            </Badge>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={flag.enabled}
                disabled={update.isPending}
                onChange={() => update.mutate({ key: flag.key, enabled: !flag.enabled })}
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-brand-600 transition-colors relative">
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${flag.enabled ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Create MaintenanceTab (con confirmación reforzada)**

`frontend/src/features/admin/components/settings/MaintenanceTab.tsx` — form for maintenance mode + banner. Critical: enabling maintenance mode requires a `ConfirmDialog` warning that it will block non-admin users. The toggle for `enabled` opens the confirm dialog; only on confirm does it call `useUpdateMaintenance`.

Fields: `enabled` (toggle → opens confirm), `message` (textarea), `banner_active` (checkbox), `banner_message` (textarea), `banner_level` (select: info/warning).

```tsx
import { useState } from 'react';
import { useMaintenance, useUpdateMaintenance } from '../../hooks';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Textarea } from '../../../../components/ui/Textarea';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Spinner } from '../../../../components/ui/Spinner';
import { Badge } from '../../../../components/ui/Badge';
import type { MaintenanceOut } from '../../types';

export function MaintenanceTab() {
  const { data, isLoading } = useMaintenance();
  const update = useUpdateMaintenance();
  const [form, setForm] = useState<MaintenanceOut | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(false);

  // sincronizar form con data
  useState(() => { if (data && !form) setForm(data); });

  if (isLoading || !data) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  const current = form ?? data;

  function submit(nextEnabled: boolean) {
    update.mutate({
      enabled: nextEnabled,
      message: current.message,
      banner_active: current.banner_active,
      banner_message: current.banner_message,
      banner_level: current.banner_level,
    });
  }

  return (
    <div className="space-y-4">
      {/* Estado actual destacado */}
      <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Modo mantenimiento</p>
          <p className="text-sm text-gray-600">Bloquea el acceso a usuarios no-admin (devuelve 503).</p>
        </div>
        <Badge variant={current.enabled ? 'danger' : 'neutral'}>
          {current.enabled ? 'ACTIVO' : 'Inactivo'}
        </Badge>
      </div>

      <label className="text-sm">
        Mensaje de mantenimiento
        <Textarea value={current.message} onChange={(e) => setForm({ ...current, message: e.target.value })} />
      </label>

      <div className="border-t pt-4">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={current.banner_active}
            onChange={(e) => setForm({ ...current, banner_active: e.target.checked })} />
          Banner global activo
        </label>
      </div>
      <label className="text-sm">
        Mensaje del banner
        <Textarea value={current.banner_message}
          onChange={(e) => setForm({ ...current, banner_message: e.target.value })} />
      </label>
      <label className="text-sm">
        Nivel del banner
        <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
          value={current.banner_level}
          onChange={(e) => setForm({ ...current, banner_level: e.target.value as 'info' | 'warning' })}>
          <option value="info">Info</option>
          <option value="warning">Advertencia</option>
        </select>
      </label>

      <Button
        loading={update.isPending}
        danger={current.enabled}
        onClick={() => {
          if (!current.enabled) {
            setConfirmOpen(true);
          } else {
            submit(false);
          }
        }}
      >
        {current.enabled ? 'Desactivar mantenimiento' : 'Activar mantenimiento'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Activar modo mantenimiento"
        message="Esto bloqueará el acceso a TODOS los usuarios no-admin. ¿Confirmás que querés activarlo?"
        confirmLabel="Sí, activar"
        loading={update.isPending}
        onConfirm={() => { setConfirmOpen(false); submit(true); }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create AuditTab**

`frontend/src/features/admin/components/settings/AuditTab.tsx` — infinite list of audit events from `useAuditLog(action)`. Each event rendered as `<li class="glass-panel">` showing: timestamp (formatted), actor_id (truncated, font-mono), action (badge), target_type/target_id, and detail (collapsible `<details>` with `<pre>`). Filter by action via a `<select>`.

```tsx
import { useState } from 'react';
import { useAuditLog } from '../../hooks';
import { Spinner } from '../../../../components/ui/Spinner';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { formatRelativeTime } from '../../../../lib/format';

export function AuditTab() {
  const [action, setAction] = useState<string | undefined>(undefined);
  const query = useAuditLog(action);
  const events = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3">
      <select
        className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-sm"
        value={action ?? ''}
        onChange={(e) => setAction(e.target.value || undefined)}
      >
        <option value="">Todas las acciones</option>
        <option value="settings.user_defaults.update">Defaults</option>
        <option value="settings.operational.update">Operativos</option>
        <option value="settings.feature_flag.update">Feature flags</option>
        <option value="settings.maintenance.update">Mantenimiento</option>
        <option value="user.ban">Ban de usuario</option>
        <option value="user.grant_admin">Grant admin</option>
        <option value="user.reset_password">Reset password</option>
        <option value="plan.cancel">Cancel plan</option>
      </select>

      {query.isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between">
                <Badge variant="brand">{ev.action}</Badge>
                <span className="text-xs text-gray-500">{formatRelativeTime(ev.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Actor: <span className="font-mono">{ev.actor_id?.slice(0, 8) ?? 'sistema'}</span>
                {ev.target_id && <> · Target: <span className="font-mono">{ev.target_id.slice(0, 8)}</span></>}
              </p>
              {Object.keys(ev.detail).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer">Detalle</summary>
                  <pre className="mt-1 text-xs bg-gray-100 rounded-lg p-2 overflow-x-auto">
                    {JSON.stringify(ev.detail, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/admin/components/settings/
git commit -m "feat(admin-fe): tabs operativo, flags, mantenimiento y auditoría (SP3-task3)"
```

---

## Task 4: SettingsAdminPage (shell con tabs)

**Files:**
- Create: `frontend/src/features/admin/pages/SettingsAdminPage.tsx`
- Modify: `frontend/src/features/admin/components/AdminNav.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Create SettingsAdminPage**

`frontend/src/features/admin/pages/SettingsAdminPage.tsx`:

```tsx
import { useState } from 'react';
import { Settings, Sliders, ToggleLeft, Wrench, ScrollText } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { UserDefaultsTab } from '../components/settings/UserDefaultsTab';
import { OperationalTab } from '../components/settings/OperationalTab';
import { FeatureFlagsTab } from '../components/settings/FeatureFlagsTab';
import { MaintenanceTab } from '../components/settings/MaintenanceTab';
import { AuditTab } from '../components/settings/AuditTab';

const TABS = [
  { key: 'defaults', label: 'Defaults', icon: Sliders },
  { key: 'operational', label: 'Operativos', icon: Settings },
  { key: 'flags', label: 'Feature flags', icon: ToggleLeft },
  { key: 'maintenance', label: 'Mantenimiento', icon: Wrench },
  { key: 'audit', label: 'Auditoría', icon: ScrollText },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsAdminPage() {
  const [tab, setTab] = useState<TabKey>('defaults');

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Configuración global</h1>
          <AdminNav />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Tabs locales (no react-router) */}
        <div role="tablist" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  tab === t.key ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'
                }`}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'defaults' && <UserDefaultsTab />}
        {tab === 'operational' && <OperationalTab />}
        {tab === 'flags' && <FeatureFlagsTab />}
        {tab === 'maintenance' && <MaintenanceTab />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add nav entry**

Edit `frontend/src/features/admin/components/AdminNav.tsx` — add to ITEMS:

```ts
{ to: '/admin/settings', label: 'Configuración', icon: Settings, end: false },
```

Import `Settings` from `lucide-react`.

- [ ] **Step 3: Add route**

Edit `frontend/src/router.tsx` — add lazy import:

```tsx
const SettingsAdminPage = lazy(() => import('./features/admin/pages/SettingsAdminPage'));
```

Add inside `RequireAdminRoute` children:

```tsx
{ path: '/admin/settings', element: <PageSuspense><SettingsAdminPage /></PageSuspense> },
```

- [ ] **Step 4: Run type check and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/features/admin/`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/pages/SettingsAdminPage.tsx frontend/src/features/admin/components/AdminNav.tsx frontend/src/router.tsx
git commit -m "feat(admin-fe): página de configuración global con 5 tabs (SP3-task4)"
```

---

## Self-Review (post-plan)

**Spec coverage (Sub-proyecto 3):**
- ✅ Defaults de usuarios → Task 2 (UserDefaultsTab).
- ✅ Parámetros operativos → Task 3 (OperationalTab).
- ✅ Feature flags → Task 3 (FeatureFlagsTab).
- ✅ Mantenimiento + banner → Task 3 (MaintenanceTab con confirmación).
- ✅ Auditoría → Task 3 (AuditTab).
- ✅ Shell con tabs → Task 4.
- ✅ Confirmación reforzada para mantenimiento → Task 3 Step 3.

**Placeholder scan:** Sin TODOs. El Task 3 Step 1 (OperationalTab) se describe como "mismo patrón que UserDefaultsTab" con los campos listados — el código es derivable del Task 2 (que tiene código completo). **Acción:** antes de ejecutar, concretar el código de OperationalTab replicando la estructura de UserDefaultsTab con los 6 campos.

**Type consistency:** Los tipos (`UserDefaultsOut`, `OperationalSettingsOut`, `FeatureFlagOut`, `MaintenanceOut`, `AuditEventOut`) coinciden con los schemas del SP0 backend (`admin/settings_schemas.py`). `adminKeys` extendido sin colisionar.

**Gap detectado:** `useState(() => { ... })` en MaintenanceTab (Task 3 Step 3) es incorrecto — `useState` con initializer no se usa para sincronizar con props/data; debería ser `useEffect`. **Corrección:** reemplazar por:

```tsx
useEffect(() => { if (data) setForm(data); }, [data]);
```

(igual que UserDefaultsTab en Task 2).

---

## Notas de ejecución

- **Dependencia:** SP0 completo.
- **Orden:** Task 1 (hooks) → Tasks 2-3 (tabs) → Task 4 (shell).
- **Correcciones a aplicar antes de ejecutar:** OperationalTab (concretar código), MaintenanceTab `useState` → `useEffect`.
