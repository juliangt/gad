# Perfil de Usuario Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el dominio *Perfil de usuario* (F2) del frontend de GAD, conectando el mockup de `ProfileView` al backend real: ver perfil propio (`GET /me`), editarlo (`PATCH /me`), subir avatar (`POST /me/avatar`), configurar preferencias (`PUT /me/preferences`), borrar cuenta (`DELETE /me`), ver perfil público (`GET /users/{id}`), y gestionar bloqueos (`POST /users/{id}/block`, `GET /me/blocks`, `DELETE /me/blocks/{id}`). Todo bajo el feature folder `frontend/src/features/users/`, reutilizando el API client, React Query y el design system de F0/F1.

**Architecture:** Feature-based. `features/users/` contiene `types.ts` (espejo del contrato), `schemas.ts` (zod), `hooks.ts` (React Query: `useQuery`/`useMutation` con invalidación de `['me']`), `components/` (`UserAvatar`, `VerificationBadge`, `ActivityTypeChips`, `AvatarUpload`, `ProfileForm`, `PreferencesForm`) y `pages/` (`ProfilePage`, `EditProfilePage`, `UserPublicPage`, `BlockedUsersPage`). Las páginas consumen exclusivamente los hooks; los hooks son la única capa que llama al `api/client.ts`. Los formularios usan `react-hook-form` + `zodResolver`. La subida de avatar usa `FormData` (multipart). El soft-delete invalida toda la caché de React Query y dispara logout + redirect a `/register`.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, TanStack Query v5, react-hook-form + `@hookform/resolvers/zod`, zod, date-fns v4, sonner, lucide-react, Tailwind v4 (clases `glass-panel`, `glass-button`, escala `brand`, `pt-safe-top`/`pb-safe-bottom`), Vitest + @testing-library/react + jsdom.

---

## Prerequisites — Contratos asumidos de F0/F1

F2 asume que F0 (Fundaciones) y F1 (Auth) entregaron las siguientes firmas. **Si alguna no coincide, adaptar el nombre en F2 antes de continuar; no re-implementar F0/F1.**

### `frontend/src/api/client.ts` (F0)
```ts
export interface ApiRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;            // body JSON (Content-Type application/json)
  form?: FormData;           // body multipart
  signal?: AbortSignal;
}
export async function apiRequest<T>(
  method: string, path: string, opts?: ApiRequestOptions,
): Promise<T>;
export const apiGet:    <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
export const apiPost:   <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
export const apiPut:    <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
export const apiPatch:  <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
export const apiDelete: <T>(path: string, opts?: ApiRequestOptions) => Promise<T>;
```
> `apiRequest` lanza `ApiError(code, status, detail)` (de `@/api/errors`) ante respuestas no-2xx. Para `204 No Content` devuelve `undefined` como `T`. Soporta `form` para multipart (avatar).

### `frontend/src/types/enums.ts` (F0)
Exporta como uniones de string literales: `ActivityType`, `Gender`, `VerificationLevel`, `GroupSizePreference`, `GenderPreference`. Valores exactos en `API_CONTRACT.md §5`.

### `frontend/src/auth/` (F0/F1)
- `useAuth()` (de `@/auth/useAuth`) → `{ user, status, login, register, logout, refresh }` donde `logout()` limpia tokens y estado (`POST /auth/logout` + reset del `AuthProvider`). `user` es el `UserPublic` de `GET /auth/me` (mínimo: id, email, display_name, verification_level, reputation_score).
- `RequireAuth` (`@/auth/RequireAuth`) — guard de rutas protegidas.

### Design system `frontend/src/components/ui/` (F0)
- `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md'|'lg', loading?: boolean, disabled?: boolean, children, ...rest })`
- `Input({ label?: string, error?: string, id?: string, ...rest })` — envuelve `<input>`.
- `Textarea({ label?: string, error?: string, ...rest })`
- `Select({ label?: string, error?: string, children, ...rest })` — `<select>` nativo.
- `Spinner({ className?: string })`
- `Badge({ variant?: 'neutral'|'brand'|'success'|'warning'|'danger', children })`
- `EmptyState({ title: string, description?: string, icon?: ReactNode, action?: ReactNode })`
- `ErrorState({ message: string, onRetry?: () => void })`
- `ConfirmDialog({ open: boolean, title: string, description?: string, confirmLabel?: string, cancelLabel?: string, destructive?: boolean, loading?: boolean, onConfirm: () => void, onCancel: () => void })` — modal accesible.

### Router `frontend/src/router.tsx` (F0)
`createBrowserRouter` con layout protegido envuelto por `<RequireAuth>`; rutas hijas declaradas con `{ path, element }`. F2 añade 4 hijas (Task 11).

### Otros (F0)
- `@/lib/utils` → `cn(...)`.
- `sonner` → `import { toast } from 'sonner'` (montado en `main.tsx`).
- Vitest configurado (`vitest.config.ts`) con jsdom y setup `@testing-library/react`.

### Diferencia clave `/auth/me` vs `/me`
- `GET /auth/me` (F0/F1) → `UserPublic` (mínimo, para bootstrap de sesión).
- `GET /me` (F2) → `UserDetail` (completo: avatar, bio, preferences, birth_date...). **F2 introduce `useMe` sobre `GET /me` como fuente canónica del perfil.**

---

## File Structure

- **Create:** `frontend/src/features/users/types.ts` — `UserDetail`, `UserPreferences`, `PreferencesIn`, `PreferencesOut`, `UserUpdateIn`, `UserPublicProfile`, `BlockOut`.
- **Create:** `frontend/src/features/users/schemas.ts` — zod `userUpdateSchema`, `preferencesSchema` (espejo del contrato).
- **Create:** `frontend/src/features/users/hooks.ts` — `useMe`, `useUpdateMe`, `useDeleteMe`, `useUpdatePreferences`, `useUploadAvatar`, `useUser`, `useBlock`, `useBlocks`, `useUnblock`.
- **Create:** `frontend/src/features/users/constants.ts` — labels/colores de enums (activity, gender, verification, group size, gender preference).
- **Create:** `frontend/src/features/users/components/UserAvatar.tsx`
- **Create:** `frontend/src/features/users/components/VerificationBadge.tsx`
- **Create:** `frontend/src/features/users/components/ActivityTypeChips.tsx`
- **Create:** `frontend/src/features/users/components/AvatarUpload.tsx`
- **Create:** `frontend/src/features/users/components/ProfileForm.tsx`
- **Create:** `frontend/src/features/users/components/PreferencesForm.tsx`
- **Create:** `frontend/src/features/users/pages/ProfilePage.tsx`
- **Create:** `frontend/src/features/users/pages/EditProfilePage.tsx`
- **Create:** `frontend/src/features/users/pages/UserPublicPage.tsx`
- **Create:** `frontend/src/features/users/pages/BlockedUsersPage.tsx`
- **Create:** `frontend/src/features/users/__tests__/schemas.test.ts`
- **Create:** `frontend/src/features/users/__tests__/hooks.test.tsx`
- **Create:** `frontend/src/features/users/__tests__/UserAvatar.test.tsx`
- **Create:** `frontend/src/features/users/__tests__/test-utils.tsx` — wrapper de QueryClient para hooks.
- **Modify:** `frontend/src/router.tsx` — añadir rutas `/me`, `/me/edit`, `/me/blocks`, `/users/:userId`.
- **Optional/Conditional:** `frontend/src/api/client.ts` — si F0 no exportó `apiPut` ni soporta `form` multipart, añadirlo (Task 0).

