# Auth Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el flujo de autenticación completo contra el backend (login, registro, refresh, logout, forgot/reset password, change-password, OAuth Google) con validación zod, manejo de rate limits y redirección post-login.

**Architecture:** Se reutilizan los cimientos de F0 (tokenStore, api/client con interceptor 401→refresh, AuthProvider que mantiene el `user`/`status` en contexto, guards RequireAuth/RequireAdmin, design system). F1 añade: (1) una extensión mínima de `ApiError`/`client.ts` para exponer el header `Retry-After` en los 429; (2) schemas zod + tipos derivados para todos los formularios; (3) hooks de mutación (`usePasswordResetRequest`, `usePasswordResetConfirm`, `useChangePassword`) y un hook `useRateLimit` de countdown; (4) un `AuthProvider` extendido que añade `changePassword` e `loginWithGoogle` e invalida la query `['me']` tras login/register/refresh; (5) cinco páginas de formulario (`LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ChangePasswordPage`) con react-hook-form + zod; (6) OAuth Google condicional a `VITE_OAUTH_GOOGLE_CLIENT_ID` vía `@react-oauth/google`; (7) rutas públicas y protegidas cableadas en `router.tsx`.

**Tech Stack:** React 19, TypeScript 5.8, react-router-dom v7, TanStack Query v5, react-hook-form v7, zod v3, @hookform/resolvers v3, @react-oauth/google, sonner, lucide-react, Tailwind v4. Testing: Vitest, @testing-library/react, jsdom.

---

## Supuestos y contrato (fuente de verdad)

Todo se deriva de `docs/API_CONTRACT.md` §Auth y del spec `docs/superpowers/specs/2026-07-09-frontend-backend-adaptation-design.md` §3.

- **POST /auth/login** (LoginIn `{email, password}`) → 200 `TokenOut`; errores `401 invalid_credentials`; rate-limit **5/min**.
- **POST /auth/register** (RegisterIn `{email, password 8..128, display_name 1..100}`) → 201 `TokenOut`; errores `409 email_already_exists`; rate-limit **5/min**.
- **POST /auth/oauth/google** (`{refresh_token: <google_auth_code>}`) → 200 `TokenOut`; errores `400 oauth_error`; rate-limit **5/min**.
- **POST /auth/refresh** (`{refresh_token}`) → 200 `TokenOut`; errores `401 invalid_token`; rate-limit **30/min**. (Ya implementado por el interceptor/AuthProvider de F0.)
- **POST /auth/logout** (`{access_token}`) → 200 `{message}`. (Ya implementado por `AuthProvider.logout` de F0.)
- **POST /auth/change-password** (`{old_password, new_password 8..128}`) → 200 `{message}`; errores `401 invalid_credentials`. **⚠️ Invalida TODOS los access tokens previos → el frontend debe limpiar tokens y forzar re-login (sin llamar a `/auth/logout`, porque el access actual quedó revocado).**
- **POST /auth/password-reset/request** (`{email}`) → **siempre 202** `{message}` (no filtra si el email existe); rate-limit **3/min**.
- **POST /auth/password-reset/confirm** (`{token, new_password 8..128}`) → 200 `{message}`; errores `401 invalid_token`.
- **GET /auth/me** → 200 `UserPublic` `{id, email, display_name, verification_level, reputation_score}`.

`TokenOut`: `{access_token, refresh_token, token_type: 'bearer', expires_in, user_id}`.

### Firmas de F0 que se REUTILIZAN (no recrear)

- `src/auth/tokenStore.ts`: `getAccessToken()`, `setTokens(access, refresh)`, `getRefreshToken()`, `clearTokens()`, `__resetTokenStoreForTests()`.
- `src/api/client.ts`: `apiGet<T>(path, options?)`, `apiPost<T>(path, body?, options?)`, `apiPatch`, `apiDelete`, `apiPut`, `apiRequest`. `RequestOptions = {body?, query?, headers?, publicEndpoint?, ...RequestInit}`. `apiPost` manda JSON por defecto y marca endpoints públicos vía el `Set` interno `/auth/login|register|refresh|password-reset/request|password-reset/confirm|oauth/google`.
- `src/api/errors.ts`: `class ApiError(code, status, detail)` con props `code`, `status`, `detail`, `message`; `mapErrorMessage(code, fallback?)`.
- `src/auth/AuthProvider.tsx`: contexto `{user: UserPublic|null, status: 'loading'|'authenticated'|'unauthenticated', login(email,password), register(email,password,displayName), logout(), refresh()}`.
- `src/auth/useAuth.ts`: `useAuth()` lanza si no hay provider; reexporta `AuthProvider`, `AuthContextValue`, `AuthStatus`.
- `src/auth/RequireAuth.tsx` / `RequireAdmin.tsx`: guards con `<Outlet/>`.
- `src/components/ui/`: `Button` (props `variant`, `size`, `loading`, `fullWidth`, `forwardRef`), `Input` (`invalid`, `forwardRef`), `Textarea`, `Spinner`, `EmptyState`, `Avatar`, `Badge`, `Modal`, `BottomSheet`, `ErrorState`.
- `src/test/test-utils.tsx`: `renderWithProviders(ui, {initialEntries?})` (QueryClient fresco + AuthProvider real + MemoryRouter).
- `src/types/common.ts`: `UserPublic`, `OKMessage`, `ErrorOut`, etc.
- `src/lib/utils.ts`: `cn()`.

---

## File Structure

**Crear:**
- `frontend/src/auth/schemas.ts` — schemas zod (`loginSchema`, `registerSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`) + tipos derivados.
- `frontend/src/auth/useRateLimit.ts` — hook de countdown para UX de rate limit (429 + Retry-After).
- `frontend/src/auth/hooks.ts` — mutaciones React Query: `usePasswordResetRequest`, `usePasswordResetConfirm`, `useChangePassword`, `useRequestPasswordReset`.
- `frontend/src/auth/components/AuthLayout.tsx` — layout compartido (header con logo, panel glass, fondo) para las 5 páginas.
- `frontend/src/auth/components/GoogleButton.tsx` — botón "Continuar con Google" usando `@react-oauth/google` (flow auth-code).
- `frontend/src/auth/pages/LoginPage.tsx` — login + OAuth + rate limit.
- `frontend/src/auth/pages/RegisterPage.tsx` — registro + OAuth + rate limit.
- `frontend/src/auth/pages/ForgotPasswordPage.tsx` — solicitar reset (siempre 202).
- `frontend/src/auth/pages/ResetPasswordPage.tsx` — confirmar reset (lee `?token=`).
- `frontend/src/auth/pages/ChangePasswordPage.tsx` — cambiar contraseña → forzar re-login.
- `frontend/src/auth/__tests__/schemas.test.ts` — tests de validación zod (TDD).
- `frontend/src/auth/__tests__/useRateLimit.test.ts` — test del countdown.
- `frontend/src/auth/__tests__/hooks.test.tsx` — tests de integración de hooks (mocks del api client).
- `frontend/src/auth/__tests__/pages.test.tsx` — tests de componentes de formulario (mocks del api client + useAuth).