---

## Task 0 (condicional): Asegurar soporte de PUT y multipart en el API client

**Files:**
- Modify (solo si falta): `frontend/src/api/client.ts`

- [ ] **Step 1: Verificar la firma existente**

Run: `cd frontend && grep -n "apiPut\|export const apiDelete\|form:" src/api/client.ts || echo "FALTA"`

- [ ] **Step 2: Si `apiPut` no existe o `form` no está soportado, extender el wrapper**

Reemplazar el cuerpo de `apiRequest` por una versión que distinga `json` vs `form` y añadir `apiPut`. El resultado debe exponer exactamente la firma de la sección *Prerequisites*. Ejemplo de implementación mínima a integrar:

```ts
export async function apiRequest<T>(
  method: string,
  path: string,
  opts: ApiRequestOptions = {},
): Promise<T> {
  const { VITE_API_URL = '' } = import.meta.env;
  const url = new URL(`${VITE_API_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form; // el navegador setea el Content-Type boundary
  }
  const res = await fetch(url.toString(), { method, headers, body, signal: opts.signal });
  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? (await res.json()) as T : (undefined as T);
}

export const apiGet = <T>(p: string, o?: ApiRequestOptions) => apiRequest<T>('GET', p, o);
export const apiPost = <T>(p: string, o?: ApiRequestOptions) => apiRequest<T>('POST', p, o);
export const apiPut = <T>(p: string, o?: ApiRequestOptions) => apiRequest<T>('PUT', p, o);
export const apiPatch = <T>(p: string, o?: ApiRequestOptions) => apiRequest<T>('PATCH', p, o);
export const apiDelete = <T>(p: string, o?: ApiRequestOptions) => apiRequest<T>('DELETE', p, o);
```

> `toApiError` ya existe en F0; no tocar.

- [ ] **Step 3: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit (solo si se modificó)**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): soportar PUT y body multipart en el cliente HTTP"
```

---

## Task 1: Tipos del dominio users

**Files:**
- Create: `frontend/src/features/users/types.ts`

- [ ] **Step 1: Crear `types.ts` derivado del contrato (`API_CONTRACT.md §Usuarios`)**

```ts
// frontend/src/features/users/types.ts
import type {
  ActivityType,
  Gender,
  GenderPreference,
  GroupSizePreference,
  VerificationLevel,
} from '@/types/enums';

/** GET /me → perfil completo del usuario autenticado. */
export interface UserPreferences {
  default_search_radius_m: number;
  activity_types: ActivityType[];
  group_size_preference: GroupSizePreference;
  age_range_min: number;
  age_range_max: number;
  gender_preference: GenderPreference;
  notify_new_plans: boolean;
  notify_messages: boolean;
  notify_pending_alerts: boolean;
}

export interface UserDetail {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null; // yyyy-mm-dd
  gender: Gender;
  reputation_score: number;
  verification_level: VerificationLevel;
  preferences: UserPreferences;
}

/** Alias legible (UserDetail.preferences usa esta forma). */
export type PreferencesOut = UserPreferences;

/** PUT /me/preferences body. Todos los campos opcionales según contrato. */
export interface PreferencesIn {
  default_search_radius_m?: number;
  activity_types?: ActivityType[];
  group_size_preference?: GroupSizePreference;
  age_range_min?: number;
  age_range_max?: number;
  gender_preference?: GenderPreference;
  notify_new_plans?: boolean;
  notify_messages?: boolean;
  notify_pending_alerts?: boolean;
}

/** PATCH /me body. Todos opcionales. */
export interface UserUpdateIn {
  display_name?: string;
  bio?: string | null;
  birth_date?: string | null;
  gender?: Gender | null;
  locale?: string | null;
  timezone?: string | null;
}

/** GET /users/{id} → perfil público. */
export interface UserPublicProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  reputation_score: number;
  verification_level: VerificationLevel;
}

/** POST /users/{id}/block y GET /me/blocks item. */
export interface BlockOut {
  blocked_id: string;
  created_at: string; // ISO 8601
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores (requiere que `@/types/enums` exista de F0).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/types.ts
git commit -m "feat(users): tipos TS del dominio perfil (UserDetail, Preferences, Block)"
```

---

## Task 2: Schemas zod (TDD)

**Files:**
- Create: `frontend/src/features/users/schemas.ts`
- Create: `frontend/src/features/users/__tests__/schemas.test.ts`

- [ ] **Step 1: Escribir primero los tests (rojo)**

```ts
// frontend/src/features/users/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import {
  userUpdateSchema,
  preferencesSchema,
  ACTIVITY_VALUES,
  GENDER_VALUES,
} from '../schemas';

describe('userUpdateSchema', () => {
  it('acepta un payload válido mínimo', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'Martín' });
    expect(r.success).toBe(true);
  });

  it('rechaza display_name vacío (min 1)', () => {
    const r = userUpdateSchema.safeParse({ display_name: '' });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name > 100', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('rechaza bio > 500', () => {
    const r = userUpdateSchema.safeParse({ bio: 'y'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('acepta bio de 500', () => {
    const r = userUpdateSchema.safeParse({ bio: 'y'.repeat(500) });
    expect(r.success).toBe(true);
  });

  it('acepta gender null', () => {
    const r = userUpdateSchema.safeParse({ gender: null });
    expect(r.success).toBe(true);
  });

  it('rechaza gender inválido', () => {
    const r = userUpdateSchema.safeParse({ gender: 'helicopter' });
    expect(r.success).toBe(false);
  });
});

describe('preferencesSchema', () => {
  const valid = {
    default_search_radius_m: 2000,
    activity_types: ['coffee', 'walk'],
    group_size_preference: 'either',
    age_range_min: 18,
    age_range_max: 99,
    gender_preference: 'any',
    notify_new_plans: true,
    notify_messages: true,
    notify_pending_alerts: true,
  };

  it('acepta un payload válido', () => {
    expect(preferencesSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza radio < 100', () => {
    expect(preferencesSchema.safeParse({ ...valid, default_search_radius_m: 50 }).success).toBe(false);
  });

  it('rechaza radio > 50000', () => {
    expect(preferencesSchema.safeParse({ ...valid, default_search_radius_m: 60000 }).success).toBe(false);
  });

  it('rechaza edad min < 18', () => {
    expect(preferencesSchema.safeParse({ ...valid, age_range_min: 17 }).success).toBe(false);
  });

  it('rechaza edad max > 99', () => {
    expect(preferencesSchema.safeParse({ ...valid, age_range_max: 100 }).success).toBe(false);
  });

  it('rechaza age_min > age_max', () => {
    const r = preferencesSchema.safeParse({ ...valid, age_range_min: 40, age_range_max: 30 });
    expect(r.success).toBe(false);
  });

  it('acepta activity_type válido del enum', () => {
    expect(
      preferencesSchema.safeParse({ ...valid, activity_types: ACTIVITY_VALUES }).success,
    ).toBe(true);
  });

  it('rechaza activity_type fuera del enum', () => {
    expect(preferencesSchema.safeParse({ ...valid, activity_types: ['skydiving'] }).success).toBe(false);
  });

  it('expone los 4 valores de gender', () => {
    expect(GENDER_VALUES).toEqual(['male', 'female', 'nonbinary', 'undisclosed']);
  });
});
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/schemas.test.ts`
Expected: **falla** (los schemas no existen).

- [ ] **Step 2: Implementar los schemas (verde)**

```ts
// frontend/src/features/users/schemas.ts
import { z } from 'zod';

// --- Enums espejo del contrato (zod requiere literales) ---
export const ACTIVITY_VALUES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'] as const;
export const GENDER_VALUES = ['male', 'female', 'nonbinary', 'undisclosed'] as const;
export const GROUP_SIZE_VALUES = ['one_on_one', 'small_group', 'either'] as const;
export const GENDER_PREFERENCE_VALUES = ['any', 'same', 'mixed', 'specific'] as const;

export const activityTypeSchema = z.enum(ACTIVITY_VALUES);
export const genderSchema = z.enum(GENDER_VALUES);
export const groupSizeSchema = z.enum(GROUP_SIZE_VALUES);
export const genderPreferenceSchema = z.enum(GENDER_PREFERENCE_VALUES);

// --- PATCH /me ---
export const userUpdateSchema = z.object({
  display_name: z.string().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  bio: z.string().max(500, 'Máximo 500 caracteres').nullable().optional(),
  birth_date: z.string().nullable().optional(), // yyyy-mm-dd vía <input type="date">
  gender: genderSchema.nullable().optional(),
  locale: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});
export type UserUpdateFormValues = z.infer<typeof userUpdateSchema>;

// --- PUT /me/preferences ---
export const preferencesSchema = z
  .object({
    default_search_radius_m: z
      .number({ invalid_type_error: 'Ingresá un número' })
      .int('Debe ser entero')
      .min(100, 'Mínimo 100 m')
      .max(50000, 'Máximo 50000 m'),
    activity_types: z.array(activityTypeSchema),
    group_size_preference: groupSizeSchema,
    age_range_min: z.number().int().min(18, 'Mínimo 18').max(99, 'Máximo 99'),
    age_range_max: z.number().int().min(18, 'Mínimo 18').max(99, 'Máximo 99'),
    gender_preference: genderPreferenceSchema,
    notify_new_plans: z.boolean(),
    notify_messages: z.boolean(),
    notify_pending_alerts: z.boolean(),
  })
  .refine((d) => d.age_range_min <= d.age_range_max, {
    path: ['age_range_max'],
    message: 'La edad máxima no puede ser menor que la mínima',
  });
export type PreferencesFormValues = z.infer<typeof preferencesSchema>;
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/schemas.test.ts`
Expected: todos los tests pasan.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/schemas.ts frontend/src/features/users/__tests__/schemas.test.ts
git commit -m "test(users): schemas zod de perfil y preferencias (TDD)"
```

---

## Task 3: Constantes y labels de enums

**Files:**
- Create: `frontend/src/features/users/constants.ts`

- [ ] **Step 1: Crear constantes para labels en español**

```ts
// frontend/src/features/users/constants.ts
import type {
  ActivityType,
  Gender,
  GenderPreference,
  GroupSizePreference,
  VerificationLevel,
} from '@/types/enums';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  coffee: 'Café',
  drinks: 'Cerveza',
  food: 'Comida',
  walk: 'Caminata',
  park: 'Parque',
  event: 'Evento',
  other: 'Otro',
};

export const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = (
  Object.keys(ACTIVITY_LABELS) as ActivityType[]
).map((value) => ({ value, label: ACTIVITY_LABELS[value] }));

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'nonbinary', label: 'No binario' },
  { value: 'undisclosed', label: 'Prefiero no decirlo' },
];

export const GROUP_SIZE_OPTIONS: { value: GroupSizePreference; label: string }[] = [
  { value: 'one_on_one', label: 'Uno a uno' },
  { value: 'small_group', label: 'Grupo chico' },
  { value: 'either', label: 'Indistinto' },
];

export const GENDER_PREFERENCE_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: 'any', label: 'Cualquiera' },
  { value: 'same', label: 'Mismo género' },
  { value: 'mixed', label: 'Mixto' },
  { value: 'specific', label: 'Específico' },
];

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  none: 'Sin verificar',
  email: 'Email verificado',
  google: 'Google verificado',
};

export const RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 25000, label: '25 km' },
  { value: 50000, label: '50 km' },
];
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/constants.ts
git commit -m "feat(users): labels en español de enums de perfil"
```

---

## Task 4: Hooks de datos con React Query (TDD)

**Files:**
- Create: `frontend/src/features/users/__tests__/test-utils.tsx`
- Create: `frontend/src/features/users/__tests__/hooks.test.tsx`
- Create: `frontend/src/features/users/hooks.ts`

- [ ] **Step 1: Wrapper de QueryClient para tests**

```tsx
// frontend/src/features/users/__tests__/test-utils.tsx
import { type ReactNode, createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function createWrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}
```

- [ ] **Step 2: Tests de hooks (rojo)**

```tsx
// frontend/src/features/users/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as client from '@/api/client';
import { useMe, useUpdateMe, useUploadAvatar, useBlocks, useBlock, useUser } from '../hooks';
import { createTestQueryClient, createWrapper } from './test-utils';
import type { UserDetail, BlockOut, UserPublicProfile } from '../types';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

const ME: UserDetail = {
  id: 'u1', email: 'martin@example.com', display_name: 'Martín',
  avatar_url: null, bio: null, birth_date: null, gender: 'undisclosed',
  reputation_score: 4.8, verification_level: 'email',
  preferences: {
    default_search_radius_m: 2000, activity_types: ['coffee', 'drinks'],
    group_size_preference: 'either', age_range_min: 18, age_range_max: 99,
    gender_preference: 'any', notify_new_plans: true, notify_messages: true,
    notify_pending_alerts: true,
  },
};