**Modificar:**
- `frontend/src/api/errors.ts` — añadir `retryAfter?: number` a `ApiError`.
- `frontend/src/api/client.ts` — `parseError` lee el header `Retry-After` y lo pasa a `ApiError`.
- `frontend/src/api/__tests__/errors.test.ts` — añadir asertos de `retryAfter`.
- `frontend/src/auth/AuthProvider.tsx` — añadir `changePassword(old,new)` e `loginWithGoogle(authCode)` al contexto; invalidar `['me']` tras login/register/refresh.
- `frontend/src/auth/useAuth.ts` — reexportar los nuevos campos del contexto (sin cambio de firma pública, solo tipo).
- `frontend/src/test/test-utils.tsx` — añadir opción `authValue` para inyectar un contexto de auth mockeado en tests de páginas.
- `frontend/src/main.tsx` — envolver con `GoogleOAuthProvider` solo si `VITE_OAUTH_GOOGLE_CLIENT_ID` está configurado.
- `frontend/src/router.tsx` — registrar rutas `/login`, `/register`, `/forgot-password`, `/reset-password` (públicas) y `/me/password` (protegida) con las páginas reales.
- `frontend/package.json` — instalar `@react-oauth/google`.

**Eliminar:**
- `frontend/src/pages/LoginStub.tsx`, `RegisterStub.tsx` — reemplazados por las páginas reales (Task 14 limpia sus imports). `ExploreStub` y `PublicShareStub` se conservan (son de fases posteriores).

---

## Task 1: Rama de trabajo y verificación del punto de partida

**Files:** —

- [ ] **Step 1: Crear rama `fase-1-auth-frontend` desde el final de F0**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git checkout -b fase-1-auth-frontend
```
Expected: `Switched to a new branch 'fase-1-auth-frontend'`. (Asume que F0 ya se mergeó/commiteó; si F0 está en su propia rama, partir de ahí.)

- [ ] **Step 2: Verificar que F0 está completo (build + tests verdes)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run lint && npm run build && npm test
```
Expected: `tsc --noEmit` sin errores, build OK, todos los tests de F0 pasan (`errors`, `geo`, `format`, `App` smoke). Si algo falla, F0 no terminó: parar y completar F0 primero.

- [ ] **Step 3: Confirmar las firmas de F0 que vamos a usar**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
grep -n "export function\|export const\|export class\|export type\|export interface" src/auth/tokenStore.ts src/auth/AuthProvider.tsx src/api/client.ts src/api/errors.ts | head -60
```
Expected: ver `getAccessToken`, `setTokens`, `getRefreshToken`, `clearTokens` en tokenStore; `apiGet/apiPost/...`, `setApplyAuth` en client; `ApiError`, `mapErrorMessage` en errors; `login/register/logout/refresh` en AuthProvider. Confirmar antes de continuar.

---

## Task 2: Extender `ApiError` con `retryAfter` (Retry-After header de 429)

El `ApiError` de F0 no captura el header `Retry-After` que el backend envía en los 429. Lo añadimos para que el UX de rate limit tenga el número de segundos.

**Files:**
- Modify: `frontend/src/api/errors.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/__tests__/errors.test.ts`

- [ ] **Step 1: Añadir test que falla — `retryAfter` en ApiError y en parseError**

Editar `frontend/src/api/__tests__/errors.test.ts`. Añadir al final del `describe('ApiError', ...)` un nuevo test, y un nuevo `describe('retryAfter')`:

```typescript
  it('acepta retryAfter opcional para 429', () => {
    const err = new ApiError('rate_limit_exceeded', 429, 'Demasiados intentos', 42);
    expect(err.retryAfter).toBe(42);
  });

  it('retryAfter es undefined por defecto', () => {
    const err = new ApiError('invalid_credentials', 401, 'x');
    expect(err.retryAfter).toBeUndefined();
  });
});