const BLOCK: BlockOut = { blocked_id: 'u2', created_at: '2026-07-09T12:00:00Z' };

beforeEach(() => vi.clearAllMocks());

describe('useMe', () => {
  it('trae UserDetail desde GET /me', async () => {
    (client.apiGet as any).mockResolvedValueOnce(ME);
    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(ME);
    expect(client.apiGet).toHaveBeenCalledWith('/me');
  });

  it('expone error cuando /me falla', async () => {
    (client.apiGet as any).mockRejectedValueOnce(new Error('401'));
    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});

describe('useUpdateMe', () => {
  it('hace PATCH /me y actualiza la caché de me', async () => {
    const qc = createTestQueryClient();
    qc.setQueryData(['me'], ME);
    const updated = { ...ME, display_name: 'Martín G.' };
    (client.apiPatch as any).mockResolvedValueOnce(updated);
    const { result } = renderHook(() => useUpdateMe(), {
      wrapper: createWrapper(qc),
    });
    result.current.mutate({ display_name: 'Martín G.' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiPatch).toHaveBeenCalledWith('/me', { json: { display_name: 'Martín G.' } });
    expect(qc.getQueryData(['me'])).toEqual(updated);
  });
});

describe('useUploadAvatar', () => {
  it('envía FormData con el archivo a POST /me/avatar', async () => {
    const updated = { ...ME, avatar_url: 'https://cdn/avatar.png' };
    (client.apiPost as any).mockImplementation(async (_path: string, opts: any) => {
      expect(opts.form.get('file').name).toBe('a.png');
      return updated;
    });
    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    result.current.mutate(file);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiPost).toHaveBeenCalledWith('/me/avatar', expect.objectContaining({ form: expect.any(FormData) }));
  });
});

describe('useBlocks', () => {
  it('trae BlockOut[] desde GET /me/blocks', async () => {
    (client.apiGet as any).mockResolvedValueOnce([BLOCK]);
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([BLOCK]);
    expect(client.apiGet).toHaveBeenCalledWith('/me/blocks');
  });
});

describe('useBlock', () => {
  it('hace POST /users/{id}/block', async () => {
    (client.apiPost as any).mockResolvedValueOnce(BLOCK);
    const { result } = renderHook(() => useBlock(), { wrapper: createWrapper() });
    result.current.mutate('u2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiPost).toHaveBeenCalledWith('/users/u2/block');
  });
});

describe('useUser', () => {
  it('trae UserPublicProfile desde GET /users/{id}', async () => {
    const pub: UserPublicProfile = {
      id: 'u2', display_name: 'Julieta', avatar_url: null, bio: null,
      reputation_score: 4.9, verification_level: 'google',
    };
    (client.apiGet as any).mockResolvedValueOnce(pub);
    const { result } = renderHook(() => useUser('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pub);
    expect(client.apiGet).toHaveBeenCalledWith('/users/u2');
  });

  it('no consulta cuando falta el id', () => {
    const { result } = renderHook(() => useUser(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.apiGet).not.toHaveBeenCalled();
  });
});
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/hooks.test.tsx`
Expected: **falla** (los hooks no existen).

- [ ] **Step 3: Implementar hooks (verde)**

```ts
// frontend/src/features/users/hooks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPut, apiPost, apiDelete } from '@/api/client';
import type {
  BlockOut,
  PreferencesIn,
  PreferencesOut,
  UserDetail,
  UserPublicProfile,
  UserUpdateIn,
} from './types';

// Query keys jerárquicas (invalidación granular).
export const meKey = ['me'] as const;
export const blocksKey = ['me', 'blocks'] as const;
export const userKey = (id: string) => ['users', id] as const;

/** Perfil completo del usuario autenticado (GET /me). Fuente canónica del perfil. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => apiGet<UserDetail>('/me'),
    staleTime: 30_000,
  });
}

/** PATCH /me — actualiza caché de ['me'] para feedback instantáneo. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserUpdateIn) => apiPatch<UserDetail>('/me', { json: patch }),
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

/** POST /me/avatar (multipart) — actualiza caché de ['me'] con el UserDetail devuelto. */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiPost<UserDetail>('/me/avatar', { form });
    },
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

/** PUT /me/preferences — invalida ['me'] para refrescar las preferencias embebidas. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: PreferencesIn) =>
      apiPut<PreferencesOut>('/me/preferences', { json: prefs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

/** DELETE /me (soft-delete) — limpia toda la caché. El logout + redirect lo maneja la página. */
export function useDeleteMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<void>('/me'),
    onSuccess: () => qc.clear(),
  });
}

/** GET /users/{id} — perfil público. */
export function useUser(userId: string) {
  return useQuery({
    queryKey: userKey(userId),
    queryFn: () => apiGet<UserPublicProfile>(`/users/${userId}`),
    enabled: Boolean(userId),
  });
}

/** POST /users/{id}/block — invalida ['me','blocks']. */
export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<BlockOut>(`/users/${userId}/block`),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey }),
  });
}

/** GET /me/blocks. */
export function useBlocks() {
  return useQuery({
    queryKey: blocksKey,
    queryFn: () => apiGet<BlockOut[]>('/me/blocks'),
  });
}