describe('retryAfter', () => {
  it('ApiError expone retryAfter cuando se construye con él', () => {
    const err = new ApiError('rate_limit_exceeded', 429, 'limite', 30);
    expect(err.retryAfter).toBe(30);
  });
});
```

Nota: el cierre `})` tras `acepta retryAfter` cierra el `describe('ApiError')` existente; pegar con cuidado de no duplicar. Reemplazar el último test de `ApiError` y añadir el bloque `retryAfter` después. Si es más claro, sustituir el bloque completo desde `describe('ApiError', () => {` hasta su cierre por:

```typescript
describe('ApiError', () => {
  it('construye con code, status y detail', () => {
    const err = new ApiError('invalid_credentials', 401, 'Credenciales incorrectas');
    expect(err.code).toBe('invalid_credentials');
    expect(err.status).toBe(401);
    expect(err.detail).toBe('Credenciales incorrectas');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('acepta code null', () => {
    const err = new ApiError(null, 500, 'Algo falló');
    expect(err.code).toBeNull();
    expect(err.status).toBe(500);
  });

  it('expone message = detail', () => {
    const err = new ApiError('not_found', 404, 'No existe');
    expect(err.message).toBe('No existe');
  });

  it('acepta retryAfter opcional para 429', () => {
    const err = new ApiError('rate_limit_exceeded', 429, 'Demasiados intentos', 42);
    expect(err.retryAfter).toBe(42);
  });

  it('retryAfter es undefined por defecto', () => {
    const err = new ApiError('invalid_credentials', 401, 'x');
    expect(err.retryAfter).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/errors.test.ts
```
Expected: FAIL — `Expected: 42 Received: undefined` (la clase no tiene `retryAfter`) o error de tipos (`Expected 3-4 arguments, but got 4`).

- [ ] **Step 3: Implementar `retryAfter` en `errors.ts`**

En `frontend/src/api/errors.ts`, sustituir la declaración de la clase y su docblock por:

```typescript
/** Error de dominio del backend. `code` es null si la respuesta no era GADError.
 *  `retryAfter` (segundos) se setea cuando llega un 429 con header `Retry-After`. */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;
  readonly detail: string;
  readonly retryAfter?: number;

  constructor(code: string | null, status: number, detail: string, retryAfter?: number) {
    super(detail);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}
```

- [ ] **Step 4: Leer `Retry-After` en `client.ts::parseError`**

En `frontend/src/api/client.ts`, sustituir la función `parseError` completa por:

```typescript
async function parseError(res: Response): Promise<ApiError> {
  let detail = `Error ${res.status}`;
  let code: string | null = null;
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object') {
      const obj = data as Partial<ErrorOut> & { detail?: unknown };
      if (typeof obj.detail === 'string') {
        detail = obj.detail;
      } else if (Array.isArray(obj.detail)) {
        // Error de validación de FastAPI (422): tomamos el primer mensaje.
        const first = obj.detail[0];
        detail =
          first && typeof first === 'object' && 'msg' in first
            ? String((first as { msg: unknown }).msg)
            : 'Datos inválidos';
        code = 'validation_error';
      }
      if (typeof obj.code === 'string') {
        code = obj.code;
      }
    }
  } catch {
    // Respuesta sin body JSON: dejamos el detail por defecto.
  }

  // Rate limit: el backend envía Retry-After en segundos.
  let retryAfter: number | undefined;
  const retryAfterHeader = res.headers.get('Retry-After');
  if (retryAfterHeader) {
    const parsed = Number(retryAfterHeader);
    if (Number.isFinite(parsed) && parsed > 0) {
      retryAfter = parsed;
    }
  }

  return new ApiError(code, res.status, detail, retryAfter);
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/errors.test.ts
```
Expected: `Test Files 1 passed`, `Tests 17 passed` (los 15 originales + 2 nuevos).

- [ ] **Step 6: Verificar tsc global**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores (el 4º arg opcional no rompe los `new ApiError(...)` existentes de 3 args).

- [ ] **Step 7: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/api/errors.ts frontend/src/api/client.ts frontend/src/api/__tests__/errors.test.ts
git commit -m "feat(api): exponer Retry-After en ApiError para UX de rate limit"
```

---

## Task 3: TDD — Schemas zod de auth (`auth/schemas.ts`)

**Files:**
- Create: `frontend/src/auth/__tests__/schemas.test.ts`
- Create: `frontend/src/auth/schemas.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/auth/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas';

describe('loginSchema', () => {
  it('acepta email + password no vacío', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '1234' });
    expect(r.success).toBe(true);
  });

  it('rechaza email inválido', () => {
    const r = loginSchema.safeParse({ email: 'no-email', password: '1234' });
    expect(r.success).toBe(false);
  });

  it('rechaza password vacío', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('acepta datos válidos', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza password menor a 8', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: '1234567',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza password mayor a 128', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: 'a'.repeat(129),
    });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name vacío', () => {
    const r = registerSchema.safeParse({
      display_name: '',
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name mayor a 100', () => {
    const r = registerSchema.safeParse({
      display_name: 'x'.repeat(101),
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza email inválido', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'mal',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('acepta email válido', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'a@b.com' });
    expect(r.success).toBe(true);
  });
  it('rechaza email inválido', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'x' });
    expect(r.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('acepta token + new_password válidos + confirmación igual', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: 'nuevaClave123',
      confirm_password: 'nuevaClave123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza si confirm no coincide', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: 'nuevaClave123',
      confirm_password: 'otra',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza new_password < 8', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: '1234567',
      confirm_password: '1234567',
    });
    expect(r.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('acepta old distinto de new con confirmación igual', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'viejaClave123',
      new_password: 'nuevaClave123',
      confirm_password: 'nuevaClave123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza si new == old', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'mismaClave123',
      new_password: 'mismaClave123',
      confirm_password: 'mismaClave123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza si confirm no coincide', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'viejaClave123',
      new_password: 'nuevaClave123',
      confirm_password: 'distinta12345',
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/schemas.test.ts
```
Expected: FAIL — `Failed to resolve import "../schemas"`.

- [ ] **Step 3: Implementar `auth/schemas.ts`**

Crear `frontend/src/auth/schemas.ts`:

```typescript
import { z } from 'zod';

/**
 * Regla de contraseña del backend: 8..128 caracteres.
 * Reutilizada en registro, reseteo y cambio de contraseña.
 */
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede tener más de 128 caracteres');

/** Login: solo requiere email válido + password no vacío (longitud la valida el backend). */
export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

/** Registro: email + password 8..128 + display_name 1..100. */
export const registerSchema = z.object({
  display_name: z
    .string()
    .min(1, 'Ingresá tu nombre')
    .max(100, 'El nombre no puede tener más de 100 caracteres'),
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
  password: passwordSchema,
});

/** Solicitar reseteo: solo email. */
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
});

/** Confirmar reseteo: el token llega por query param (?token=); el form pide new + confirm. */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Falta el token de reseteo'),
    new_password: passwordSchema,
    confirm_password: passwordSchema,
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  });

/** Cambio de contraseña: new debe diferir de old y coincidir con confirm. */
export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Ingresá tu contraseña actual'),
    new_password: passwordSchema,
    confirm_password: passwordSchema,
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  })
  .refine((data) => data.old_password !== data.new_password, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['new_password'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/schemas.test.ts
```
Expected: `Test Files 1 passed`, `Tests 15 passed`.

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
git add frontend/src/auth/schemas.ts frontend/src/auth/__tests__/schemas.test.ts
git commit -m "feat(auth): schemas zod de login/registro/reset/cambio de contraseña (TDD)"
```

---

## Task 4: Hook `useRateLimit` (countdown para 429)

**Files:**
- Create: `frontend/src/auth/__tests__/useRateLimit.test.ts`
- Create: `frontend/src/auth/useRateLimit.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/auth/__tests__/useRateLimit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimit } from '../useRateLimit';

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca en 0 (no bloqueado)', () => {
    const { result } = renderHook(() => useRateLimit());
    expect(result.current.seconds).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('start(seconds) bloquea y decrementa cada segundo', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(3));
    expect(result.current.seconds).toBe(3);
    expect(result.current.blocked).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(2);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(1);
  });

  it('se desbloquea al llegar a 0', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(2));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('ignora valores no positivos', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(0));
    expect(result.current.blocked).toBe(false);
    act(() => result.current.start(-5));
    expect(result.current.blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/useRateLimit.test.ts
```
Expected: FAIL — `Failed to resolve import "../useRateLimit"`.

- [ ] **Step 3: Implementar `useRateLimit.ts`**

Crear `frontend/src/auth/useRateLimit.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Countdown para UX de rate limit (429 + Retry-After).
 * `start(segundos)` bloquea el botón durante ese tiempo; `seconds` baja cada segundo.
 */
export function useRateLimit(): {
  seconds: number;
  blocked: boolean;
  start: (seconds: number) => void;
  reset: () => void;
} {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setSeconds(0);
  }, [clearTimer]);

  const start = useCallback(
    (secs: number) => {
      const s = Math.ceil(secs);
      if (!Number.isFinite(s) || s <= 0) return;
      clearTimer();
      setSeconds(s);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current !== null) {
              window.clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { seconds, blocked: seconds > 0, start, reset };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/useRateLimit.test.ts
```
Expected: `Test Files 1 passed`, `Tests 4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/useRateLimit.ts frontend/src/auth/__tests__/useRateLimit.test.ts
git commit -m "feat(auth): hook useRateLimit con countdown para UX de rate limit"
```

---

## Task 5: Extender `AuthProvider` con `changePassword`, `loginWithGoogle` e invalidación de `['me']`

El `AuthProvider` de F0 ya gestiona `login`/`register`/`logout`/`refresh` y el `user` en contexto. Aquí añadimos: (a) `changePassword(old,new)` que llama al endpoint y, por la invalidez de access tokens, limpia sesión sin llamar `/auth/logout`; (b) `loginWithGoogle(authCode)` para OAuth; (c) invalidación de la query `['me']` tras login/register/refresh (prepara a F2, que usa `GET /me`).

**Files:**
- Modify: `frontend/src/auth/AuthProvider.tsx`
- Modify: `frontend/src/auth/useAuth.ts` (sin cambios funcionales; el tipo se deriva del contexto)

- [ ] **Step 1: Reescribir `auth/AuthProvider.tsx`**

Sustituir **todo** el contenido de `frontend/src/auth/AuthProvider.tsx` por:

```typescript
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, setApplyAuth } from '../api/client';
import { createAuthInterceptor, subscribeAuthEvents } from '../api/auth-interceptor';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './tokenStore';
import type { UserPublic } from '../types/common';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}

interface AuthContextValue {
  user: UserPublic | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** POST /auth/change-password → el backend invalida los access tokens previos,
   *  así que limpiamos sesión (sin llamar /auth/logout) y forzamos re-login. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /** POST /auth/oauth/google con {refresh_token: <auth_code>}. */
  loginWithGoogle: (authCode: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();

  const invalidateMe = useCallback(() => {
    // Prepara a F2+ (que usa GET /me con key ['me']); barato si no existe aún.
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const fetchMe = useCallback(async (): Promise<UserPublic | null> => {
    if (!getAccessToken()) return null;
    try {
      return await apiGet<UserPublic>('/auth/me');
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setStatus('unauthenticated');
      setUser(null);
      return;
    }
    try {
      const tokens = await apiPost<TokenOut>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    } catch {
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, [invalidateMe]);

  // Bootstrap: registrar interceptor + intentar recuperar sesión al montar.
  useEffect(() => {
    setApplyAuth(createAuthInterceptor());

    const unsub = subscribeAuthEvents((e) => {
      if (e.type === 'session_expired') {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    (async () => {
      const me = await fetchMe();
      if (me) {
        setUser(me);
        setStatus('authenticated');
        return;
      }
      await refresh();
    })();

    return unsub;
  }, [fetchMe, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/login',
        { email, password },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/register',
        { email, password, display_name: displayName },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const loginWithGoogle = useCallback(
    async (authCode: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/oauth/google',
        { refresh_token: authCode },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const logout = useCallback(async () => {
    const access = getAccessToken();
    if (access) {
      try {
        await apiPost('/auth/logout', { access_token: access });
      } catch {
        // Si el backend ya no acepta el token, igual limpiamos local.
      }
    }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
    invalidateMe();
  }, [invalidateMe]);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      // El endpoint requiere Bearer (access actual); el api client lo inyecta.
      await apiPost('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      // ⚠️ El backend invalidó TODOS los access tokens previos (incluido este).
      // No llamamos a /auth/logout (fallaría con 401). Limpiamos y forzamos re-login.
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      logout,
      refresh,
      changePassword,
      loginWithGoogle,
    }),
    [user, status, login, register, logout, refresh, changePassword, loginWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. `useAuth.ts` no requiere cambios: su tipo `AuthContextValue` se importa de `AuthProvider`, que ahora incluye los nuevos campos.

- [ ] **Step 3: Correr los tests existentes para asegurar que no rompimos F0**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/__tests__/App.test.tsx
```
Expected: el smoke test de App sigue pasando (el bootstrap del AuthProvider no crashea sin backend).

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/AuthProvider.tsx
git commit -m "feat(auth): añadir changePassword e loginWithGoogle al AuthProvider + invalidar ['me']"
```

---

## Task 6: Hooks de mutación de auth (`auth/hooks.ts`)

Centralizamos las mutaciones que NO son login/register (esas viven en el provider porque mutan el estado de sesión): reseteo de password (request + confirm) y cambio de password.

**Files:**
- Create: `frontend/src/auth/hooks.ts`
- Create: `frontend/src/auth/__tests__/hooks.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/auth/__tests__/hooks.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePasswordResetRequest, usePasswordResetConfirm } from '../hooks';

// Mock del api client: capturamos los args con los que se llama apiPost.
const apiPostMock = vi.fn();
vi.mock('../../api/client', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
  setApplyAuth: vi.fn(),
}));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe('usePasswordResetRequest', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('llama POST /auth/password-reset/request con {email}', async () => {
    apiPostMock.mockResolvedValueOnce({ message: 'Si el email existe...' });
    const { result } = renderHook(() => usePasswordResetRequest(), {
      wrapper: wrapper(newClient()),
    });

    await result.current.mutateAsync('user@example.com');

    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/request',
      { email: 'user@example.com' },
      { publicEndpoint: true },
    );
  });

  it('propaga ApiError en rate limit', async () => {
    const err = Object.assign(new Error('limite'), {
      code: 'rate_limit_exceeded',
      status: 429,
      detail: 'limite',
      retryAfter: 20,
    });
    apiPostMock.mockRejectedValueOnce(err);
    const { result } = renderHook(() => usePasswordResetRequest(), {
      wrapper: wrapper(newClient()),
    });

    await expect(result.current.mutateAsync('user@example.com')).rejects.toThrow('limite');
  });
});

describe('usePasswordResetConfirm', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('llama POST /auth/password-reset/confirm con {token, new_password}', async () => {
    apiPostMock.mockResolvedValueOnce({ message: 'Contraseña restablecida' });
    const { result } = renderHook(() => usePasswordResetConfirm(), {
      wrapper: wrapper(newClient()),
    });

    await result.current.mutateAsync({ token: 'tok123', new_password: 'nuevaClave123' });

    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/confirm',
      { token: 'tok123', new_password: 'nuevaClave123' },
      { publicEndpoint: true },
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/hooks.test.tsx
```
Expected: FAIL — `Failed to resolve import "../hooks"`.

- [ ] **Step 3: Implementar `auth/hooks.ts`**

Crear `frontend/src/auth/hooks.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../api/client';
import type { OKMessage } from '../types/common';

/** POST /auth/password-reset/request → siempre 202 (no filtra si el email existe). */
export function usePasswordResetRequest() {
  return useMutation({
    mutationFn: (email: string) =>
      apiPost<OKMessage>(
        '/auth/password-reset/request',
        { email },
        { publicEndpoint: true },
      ),
  });
}

/** POST /auth/password-reset/confirm con {token, new_password}. Errores: 401 invalid_token. */
export function usePasswordResetConfirm() {
  return useMutation({
    mutationFn: (vars: { token: string; new_password: string }) =>
      apiPost<OKMessage>(
        '/auth/password-reset/confirm',
        vars,
        { publicEndpoint: true },
      ),
  });
}
```

> Nota: el cambio de contraseña (`useChangePassword`) vive en el `AuthProvider.changePassword` porque muta el estado de sesión (fuerza logout). La página `ChangePasswordPage` (Task 12) consume `useAuth().changePassword` directamente dentro de una `useMutation` local; no se define aquí para evitar dos fuentes de verdad.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/hooks.test.tsx
```
Expected: `Test Files 1 passed`, `Tests 3 passed`.

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
git add frontend/src/auth/hooks.ts frontend/src/auth/__tests__/hooks.test.tsx
git commit -m "feat(auth): hooks usePasswordResetRequest y usePasswordResetConfirm (TDD)"
```

---

## Task 7: Instalar `@react-oauth/google` y crear `AuthLayout` + `GoogleButton`

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/auth/components/AuthLayout.tsx`
- Create: `frontend/src/auth/components/GoogleButton.tsx`

- [ ] **Step 1: Instalar `@react-oauth/google`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install @react-oauth/google@^1
```
Expected: instalada sin conflictos.

- [ ] **Step 2: Crear `AuthLayout.tsx`**

Crear `frontend/src/auth/components/AuthLayout.tsx`:

```typescript
import type { ReactNode } from 'react';
import { Compass } from 'lucide-react';

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Layout compartido para login/registro/forgot/reset. Fondo de marca + panel glass. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 py-8 bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-600/30">
            <Compass className="w-6 h-6" />
          </div>
          <span className="text-2xl font-extrabold text-gray-900 tracking-tight">GAD</span>
        </div>

        <div className="w-full glass-panel rounded-3xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-gray-900 text-center">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 text-center mt-1 mb-5">{subtitle}</p>
          )}
          <div className={subtitle ? '' : 'mt-5'}>{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-gray-600">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `GoogleButton.tsx`**

El botón solo se renderiza si hay `VITE_OAUTH_GOOGLE_CLIENT_ID`. Usa `useGoogleLogin({ flow: 'auth-code' })` para obtener el authorization code de Google y lo envía al backend vía `useAuth().loginWithGoogle`.

Crear `frontend/src/auth/components/GoogleButton.tsx`:

```typescript
import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { useAuth } from '../useAuth';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../api/errors';

/** Devuelve true si el OAuth de Google está habilitado (client ID configurado). */
export function isGoogleAuthEnabled(): boolean {
  return Boolean(import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID);
}

export function GoogleButton({ onSuccess }: { onSuccess?: () => void }) {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (response) => {
      if (!response.code) {
        toast.error('No pudimos completar el login con Google.');
        return;
      }
      setLoading(true);
      try {
        await loginWithGoogle(response.code);
        toast.success('Sesión iniciada con Google.');
        onSuccess?.();
      } catch (err) {
        const msg =
          err instanceof ApiError && err.code
            ? err.code === 'rate_limit_exceeded'
              ? 'Demasiados intentos con Google. Esperá un momento.'
              : err.code === 'oauth_error'
                ? 'No pudimos autenticarte con Google.'
                : err.detail
            : 'No pudimos autenticarte con Google.';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      toast.error('No pudimos conectar con Google.');
    },
  });

  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      loading={loading}
      onClick={() => login()}
      className="!bg-white"
    >
      {/* logo "G" simplificado en SVG para no añadir otra dependencia */}
      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
        />
      </svg>
      Continuar con Google
    </Button>
  );
}
```

- [ ] **Step 4: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. (Si `@react-oauth/google` no trae tipos, el paquete los incluye; si tsc reclama por `response.code`, el tipo `OAuth2AuthCodeFlowResponse` lo expone.)

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/package.json frontend/package-lock.json frontend/src/auth/components/AuthLayout.tsx frontend/src/auth/components/GoogleButton.tsx
git commit -m "feat(auth): layout compartido AuthLayout y GoogleButton (@react-oauth/google)"
```

---

## Task 8: `LoginPage`

**Files:**
- Create: `frontend/src/auth/pages/LoginPage.tsx`

- [ ] **Step 1: Crear `LoginPage.tsx`**

Crear `frontend/src/auth/pages/LoginPage.tsx`:

```typescript
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton, isGoogleAuthEnabled } from '../components/GoogleButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { loginSchema, type LoginValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const rate = useRateLimit();
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/explore';

  // Si ya hay sesión, salir de /login hacia la ruta intención.
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      toast.success('¡Bienvenido de nuevo!');
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('password', { message: 'Demasiados intentos. Esperá para reintentar.' });
        } else if (err.code === 'invalid_credentials') {
          setError('password', { message: 'Email o contraseña incorrectos.' });
        } else {
          setError('password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos iniciar sesión. Probá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || rate.blocked;

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Conectá con gente cerca para salir a hacer planes"
      footer={
        <span>
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="text-brand-600 font-semibold">
            Crear cuenta
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="vos@email.com"
              invalid={Boolean(errors.email)}
              className="pl-9"
              {...field('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              invalid={Boolean(errors.password)}
              className="pl-9"
              {...field('password')}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          )}
          <Link
            to="/forgot-password"
            className="block text-xs text-brand-600 font-medium mt-1.5 text-right"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button type="submit" loading={submitting} disabled={disabled} fullWidth>
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Iniciar sesión'}
        </Button>
      </form>

      {isGoogleAuthEnabled() && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton
            onSuccess={() => navigate(from, { replace: true })}
          />
        </>
      )}
    </AuthLayout>
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
git add frontend/src/auth/pages/LoginPage.tsx
git commit -m "feat(auth): LoginPage con validación, rate limit y OAuth Google"
```

---

## Task 9: `RegisterPage`

**Files:**
- Create: `frontend/src/auth/pages/RegisterPage.tsx`

- [ ] **Step 1: Crear `RegisterPage.tsx`**

Crear `frontend/src/auth/pages/RegisterPage.tsx`:

```typescript
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, Lock, User } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton, isGoogleAuthEnabled } from '../components/GoogleButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { registerSchema, type RegisterValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

export function RegisterPage() {
  const { register: registerUser, status } = useAuth();
  const navigate = useNavigate();
  const rate = useRateLimit();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/explore" replace />;
  }

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { display_name: '', email: '', password: '' },
  });

  const onSubmit = async (values: RegisterValues) => {
    setSubmitting(true);
    try {
      await registerUser(values.email, values.password, values.display_name);
      toast.success('¡Cuenta creada! Bienvenido a GAD.');
      navigate('/explore', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('password', { message: 'Demasiados intentos. Esperá para reintentar.' });
        } else if (err.code === 'email_already_exists') {
          setError('email', { message: 'Ya existe una cuenta con ese email.' });
        } else {
          setError('password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos crear tu cuenta. Probá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || rate.blocked;

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Empezá a hacer planes cerca tuyo"
      footer={
        <span>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-brand-600 font-semibold">
            Iniciar sesión
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="display_name"
              autoComplete="nickname"
              placeholder="Cómo te llaman"
              invalid={Boolean(errors.display_name)}
              className="pl-9"
              {...field('display_name')}
            />
          </div>
          {errors.display_name && (
            <p className="text-xs text-red-600 mt-1">{errors.display_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="vos@email.com"
              invalid={Boolean(errors.email)}
              className="pl-9"
              {...field('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              invalid={Boolean(errors.password)}
              className="pl-9"
              {...field('password')}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          )}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button type="submit" loading={submitting} disabled={disabled} fullWidth>
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Crear cuenta'}
        </Button>
      </form>

      {isGoogleAuthEnabled() && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton onSuccess={() => navigate('/explore', { replace: true })} />
        </>
      )}
    </AuthLayout>
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
git add frontend/src/auth/pages/RegisterPage.tsx
git commit -m "feat(auth): RegisterPage con validación y manejo de email_already_exists"
```

---

## Task 10: `ForgotPasswordPage`

**Files:**
- Create: `frontend/src/auth/pages/ForgotPasswordPage.tsx`

- [ ] **Step 1: Crear `ForgotPasswordPage.tsx`**

El backend responde **siempre 202** (no filtra si el email existe). Tras enviar, mostramos un estado de éxito fijo con el mismo mensaje, sin importar el resultado (salvo rate limit, que sí mostramos).

Crear `frontend/src/auth/pages/ForgotPasswordPage.tsx`:

```typescript
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useRateLimit } from '../useRateLimit';
import { usePasswordResetRequest } from '../hooks';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';
import { ApiError } from '../../api/errors';

export function ForgotPasswordPage() {
  const requestReset = usePasswordResetRequest();
  const rate = useRateLimit();
  const [sent, setSent] = useState(false);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    try {
      await requestReset.mutateAsync(values.email);
      // El backend siempre 202; no revelamos si el email existe.
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rate_limit_exceeded') {
        rate.start(err.retryAfter ?? 60);
        setError('email', { message: 'Demasiados pedidos. Esperá para reintentar.' });
      } else {
        // Incluso ante errores inesperados, no filtramos existencia del email:
        // mostramos el mismo estado de éxito.
        setSent(true);
      }
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Revisá tu email">
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <p className="text-sm text-gray-600">
            Si el email existe, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 font-semibold mt-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviamos un enlace para restablecerla"
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-brand-600 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a iniciar sesión
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="vos@email.com"
              invalid={Boolean(errors.email)}
              className="pl-9"
              {...field('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados pedidos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button
          type="submit"
          loading={requestReset.isPending}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Enviar enlace'}
        </Button>
      </form>
    </AuthLayout>
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
git add frontend/src/auth/pages/ForgotPasswordPage.tsx
git commit -m "feat(auth): ForgotPasswordPage con respuesta 202 no-filtrante y rate limit"
```

---

## Task 11: `ResetPasswordPage`

**Files:**
- Create: `frontend/src/auth/pages/ResetPasswordPage.tsx`

- [ ] **Step 1: Crear `ResetPasswordPage.tsx`**

Lee el token de `?token=` vía `useSearchParams`. Si no hay token, muestra un estado de error con link a forgot-password. Tras confirmar éxito, redirige a `/login`.

Crear `frontend/src/auth/pages/ResetPasswordPage.tsx`:

```typescript
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useRateLimit } from '../useRateLimit';
import { usePasswordResetConfirm } from '../hooks';
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';
import { useEffect } from 'react';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirmReset = usePasswordResetConfirm();
  const rate = useRateLimit();
  const token = params.get('token') ?? '';

  // El schema exige token; lo inyectamos como valor fijo del form.
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Omit<ResetPasswordValues, 'token'>>({
    resolver: zodResolver(resetPasswordSchema.omit({ token: true })),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  // Caso de éxito: el mutate terminó OK y no lanzó.
  const succeeded = confirmReset.isSuccess;

  useEffect(() => {
    if (succeeded) {
      const t = setTimeout(() => navigate('/login', { replace: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [succeeded, navigate]);

  if (!token) {
    return (
      <AuthLayout title="Enlace inválido">
        <div className="flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-sm text-gray-600">
            Este enlace no contiene un token válido. Solicité uno nuevo.
          </p>
          <Link to="/forgot-password" className="text-brand-600 font-semibold text-sm mt-2">
            Solicitar nuevo enlace
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (succeeded) {
    return (
      <AuthLayout title="Contraseña restablecida">
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <p className="text-sm text-gray-600">
            Tu contraseña se actualizó. Iniciá sesión con la nueva.
          </p>
          <Link to="/login" className="text-brand-600 font-semibold text-sm mt-2">
            Ir a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async (values: Omit<ResetPasswordValues, 'token'>) => {
    try {
      await confirmReset.mutateAsync({ token, new_password: values.new_password });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('confirm_password', {
            message: 'Demasiados intentos. Esperá para reintentar.',
          });
        } else if (err.code === 'invalid_token') {
          setError('new_password', {
            message: 'El enlace expiró o es inválido. Solicitá uno nuevo.',
          });
        } else {
          setError('confirm_password', { message: mapErrorMessage(err.code, err.detail) });
        }
      }
    }
  };

  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elegí una contraseña nueva">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              invalid={Boolean(errors.new_password)}
              className="pl-9"
              {...field('new_password')}
            />
          </div>
          {errors.new_password && (
            <p className="text-xs text-red-600 mt-1">{errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Repetí la contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Repetí la contraseña"
              invalid={Boolean(errors.confirm_password)}
              className="pl-9"
              {...field('confirm_password')}
            />
          </div>
          {errors.confirm_password && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
          )}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button
          type="submit"
          loading={confirmReset.isPending}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Restablecer contraseña'}
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. (Si `zodResolver` reclama el tipo por el `omit`, ajustar el tipo del `useForm` a `z.infer<typeof resetPasswordSchema>` completo y pasar `token` en `defaultValues`; pero con `omit` el resolver valida correctamente los campos del form.)

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/pages/ResetPasswordPage.tsx
git commit -m "feat(auth): ResetPasswordPage lee ?token= y maneja invalid_token"
```

---

## Task 12: `ChangePasswordPage`

**Files:**
- Create: `frontend/src/auth/pages/ChangePasswordPage.tsx`

**Comportamiento documentado:** `POST /auth/change-password` invalida TODOS los access tokens previos. El backend NO devuelve tokens nuevos. Por eso, tras un cambio exitoso el `AuthProvider.changePassword` limpia la sesión (sin llamar `/auth/logout`, porque el access actual quedó revocado) y `status` pasa a `unauthenticated`; el guard `RequireAuth` expulsa a `/login` automáticamente. La página muestra un toast y deja que el guard redirija.

- [ ] **Step 1: Crear `ChangePasswordPage.tsx`**

Crear `frontend/src/auth/pages/ChangePasswordPage.tsx`:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { changePasswordSchema, type ChangePasswordValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

export function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const rate = useRateLimit();

  const {
    register: field,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
    try {
      await changePassword(values.old_password, values.new_password);
      // El AuthProvider.changePassword ya limpió sesión (access invalidado por el backend).
      // RequireAuth nos va a redirigir a /login. Avisamos al usuario.
      toast.success('Contraseña actualizada. Iniciá sesión con la nueva.');
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('confirm_password', {
            message: 'Demasiados intentos. Esperá para reintentar.',
          });
        } else if (err.code === 'invalid_credentials') {
          setError('old_password', { message: 'La contraseña actual es incorrecta.' });
        } else {
          setError('confirm_password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos cambiar tu contraseña. Probá de nuevo.');
      }
    }
  };

  return (
    <AuthLayout title="Cambiar contraseña" subtitle="Vas a tener que iniciar sesión de nuevo">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Por seguridad, al cambiar la contraseña cerramos tu sesión en todos los dispositivos.
        </div>

        <div>
          <label htmlFor="old_password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña actual
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="old_password"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña actual"
              invalid={Boolean(errors.old_password)}
              className="pl-9"
              {...field('old_password')}
            />
          </div>
          {errors.old_password && (
            <p className="text-xs text-red-600 mt-1">{errors.old_password.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              invalid={Boolean(errors.new_password)}
              className="pl-9"
              {...field('new_password')}
            />
          </div>
          {errors.new_password && (
            <p className="text-xs text-red-600 mt-1">{errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Repetí la nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Repetí la nueva contraseña"
              invalid={Boolean(errors.confirm_password)}
              className="pl-9"
              {...field('confirm_password')}
            />
          </div>
          {errors.confirm_password && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
          )}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Cambiar contraseña'}
        </Button>
      </form>
    </AuthLayout>
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
git add frontend/src/auth/pages/ChangePasswordPage.tsx
git commit -m "feat(auth): ChangePasswordPage con re-login forzado (access invalidado por backend)"
```

---

## Task 13: Actualizar `test-utils.tsx` para inyectar un contexto de auth mockeado

Para testear las páginas de forma aislada (sin depender del bootstrap del AuthProvider ni de fetch real), añadimos una opción `authValue` a `renderWithProviders`.

**Files:**
- Modify: `frontend/src/test/test-utils.tsx`

- [ ] **Step 1: Reescribir `test-utils.tsx`**

Sustituir **todo** el contenido de `frontend/src/test/test-utils.tsx` por:

```typescript
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  AuthProvider,
  type AuthContextValue,
} from '../auth/AuthProvider';
import { AuthContext } from '../auth/AuthProvider';

/** QueryClient fresco por test (sin retry infinito, sin refetch). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  initialEntries?: string[];
  /** Si se pasa, se usa este valor de contexto en lugar del AuthProvider real. */
  authValue?: AuthContextValue;
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = makeQueryClient();
  const initialEntries = options.initialEntries ?? ['/'];

  const authNode = options.authValue ? (
    <AuthContext.Provider value={options.authValue}>{ui}</AuthContext.Provider>
  ) : (
    <AuthProvider>{ui}</AuthProvider>
  );

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{authNode ?? children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
```

- [ ] **Step 2: Verificar que los tests existentes siguen pasando**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test
```
Expected: todos los tests existentes (errors, geo, format, App smoke, schemas, useRateLimit, hooks) pasan.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/test/test-utils.tsx
git commit -m "test(frontend): permitir inyectar authValue mockeado en renderWithProviders"
```

---

## Task 14: TDD — Tests de componentes de formulario (`pages.test.tsx`)

**Files:**
- Create: `frontend/src/auth/__tests__/pages.test.tsx`

- [ ] **Step 1: Escribir los tests**

Crear `frontend/src/auth/__tests__/pages.test.tsx`. Se mockean `useAuth` (vía contexto inyectado) y el api client donde corresponde:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { AuthContextValue } from '../AuthProvider';
import { renderWithProviders } from '../../test/test-utils';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    status: 'unauthenticated',
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza email, password y botón', () => {
    renderWithProviders(<LoginPage />, { authValue: makeAuthValue() });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('muestra error de validación con email inválido', async () => {
    renderWithProviders(<LoginPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'no-email' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/ingresá un email válido/i)).toBeInTheDocument();
    });
  });

  it('llama login con email y password válidos', async () => {
    const authValue = makeAuthValue();
    renderWithProviders(<LoginPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(authValue.login).toHaveBeenCalledWith('a@b.com', 'secreto123');
    });
  });

  it('muestra error de credenciales cuando login lanza invalid_credentials', async () => {
    const apiError = Object.assign(new Error('bad'), {
      code: 'invalid_credentials',
      status: 401,
      detail: 'bad',
    });
    const authValue = makeAuthValue({
      login: vi.fn().mockRejectedValue(apiError),
    });
    renderWithProviders(<LoginPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/email o contraseña incorrectos/i)).toBeInTheDocument();
    });
  });
});

describe('RegisterPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra error si la contraseña es muy corta', async () => {
    renderWithProviders(<RegisterPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument();
    });
  });

  it('llama register con los valores válidos', async () => {
    const authValue = makeAuthValue();
    renderWithProviders(<RegisterPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(authValue.register).toHaveBeenCalledWith('a@b.com', 'secreto123', 'Ana');
    });
  });

  it('muestra error de email_already_exists', async () => {
    const apiError = Object.assign(new Error('dup'), {
      code: 'email_already_exists',
      status: 409,
      detail: 'dup',
    });
    const authValue = makeAuthValue({
      register: vi.fn().mockRejectedValue(apiError),
    });
    renderWithProviders(<RegisterPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/ya existe una cuenta con ese email/i)).toBeInTheDocument();
    });
  });
});

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra mensaje de éxito genérico tras enviar (no filtra existencia)', async () => {
    const apiPostMock = vi.fn().mockResolvedValue({ message: 'ok' });
    vi.doMock('../../api/client', () => ({ apiPost: apiPostMock, apiGet: vi.fn() }));

    renderWithProviders(<ForgotPasswordPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/si el email existe, recibirás un enlace/i),
      ).toBeInTheDocument();
    });
    vi.doUnmock('../../api/client');
  });
});

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin ?token= muestra estado de enlace inválido', () => {
    renderWithProviders(<ResetPasswordPage />, {
      authValue: makeAuthValue(),
      initialEntries: ['/reset-password'],
    });
    expect(screen.getByText(/este enlace no contiene un token válido/i)).toBeInTheDocument();
  });

  it('con ?token= muestra el formulario de nueva contraseña', () => {
    renderWithProviders(<ResetPasswordPage />, {
      authValue: makeAuthValue(),
      initialEntries: ['/reset-password?token=abc'],
    });
    expect(screen.getByLabelText(/nueva contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repetí la contraseña/i)).toBeInTheDocument();
  });
});
```

> Nota sobre el test de `ForgotPasswordPage`: usa `renderWithProviders` con `authValue` mock para el contexto, pero el hook `usePasswordResetRequest` llama al api client real (mockeado vía `vi.doMock`). Si `vi.doMock` no intercepta por el orden de módulos (Vitest aplica los mocks de `vi.mock` en top-level), sustituir ese test por una versión que mockee `../../api/client` con `vi.mock` en la parte superior del archivo. Ver Step 2.

- [ ] **Step 2: Si el mock del api client no aplica, mover a `vi.mock` top-level**

Si al correr el test de `ForgotPasswordPage` no se intercepta la llamada, reemplazar el bloque `describe('ForgotPasswordPage', ...)` por uno que use un mock top-level. Añadir al inicio del archivo (debajo de los imports):

```typescript
const apiPostMock = vi.fn();
vi.mock('../../api/client', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
  setApplyAuth: vi.fn(),
}));
```

Y el test de ForgotPasswordPage queda:

```typescript
describe('ForgotPasswordPage', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('muestra mensaje de éxito genérico tras enviar', async () => {
    apiPostMock.mockResolvedValue({ message: 'ok' });
    renderWithProviders(<ForgotPasswordPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/si el email existe, recibirás un enlace/i),
      ).toBeInTheDocument();
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/request',
      { email: 'a@b.com' },
      { publicEndpoint: true },
    );
  });
});
```

(Si se añade el `vi.mock` top-level, recordar que afecta a TODO el archivo: los tests de Login/Register usan `authValue` mockeado y NO tocan el api client, así que no hay conflicto.)

- [ ] **Step 3: Correr los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/auth/__tests__/pages.test.tsx
```
Expected: `Test Files 1 passed`. Si algún selector falla por texto, ajustar el regex al texto exacto del componente (leer el diff). Los tests válidos: LoginPage renderiza, validación email, login llamado, error credenciales; RegisterPage password corto, register llamado, email_exists; ForgotPasswordPage éxito genérico; ResetPasswordPage sin/con token.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/__tests__/pages.test.tsx
git commit -m "test(auth): tests de integración de páginas de formulario con mocks de api client"
```

---

## Task 15: Registrar las rutas de auth en `router.tsx`

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Reescribir `router.tsx`**

Sustituir **todo** el contenido de `frontend/src/router.tsx` por:

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { LoginPage } from './auth/pages/LoginPage';
import { RegisterPage } from './auth/pages/RegisterPage';
import { ForgotPasswordPage } from './auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/pages/ResetPasswordPage';
import { ChangePasswordPage } from './auth/pages/ChangePasswordPage';
import { ExploreStub } from './pages/ExploreStub';
import { PublicShareStub } from './pages/PublicShareStub';

export const router = createBrowserRouter([
  // Públicas (sin auth)
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/s/:token', element: <PublicShareStub /> },

  // Protegidas (RequireAuth)
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/explore" replace /> },
      { path: '/explore', element: <ExploreStub /> },
      { path: '/me/password', element: <ChangePasswordPage /> },
      // El resto de rutas protegidas se añaden en F2-F7.
    ],
  },

  // Admin (placeholder)
  {
    element: <RequireAdmin />,
    children: [
      { path: '/admin', element: <ExploreStub /> },
      { path: '/admin/*', element: <ExploreStub /> },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/explore" replace /> },
]);
```

- [ ] **Step 2: Eliminar los stubs de Login/Register ya no usados**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
rm -f src/pages/LoginStub.tsx src/pages/RegisterStub.tsx
```
Verificar que ningún otro archivo los importa:

```bash
grep -rn "LoginStub\|RegisterStub" src || echo "sin referencias"
```
Expected: `sin referencias`.

- [ ] **Step 3: Verificar tsc + build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build
```
Expected: sin errores; `dist/` generado.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/router.tsx frontend/src/pages/
git commit -m "feat(router): registrar rutas de auth (/login, /register, /forgot/reset-password, /me/password)"
```

---

## Task 16: Envolver la app con `GoogleOAuthProvider` si hay client ID

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Reescribir `main.tsx`**

Sustituir **todo** el contenido de `frontend/src/main.tsx` por:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth/AuthProvider';
import { router } from './router';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const googleClientId = import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID;

const authedApp = (
  <AuthProvider>
    <App />
    <Toaster position="top-center" richColors closeButton />
  </AuthProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>{authedApp}</GoogleOAuthProvider>
      ) : (
        authedApp
      )}
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Verificar tsc + build + dev**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit && npm run build && (timeout 8 npm run dev || true)
```
Expected: tsc sin errores, build OK, dev server levanta en `http://localhost:5173/`.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/main.tsx
git commit -m "feat(auth): envolver app con GoogleOAuthProvider si VITE_OAUTH_GOOGLE_CLIENT_ID está seteado"
```

---

## Task 17: Verificación final y smoke manual

**Files:** —

- [ ] **Step 1: Lint (tsc)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run lint
```
Expected: sin errores.

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build OK, `dist/` generado.

- [ ] **Step 3: Tests completos**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test
```
Expected: todos pasan (`errors`, `geo`, `format`, `App`, `schemas`, `useRateLimit`, `hooks`, `pages`). Sin fallos.

- [ ] **Step 4: Smoke manual del flujo de auth (requiere backend en :8000)**

Si el backend corre:

```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run dev &
sleep 4
# Registrar
curl -s -X POST http://localhost:5173/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"f1@example.com","password":"passwordSeguro123","display_name":"F1 Tester"}' | head
# Login
curl -s -X POST http://localhost:5173/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"f1@example.com","password":"passwordSeguro123"}' | head
kill %1 2>/dev/null || true
```
Expected: el register devuelve 201 con `TokenOut`; el login 200 con `TokenOut`. Luego navegar manualmente a `http://localhost:5173/login`, registrar, y confirmar redirect a `/explore`. Si el backend no corre, omitir este paso (los tests cubren la lógica).

- [ ] **Step 5: Smoke del rate limit (requiere backend)**

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5173/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"no@example.com","password":"x"}'
done
curl -s -D - -o /dev/null -X POST http://localhost:5173/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"no@example.com","password":"x"}' | grep -i retry-after
```
Expected: tras 5 intentos, 429 con header `Retry-After: <segundos>`. La UI debe deshabilitar el botón y mostrar countdown. Si el backend no corre, omitir.

- [ ] **Step 6: Commit final de F1**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add -A
git commit -m "chore(frontend): F1 completa — auth de punta a punta (login, registro, reset, change-password, OAuth)" --allow-empty
git log --oneline -20
```
Expected: log con los commits de F1.

---

## Criterios de aceptación de F1

- [ ] `npm run lint` (tsc) sin errores.
- [ ] `npm run build` genera `dist/` sin errores.
- [ ] `npm test` pasa todos los tests (F0 + schemas, useRateLimit, hooks, pages).
- [ ] Navegar a `/login` muestra el formulario con validación zod (email válido + password).
- [ ] Login exitoso guarda tokens, trae `GET /auth/me`, y redirige a `state.from` o `/explore`.
- [ ] Login con credenciales inválidas muestra "Email o contraseña incorrectos" (401 `invalid_credentials`).
- [ ] Al 5º intento de login, la UI recibe 429 + `Retry-After` y deshabilita el botón con countdown.
- [ ] `/register` crea cuenta (201), guarda tokens, trae user y redirige a `/explore`.
- [ ] Registro con email existente muestra "Ya existe una cuenta con ese email" (409 `email_already_exists`).
- [ ] `/forgot-password` siempre muestra el mensaje de éxito genérico (no filtra existencia del email).
- [ ] `/reset-password?token=<t>` muestra el form de nueva contraseña; sin token, estado de enlace inválido.
- [ ] Reset exitoso (200) redirige a `/login`; token inválido (401 `invalid_token`) muestra "El enlace expiró o es inválido".
- [ ] `/me/password` (protegida) cambia la contraseña; tras éxito limpia sesión y el guard redirige a `/login`.
- [ ] Si `VITE_OAUTH_GOOGLE_CLIENT_ID` está configurado, aparece el botón "Continuar con Google" en login y register; si no está, no aparece.
- [ ] El flujo de refresh 401→refresh→retry del interceptor de F0 sigue funcionando (no se rompió al extender el AuthProvider).

---

## Notas para el agente que ejecute este plan

1. **F0 es prerequisito:** este plan asume que F0 ya se ejecutó y dejó `tokenStore`, `api/client`, `AuthProvider`, `RequireAuth`, UI components, `renderWithProviders` y `router` con stubs. Si alguna firma difiere, **detente** y reconcilia antes de continuar.
2. **No recrees lo de F0:** usa `getAccessToken`/`setTokens`/`clearTokens`, `apiPost`/`apiGet`, `ApiError`/`mapErrorMessage`, `useAuth`, `RequireAuth`, `Button`/`Input` existentes. Solo se extienden `ApiError` (4º arg `retryAfter`), `client.parseError`, `AuthProvider` (2 métodos nuevos + invalidación), `test-utils` (opción `authValue`) y `main.tsx`/`router.tsx`.
3. **TDD en Tasks 2, 3, 4, 6:** test primero, vérificar rojo, implementar, vérificar verde, commit. No saltes el "verificar fallo".
4. **Change-password es especial:** el backend invalida los access tokens previos y NO devuelve tokens nuevos. Tras éxito, `AuthProvider.changePassword` limpia sesión (sin `/auth/logout`) y el guard expulsa a `/login`. Esto está documentado en el código; no lo cambies.
5. **OAuth condicional:** el botón Google solo se renderiza si `VITE_OAUTH_GOOGLE_CLIENT_ID` está seteado (`isGoogleAuthEnabled()`). El `GoogleOAuthProvider` solo se monta en `main.tsx` si hay client ID. No asumas que existe.
6. **Rate limit:** los 429 vienen con header `Retry-After` (segundos). El `useRateLimit` hace el countdown; el botón se deshabilita y muestra "Esperá Xs". Los códigos relevantes: login/register/oauth 5/min, refresh 30/min, password-reset/request 3/min.
7. **`verbatimModuleSyntax`:** usa `import type` para tipos (ya aplicado en el plan). Si instalás otra lib y tsc lo pide, ajustar.
8. **Tests de páginas:** usan `authValue` mock para aislar el formulario del bootstrap del AuthProvider. Para los flujos que tocan el api client (forgot/reset), mockean `../../api/client` con `vi.mock` top-level.
9. **Orden estricto:** las tareas son secuenciales. Task 2 (ApiError) antes que las páginas (usan `err.retryAfter`). Task 5 (AuthProvider) antes que GoogleButton/pages (usan `changePassword`/`loginWithGoogle`). Task 7 antes que las páginas (usan AuthLayout/GoogleButton). Task 13 antes que Task 14 (tests usan `authValue`).

---

## Auto-revisión (post-escritura)

**Cobertura del spec / contrato (Auth):**
- §3.1 Almacenamiento → reutiliza `tokenStore` de F0 (access memoria, refresh localStorage). ✓
- §3.2 Interceptor 401→refresh → reutiliza F0; AuthProvider escucha `session_expired`. ✓
- §3.3 OAuth Google → Task 7 (GoogleButton), Task 16 (GoogleOAuthProvider condicional). ✓
- §3.4 Guards → reutiliza `RequireAuth`; `/me/password` queda protegido. ✓
- `POST /auth/login` → Task 8 (LoginPage), 401 invalid_credentials, 5/min rate limit. ✓
- `POST /auth/register` → Task 9, 409 email_already_exists, 5/min. ✓
- `POST /auth/oauth/google` → Task 7 (GoogleButton con flow auth-code), 400 oauth_error. ✓
- `POST /auth/refresh` → reutiliza F0 (interceptor + AuthProvider.refresh). ✓
- `POST /auth/logout` → reutiliza F0. ✓
- `POST /auth/change-password` → Task 12, 401 invalid_credentials, invalida sesión → re-login documentado. ✓
- `POST /auth/password-reset/request` → Task 10, siempre 202. ✓
- `POST /auth/password-reset/confirm` → Task 11, 401 invalid_token, lee `?token=`. ✓
- `GET /auth/me` → usado en AuthProvider tras login/register/refresh/oauth. ✓
- §10 Seguridad → rate limits con countdown; access no persiste (memoria). ✓

**Consistencia con F0:** `ApiError(code, status, detail, retryAfter?)` es retrocompatible (4º arg opcional). `parseError` lee `Retry-After`. `AuthProvider` reexporta los métodos de F0 + 2 nuevos. `renderWithProviders` añade opción sin romper llamadas existentes (opcional). `router.tsx` reemplaza stubs por páginas reales y elimina `LoginStub`/`RegisterStub`.

**Placeholders:** revisado. Sin "TBD"/"TODO". Cada paso muestra código completo. Los únicos "ajustar si" son contingencias de testing (selectores de texto, `vi.mock` vs `vi.doMock`) documentadas con la solución concreta en el Step 2 del Task 14.

**Cambio de contraseña documentado:** Task 12 + notas del agente §4 + JSDoc en `AuthProvider.changePassword` explican que el backend invalida access tokens y el frontend fuerza re-login sin llamar `/auth/logout`.