/** DELETE /me/blocks/{user_id} — invalida ['me','blocks']. */
export function useUnblock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete<{ message: string }>(`/me/blocks/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey }),
  });
}
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/hooks.test.tsx`
Expected: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/users/hooks.ts \
        frontend/src/features/users/__tests__/hooks.test.tsx \
        frontend/src/features/users/__tests__/test-utils.tsx
git commit -m "feat(users): hooks de datos useMe/useUpdateMe/useAvatar/preferences/block"
```

---

## Task 5: Componentes de presentación (UserAvatar, VerificationBadge, ActivityTypeChips)

**Files:**
- Create: `frontend/src/features/users/components/UserAvatar.tsx`
- Create: `frontend/src/features/users/components/VerificationBadge.tsx`
- Create: `frontend/src/features/users/components/ActivityTypeChips.tsx`
- Create: `frontend/src/features/users/__tests__/UserAvatar.test.tsx`

- [ ] **Step 1: Test de UserAvatar (rojo)**

```tsx
// frontend/src/features/users/__tests__/UserAvatar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from '../components/UserAvatar';

describe('UserAvatar', () => {
  it('muestra la imagen cuando hay url', () => {
    render(<UserAvatar url="https://cdn/a.png" name="Martín" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn/a.png');
    expect(img).toHaveAttribute('alt', 'Martín');
  });

  it('muestra la inicial cuando no hay url', () => {
    render(<UserAvatar url={null} name="Martín" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('usa la inicial mayúscula del nombre', () => {
    render(<UserAvatar url={null} name="julieta" />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('cae a "?" con nombre vacío', () => {
    render(<UserAvatar url={null} name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/UserAvatar.test.tsx`
Expected: **falla**.

- [ ] **Step 2: Implementar `UserAvatar` (verde)**

```tsx
// frontend/src/features/users/components/UserAvatar.tsx
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  url: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'w-10 h-10 text-base',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
};

export function UserAvatar({ url, name, size = 'md', className }: UserAvatarProps) {
  const initial = name && name.length > 0 ? name.charAt(0).toUpperCase() : '?';

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn('rounded-full object-cover bg-gray-100', SIZE[size], className)}
      />
    );
  }

  return (
    <div
      aria-label={name || 'Avatar'}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shadow-lg',
        'bg-gradient-to-br from-brand-400 to-brand-600',
        SIZE[size],
        className,
      )}
    >
      {initial}
    </div>
  );
}
```

- [ ] **Step 3: `VerificationBadge`**

```tsx
// frontend/src/features/users/components/VerificationBadge.tsx
import { ShieldCheck, Mail, CircleCheck } from 'lucide-react';
import type { VerificationLevel } from '@/types/enums';
import { VERIFICATION_LABELS } from '../constants';
import { Badge } from '@/components/ui/Badge';

export function VerificationBadge({ level }: { level: VerificationLevel }) {
  if (level === 'none') {
    return (
      <Badge variant="neutral">
        <CircleCheck className="w-3.5 h-3.5" />
        {VERIFICATION_LABELS.none}
      </Badge>
    );
  }
  const Icon = level === 'email' ? Mail : ShieldCheck;
  return (
    <Badge variant="success">
      <Icon className="w-3.5 h-3.5" />
      {VERIFICATION_LABELS[level]}
    </Badge>
  );
}
```

- [ ] **Step 4: `ActivityTypeChips` (multi-select)**

```tsx
// frontend/src/features/users/components/ActivityTypeChips.tsx
import type { ActivityType } from '@/types/enums';
import { cn } from '@/lib/utils';
import { ACTIVITY_OPTIONS } from '../constants';

interface ActivityTypeChipsProps {
  value: ActivityType[];
  onChange: (next: ActivityType[]) => void;
  /** Cuando true es solo lectura (perfil). */
  readOnly?: boolean;
}

export function ActivityTypeChips({ value, onChange, readOnly = false }: ActivityTypeChipsProps) {
  const toggle = (a: ActivityType) => {
    if (readOnly) return;
    onChange(value.includes(a) ? value.filter((v) => v !== a) : [...value, a]);
  };

  if (readOnly && value.length === 0) {
    return <p className="text-sm text-gray-400">Sin intereses definidos.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIVITY_OPTIONS.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(opt.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              selected
                ? 'bg-brand-50 text-brand-600 border-brand-200'
                : 'bg-gray-50 text-gray-600 border-gray-200',
              readOnly && 'cursor-default',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

Run: `cd frontend && npx vitest run src/features/users/__tests__/UserAvatar.test.tsx && npx tsc --noEmit`
Expected: tests pasan, sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/users/components/UserAvatar.tsx \
        frontend/src/features/users/components/VerificationBadge.tsx \
        frontend/src/features/users/components/ActivityTypeChips.tsx \
        frontend/src/features/users/__tests__/UserAvatar.test.tsx
git commit -m "feat(users): componentes UserAvatar, VerificationBadge y ActivityTypeChips"
```

---

## Task 6: Componente AvatarUpload

**Files:**
- Create: `frontend/src/features/users/components/AvatarUpload.tsx`

- [ ] **Step 1: Implementar upload con preview (FileReader → dataURL, FormData → POST)**

```tsx
// frontend/src/features/users/components/AvatarUpload.tsx
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useMe, useUploadAvatar } from '../hooks';
import { UserAvatar } from './UserAvatar';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (validación de UI; el backend impone el suyo)
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function AvatarUpload() {
  const { data: me } = useMe();
  const upload = useUploadAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Genera dataURL para preview local; limpia al desmontar/cambiar.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      toast.error('Formato no válido. Usá PNG, JPEG o WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('La imagen pesa más de 5 MB.');
      return;
    }
    setFile(f);
  };

  const onSave = () => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        toast.success('Avatar actualizado');
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      },
      onError: () => toast.error('No se pudo subir el avatar. Intentá de nuevo.'),
    });
  };

  const onCancel = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (!me) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative group"
        aria-label="Cambiar avatar"
      >
        <UserAvatar url={preview ?? me.avatar_url} name={me.display_name} size="xl" />
        <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg group-active:scale-95 transition-transform">
          <Camera className="w-4 h-4" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={onSelect}
      />

      {file && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={upload.isPending} onClick={onSave}>
            Guardar avatar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={upload.isPending}>
            Cancelar
          </Button>
        </div>
      )}
      {upload.isPending && !file && (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/components/AvatarUpload.tsx
git commit -m "feat(users): componente AvatarUpload con preview y subida multipart"
```

---

## Task 7: ProfilePage (migración de ProfileView con datos reales)

**Files:**
- Create: `frontend/src/features/users/pages/ProfilePage.tsx`

- [ ] **Step 1: Migrar `ProfileView` (App.tsx 258-288) usando `useMe`**

```tsx
// frontend/src/features/users/pages/ProfilePage.tsx
import { Link } from 'react-router-dom';
import { Star, ShieldCheck, ChevronRight, Ban, Pencil, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMe } from '../hooks';
import { UserAvatar } from '../components/UserAvatar';
import { VerificationBadge } from '../components/VerificationBadge';
import { ActivityTypeChips } from '../components/ActivityTypeChips';
import { ACTIVITY_LABELS } from '../constants';

export default function ProfilePage() {
  const { data: me, isLoading, isError, error, refetch } = useMe();

  if (isLoading) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center pt-safe-top">
        <Spinner className="w-6 h-6 text-brand-600" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center pt-safe-top px-6">
        <ErrorState
          message="No pudimos cargar tu perfil."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      {/* Encabezado: avatar, nombre, reputación, verificación */}
      <div className="px-6 py-6 pb-8 border-b border-gray-100 flex flex-col items-center text-center">
        <UserAvatar url={me.avatar_url} name={me.display_name} size="xl" className="mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">{me.display_name}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          Reputación: {me.reputation_score.toFixed(1)}
        </p>
        <div className="mt-3">
          <VerificationBadge level={me.verification_level} />
        </div>
      </div>

      {/* Bio */}
      {me.bio && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Sobre mí
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{me.bio}</p>
        </div>
      )}

      {/* Intereses (de preferences.activity_types) */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Intereses
        </h2>
        <ActivityTypeChips
          value={me.preferences.activity_types}
          onChange={() => {}}
          readOnly
        />
      </div>

      {/* Navegación */}
      <div className="flex-1 px-6 py-6 flex flex-col gap-3">
        <NavLink to="/me/edit" icon={<Pencil className="w-5 h-5 text-gray-400" />} label="Editar perfil" />
        <NavLink to="/me/blocks" icon={<Ban className="w-5 h-5 text-gray-400" />} label="Usuarios bloqueados" />
        {/* /me/trusted-contacts se implementa en F6; se enlaza como teaser */}
        <NavLink to="/me/trusted-contacts" icon={<Users className="w-5 h-5 text-gray-400" />} label="Contactos de confianza" />
      </div>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </Link>
  );
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/pages/ProfilePage.tsx
git commit -m "feat(users): ProfilePage migrado del mockup con datos reales (GET /me)"
```

---

## Task 8: ProfileForm (PATCH /me)

**Files:**
- Create: `frontend/src/features/users/components/ProfileForm.tsx`

- [ ] **Step 1: Formulario react-hook-form + zod, valores por defecto desde `useMe`**

```tsx
// frontend/src/features/users/components/ProfileForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useMe, useUpdateMe } from '../hooks';
import { userUpdateSchema, type UserUpdateFormValues } from '../schemas';
import { GENDER_OPTIONS } from '../constants';

export function ProfileForm() {
  const { data: me } = useMe();
  const update = useUpdateMe();

  const form = useForm<UserUpdateFormValues>({
    resolver: zodResolver(userUpdateSchema),
    // `values` re-sincroniza cuando `me` carga o cambia externamente.
    values: me
      ? {
          display_name: me.display_name,
          bio: me.bio ?? '',
          birth_date: me.birth_date ?? '',
          gender: me.gender,
          locale: me.locale ?? '',
          timezone: me.timezone ?? '',
        }
      : undefined,
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = (values: UserUpdateFormValues) => {
    const patch = {
      display_name: values.display_name,
      bio: values.bio ? values.bio : null,
      birth_date: values.birth_date ? values.birth_date : null,
      gender: values.gender ?? null,
      locale: values.locale ? values.locale : null,
      timezone: values.timezone ? values.timezone : null,
    };
    update.mutate(patch, {
      onSuccess: () => toast.success('Perfil actualizado'),
      onError: () => toast.error('No se pudo guardar. Intentá de nuevo.'),
    });
  };

  if (!me) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        id="display_name"
        label="Nombre visible"
        error={errors.display_name?.message}
        placeholder="¿Cómo te llaman?"
        {...register('display_name')}
      />

      <Textarea
        id="bio"
        label="Bio"
        error={errors.bio?.message}
        rows={4}
        maxLength={500}
        placeholder="Contá algo sobre vos (máx. 500 caracteres)"
        {...register('bio')}
      />

      <Input
        id="birth_date"
        type="date"
        label="Fecha de nacimiento"
        error={errors.birth_date?.message}
        {...register('birth_date')}
      />

      <Select id="gender" label="Género" error={errors.gender?.message} {...register('gender')}>
        {GENDER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <Input
        id="locale"
        label="Idioma (opcional)"
        placeholder="ej. es-AR"
        error={errors.locale?.message}
        {...register('locale')}
      />

      <Input
        id="timezone"
        label="Zona horaria (opcional)"
        placeholder="ej. America/Argentina/Buenos_Aires"
        error={errors.timezone?.message}
        {...register('timezone')}
      />

      <Button type="submit" variant="primary" loading={update.isPending || isSubmitting}>
        Guardar cambios
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/components/ProfileForm.tsx
git commit -m "feat(users): ProfileForm con react-hook-form + zod (PATCH /me)"
```

---

## Task 9: PreferencesForm (PUT /me/preferences)

**Files:**
- Create: `frontend/src/features/users/components/PreferencesForm.tsx`

- [ ] **Step 1: Formulario de preferencias — chips, selects, range, toggles**

```tsx
// frontend/src/features/users/components/PreferencesForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useMe, useUpdatePreferences } from '../hooks';
import { preferencesSchema, type PreferencesFormValues } from '../schemas';
import { ActivityTypeChips } from './ActivityTypeChips';
import {
  GROUP_SIZE_OPTIONS,
  GENDER_PREFERENCE_OPTIONS,
  RADIUS_OPTIONS,
} from '../constants';
import type { ActivityType } from '@/types/enums';

export function PreferencesForm() {
  const { data: me } = useMe();
  const updatePrefs = useUpdatePreferences();

  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    values: me
      ? {
          default_search_radius_m: me.preferences.default_search_radius_m,
          activity_types: me.preferences.activity_types,
          group_size_preference: me.preferences.group_size_preference,
          age_range_min: me.preferences.age_range_min,
          age_range_max: me.preferences.age_range_max,
          gender_preference: me.preferences.gender_preference,
          notify_new_plans: me.preferences.notify_new_plans,
          notify_messages: me.preferences.notify_messages,
          notify_pending_alerts: me.preferences.notify_pending_alerts,
        }
      : undefined,
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const selectedActivities = watch('activity_types');

  const onToggleActivity = (next: ActivityType[]) => setValue('activity_types', next, { shouldDirty: true });

  const onSubmit = (values: PreferencesFormValues) => {
    updatePrefs.mutate(values, {
      onSuccess: () => toast.success('Preferencias guardadas'),
      onError: () => toast.error('No se pudieron guardar las preferencias.'),
    });
  };

  if (!me) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Radio de búsqueda
        </label>
        <Select
          id="default_search_radius_m"
          error={errors.default_search_radius_m?.message}
          {...register('default_search_radius_m', { valueAsNumber: true })}
        >
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Intereses
        </label>
        <ActivityTypeChips value={selectedActivities ?? []} onChange={onToggleActivity} />
        {errors.activity_types && (
          <p className="text-xs text-red-500 mt-1">{errors.activity_types.message}</p>
        )}
      </div>

      <Select
        id="group_size_preference"
        label="Tamaño de grupo"
        error={errors.group_size_preference?.message}
        {...register('group_size_preference')}
      >
        {GROUP_SIZE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="age_range_min"
          type="number"
          label="Edad mín."
          min={18}
          max={99}
          error={errors.age_range_min?.message}
          {...register('age_range_min', { valueAsNumber: true })}
        />
        <Input
          id="age_range_max"
          type="number"
          label="Edad máx."
          min={18}
          max={99}
          error={errors.age_range_max?.message}
          {...register('age_range_max', { valueAsNumber: true })}
        />
      </div>

      <Select
        id="gender_preference"
        label="Preferencia de género"
        error={errors.gender_preference?.message}
        {...register('gender_preference')}
      >
        {GENDER_PREFERENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Notificaciones
        </legend>
        <Toggle
          label="Nuevos planes cercanos"
          {...register('notify_new_plans')}
          defaultChecked={me.preferences.notify_new_plans}
        />
        <Toggle
          label="Mensajes"
          {...register('notify_messages')}
          defaultChecked={me.preferences.notify_messages}
        />
        <Toggle
          label="Alertas pendientes"
          {...register('notify_pending_alerts')}
          defaultChecked={me.preferences.notify_pending_alerts}
        />
      </fieldset>

      <Button type="submit" variant="primary" loading={updatePrefs.isPending}>
        Guardar preferencias
      </Button>
    </form>
  );
}

function Toggle({
  label,
  defaultChecked,
  ...rest
}: { label: string; defaultChecked?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="w-11 h-6 appearance-none rounded-full bg-gray-200 checked:bg-brand-600 relative transition-colors before:absolute before:content-[''] before:w-5 before:h-5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5 cursor-pointer"
        {...rest}
      />
    </label>
  );
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/components/PreferencesForm.tsx
git commit -m "feat(users): PreferencesForm con chips, selects y toggles (PUT /me/preferences)"
```

---

## Task 10: EditProfilePage (composición + DangerZone soft-delete)

**Files:**
- Create: `frontend/src/features/users/pages/EditProfilePage.tsx`

- [ ] **Step 1: Componer avatar + ProfileForm + PreferencesForm + DangerZone**

```tsx
// frontend/src/features/users/pages/EditProfilePage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/auth/useAuth';
import { useDeleteMe } from '../hooks';
import { AvatarUpload } from '../components/AvatarUpload';
import { ProfileForm } from '../components/ProfileForm';
import { PreferencesForm } from '../components/PreferencesForm';
import { SectionCard } from './_SectionCard';

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const deleteMe = useDeleteMe();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirmDelete = () => {
    deleteMe.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Cuenta eliminada');
        await logout();
        navigate('/register', { replace: true });
      },
      onError: () => {
        toast.error('No se pudo eliminar la cuenta. Intentá de nuevo.');
        setConfirmOpen(false);
      },
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <Link
          to="/me"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Editar perfil</h1>
      </div>

      <div className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-md mx-auto w-full">
        <SectionCard title="Avatar">
          <AvatarUpload />
        </SectionCard>

        <SectionCard title="Datos personales">
          <ProfileForm />
        </SectionCard>

        <SectionCard title="Preferencias">
          <PreferencesForm />
        </SectionCard>

        {/* Zona de peligro */}
        <SectionCard title="Zona de peligro" tone="danger">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Borramos tu cuenta de forma permanente (soft-delete). Esta acción no se puede deshacer.
            </p>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" /> Eliminar mi cuenta
            </Button>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Eliminar tu cuenta?"
        description="Se cerrará tu sesión y no podrás volver a entrar con este email. Esta acción es definitiva."
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        destructive
        loading={deleteMe.isPending}
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Helper `SectionCard`**

```tsx
// frontend/src/features/users/pages/_SectionCard.tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

export function SectionCard({ title, tone = 'default', children }: SectionCardProps) {
  return (
    <section
      className={cn(
        'p-4 rounded-2xl border',
        tone === 'danger' ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white shadow-sm',
      )}
    >
      <h2
        className={cn(
          'text-xs font-semibold uppercase tracking-wider mb-3',
          tone === 'danger' ? 'text-red-600' : 'text-gray-500',
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/users/pages/EditProfilePage.tsx \
        frontend/src/features/users/pages/_SectionCard.tsx
git commit -m "feat(users): EditProfilePage con avatar, datos, preferencias y baja de cuenta"
```

---

## Task 11: BlockedUsersPage (GET /me/blocks + DELETE)

**Files:**
- Create: `frontend/src/features/users/pages/BlockedUsersPage.tsx`

- [ ] **Step 1: Listar bloqueos con desbloqueo**

```tsx
// frontend/src/features/users/pages/BlockedUsersPage.tsx
import { Link } from 'react-router-dom';
import { ArrowLeft, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useBlocks, useUnblock } from '../hooks';

export default function BlockedUsersPage() {
  const { data: blocks, isLoading, isError, error, refetch } = useBlocks();
  const unblock = useUnblock();

  const onUnblock = (userId: string) => {
    unblock.mutate(userId, {
      onSuccess: () => toast.success('Usuario desbloqueado'),
      onError: () => toast.error('No se pudo desbloquear.'),
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <Link
          to="/me"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Usuarios bloqueados</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner className="w-6 h-6 text-brand-600" />
          </div>
        )}

        {isError && <ErrorState message="No pudimos cargar tus bloqueos." onRetry={() => refetch()} />}

        {!isLoading && !isError && (blocks?.length ?? 0) === 0 && (
          <EmptyState
            icon={<Ban className="w-8 h-8 text-gray-300" />}
            title="No tenés usuarios bloqueados"
            description="Cuando bloquees a alguien, aparecerá acá."
          />
        )}

        {!isLoading && !isError && (blocks?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-3">
            {blocks!.map((b) => (
              <li
                key={b.blocked_id}
                className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm flex items-center justify-between gap-3"
              >
                <Link to={`/users/${b.blocked_id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">Usuario {b.blocked_id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">
                    Bloqueado el {new Date(b.created_at).toLocaleDateString('es-AR')}
                  </p>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={unblock.isPending && unblock.variables === b.blocked_id}
                  onClick={() => onUnblock(b.blocked_id)}
                >
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

> Nota: `BlockOut` sólo contiene `blocked_id` y `created_at`; no incluye `display_name`. Para mostrar un nombre legible, la UI puede enlazar al perfil público (`/users/{blocked_id}`). Si F2 dispone de un endpoint de bloqueos con datos de usuario en el futuro, sustituir el label. No inventar datos.

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/pages/BlockedUsersPage.tsx
git commit -m "feat(users): BlockedUsersPage con lista y desbloqueo (GET/DELETE /me/blocks)"
```

---

## Task 12: UserPublicPage (GET /users/{id} + block)

**Files:**
- Create: `frontend/src/features/users/pages/UserPublicPage.tsx`

- [ ] **Step 1: Perfil público con bloquear**

```tsx
// frontend/src/features/users/pages/UserPublicPage.tsx
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Ban, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { useUser, useBlock } from '../hooks';
import { UserAvatar } from '../components/UserAvatar';
import { VerificationBadge } from '../components/VerificationBadge';

export default function UserPublicPage() {
  const { userId = '' } = useParams();
  const { data: user, isLoading, isError, error, refetch } = useUser(userId);
  const block = useBlock();

  const onBlock = () => {
    block.mutate(userId, {
      onSuccess: () => toast.success('Usuario bloqueado'),
      onError: () => toast.error('No se pudo bloquear.'),
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <Link
          to={-1 as unknown as string}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Perfil</h1>
      </div>

      <div className="flex-1 px-6 py-6 flex flex-col items-center text-center">
        {isLoading && <Spinner className="w-6 h-6 text-brand-600" />}
        {isError && (
          <ErrorState message="No pudimos cargar este perfil." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && user && (
          <>
            <UserAvatar url={user.avatar_url} name={user.display_name} size="xl" className="mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">{user.display_name}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              Reputación: {user.reputation_score.toFixed(1)}
            </p>
            <div className="mt-3 mb-4">
              <VerificationBadge level={user.verification_level} />
            </div>

            {user.bio && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-w-sm">
                {user.bio}
              </p>
            )}

            {/* Reportes se implementan en F6; se enlaza al flujo futuro */}
            <div className="flex flex-col gap-2 w-full max-w-xs mt-8">
              <Button
                variant="secondary"
                onClick={onBlock}
                loading={block.isPending}
                disabled={block.isPending}
              >
                <Ban className="w-4 h-4" /> Bloquear usuario
              </Button>
              {/* /users/:userId/report — F6; ruta futura */}
              <Link
                to={`/users/${userId}/report`}
                className="inline-flex items-center justify-center gap-2 text-sm text-gray-500 py-2"
              >
                <Flag className="w-4 h-4" /> Reportar (próximamente)
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

> `Link to={-1}` para volver atrás puede requerir usar `useNavigate()(-1)` según la versión de react-router-dom v7. Si `tsc` o el runtime rechazan el valor numérico, reemplazar por `const navigate = useNavigate(); ... onClick={() => navigate(-1)}` con un `<button>`.

- [ ] **Step 2: Verificar tipo**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/users/pages/UserPublicPage.tsx
git commit -m "feat(users): UserPublicPage con perfil público y bloqueo (GET /users/{id}, POST /block)"
```

---

## Task 13: Integrar rutas en el router

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Añadir imports y rutas hijas bajo el layout protegido**

Localizar el layout protegido de `RequireAuth` en `router.tsx` (definido en F0) y añadir las rutas de F2 como hijas. Importar las páginas con lazy loading (coherente con F7) o directo — aquí directo para simplicidad:

```tsx
// En el bloque de imports de router.tsx
import ProfilePage from '@/features/users/pages/ProfilePage';
import EditProfilePage from '@/features/users/pages/EditProfilePage';
import BlockedUsersPage from '@/features/users/pages/BlockedUsersPage';
import UserPublicPage from '@/features/users/pages/UserPublicPage';
```

Y dentro del `children` del elemento envuelto por `<RequireAuth>`:

```tsx
{ path: 'me', element: <ProfilePage /> },
{ path: 'me/edit', element: <EditProfilePage /> },
{ path: 'me/blocks', element: <BlockedUsersPage /> },
{ path: 'users/:userId', element: <UserPublicPage /> },
```

- [ ] **Step 2: Verificar tipo y build**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run build
```
Expected: build exitoso, sin errores de tipo ni de resolución de rutas.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "feat(router): rutas de perfil /me, /me/edit, /me/blocks y /users/:userId"
```

---

## Task 14: Suite de tests completa y verificación final

**Files:**
- Ninguno nuevo (verificación).

- [ ] **Step 1: Correr todos los tests de la feature**

Run: `cd frontend && npx vitest run src/features/users`
Expected: verde (schemas, hooks, UserAvatar).

- [ ] **Step 2: Cobertura rápida de la feature**

Run: `cd frontend && npx vitest run src/features/users --coverage`
Expected: archivos de `features/users` con cobertura razonable en `hooks.ts`, `schemas.ts`, `UserAvatar.tsx`. Sin umbral estricto (F7 fija umbrales), pero las tres vías (tipos → schemas → hooks → componentes → páginas) deben estar cubiertas por tests unitarios/integración.

- [ ] **Step 3: Lint + build final**

Run:
```bash
cd frontend && npm run lint && npm run build
```
Expected: `tsc --noEmit` y `vite build` exitosos.

- [ ] **Step 4: Smoke manual (opcional, con backend levantado)**

Run:
```bash
cd frontend && npm run dev
# Backend: docker compose up (o uvicorn)
```
Flujo a verificar:
1. Login → redirige a `/explore`.
2. Tab **Perfil** → carga `/me` (avatar inicial, nombre, reputación, intereses, badge).
3. **Editar perfil** → cambiar display_name → guarda → vuelve al perfil con el nuevo nombre.
4. Subir avatar (PNG < 5MB) → preview → Guardar → avatar persiste tras recargar.
5. **Preferencias** → cambiar radio, toggles, chips → Guardar → recargar verifica persistencia.
6. **Eliminar cuenta** → confirmar → logout + redirect `/register`.
7. (Con segunda cuenta) abrir `/users/{otroId}` → Bloquear → aparece en `/me/blocks` → Desbloquear desaparece.

- [ ] **Step 5: Commit final del estado verde (si hubo ajustes)**

```bash
git add -A
git commit -m "test(users): verificar suite de perfil completa y build verde"
```

---

## Notas de diseño y decisiones

- **`useMe` canónico sobre `GET /me`**: F0/F1 usan `GET /auth/me` (mínimo, bootstrap). F2 introduce `useMe` (`GET /me`) como fuente completa del perfil. No duplicar: el `AuthProvider` sigue usando `GET /auth/me` para el guard de sesión; `useMe` para todo lo de perfil.
- **Caché**: `['me']` es la clave jerárquica central. Toda mutación del dominio (`PATCH /me`, avatar, preferences) la actualiza (`setQueryData`) o invalida. `['me','blocks']` es independiente.
- **Avatar**: preview local vía `FileReader.readAsDataURL` (sin red); envío vía `FormData` con campo `file` (requerido por `POST /me/avatar`). Validación de UI de tipo/tamaño; el backend impone su propio límite.
- **Preferences**: `PUT /me/preferences` devuelve `PreferencesOut`; como las preferencias viven embebidas en `UserDetail`, tras el PUT se invalida `['me']` para refrescarlas (no se mantienen dos fuentes).
- **Soft-delete**: `DELETE /me` → 204 → `qc.clear()` + `logout()` (revoca access en F1) + `navigate('/register', { replace: true })`.
- **Bloqueos**: `BlockOut` sólo trae `blocked_id`/`created_at`; no se inventan nombres. Se enlaza al perfil público para ver quién es.
- **Reportes (F6)**: se enlaza como teaser (`/users/:id/report`) pero la página real la construye F6. Lo mismo para `/me/trusted-contacts`.
- **i18n**: toda la UI en es-AR, fechas con `toLocaleDateString('es-AR')`.
- **Consistencia F0/F1**: se reusan `api/client`, `useAuth`, `ConfirmDialog`, design system (`Button`, `Input`, `Textarea`, `Select`, `Spinner`, `ErrorState`, `EmptyState`, `Badge`). Sin estado global nuevo.

## Dependencias y siguiente fase

- **Depende de**: F0 (Fundaciones) y F1 (Auth). Si `apiPut`/multipart no existen, ejecutar Task 0.
- **Habilita a**: F3 (Planes) reutiliza `useMe` (preferencias de radio y `activity_types` para filtros por defecto de `ExplorePage`) y `UserAvatar`/`VerificationBadge` (en `PlanCard` host).
