import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

/** Cuentas sembradas por backend/scripts/seed.py */
export const SEED_ACCOUNTS = {
  admin: { email: 'admin@example.com', password: 'Test1234', name: 'Admin GAD' },
  alice: { email: 'alice@example.com', password: 'Test1234', name: 'Alice' },
  bob: { email: 'bob@example.com', password: 'Test1234', name: 'Bob' },
  carol: { email: 'carol@example.com', password: 'Test1234', name: 'Carol' },
  diana: { email: 'diana@example.com', password: 'Test1234', name: 'Diana' },
} as const;

export type SeedUser = keyof typeof SEED_ACCOUNTS;

/**
 * Login vía UI: rellena el formulario de /login y envía.
 * Útil para specs que validan el flujo de UI completo.
 *
 * Este es el camino preferido en los specs: ejercita el formulario real y
 * deja que la app persista los tokens como en producción.
 */
export async function loginAs(page: Page, user: SeedUser): Promise<void> {
  const { email, password } = SEED_ACCOUNTS[user];
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  // Esperar redirección a una ruta autenticada.
  await page.waitForURL(/\/(explore|admin|matches)/, { timeout: 15_000 });
}

/**
 * Login vía API: obtiene tokens directamente del backend e inyecta el refresh
 * token en localStorage bajo 'gad:refresh_token' (key usada por
 * frontend/src/auth/tokenStore.ts).
 *
 * Nota sobre el diseño del tokenStore:
 *   - El ACCESS token vive solo en memoria (no se persiste).
 *   - El REFRESH token se persiste en localStorage bajo 'gad:refresh_token'.
 *   - Al montar, AuthProvider intenta fetchMe (falla sin access) y luego
 *     refresh() usando el refresh token del localStorage, recuperando así
 *     la sesión.
 *
 * Por eso basta con setear el refresh token y (re)cargar la app: el
 * bootstrap del AuthProvider se encarga del resto. Tras navegar a una ruta
 * protegida, esperamos a que el status pase a 'authenticated' (observable
 * vía la redirección/ausencia de /login).
 *
 * Es más rápido que loginAs pero ligeramente más frágil (depende del flujo
 * de refresh al montar). Por eso los specs usan loginAs salvo necesidad.
 */
export async function loginViaApi(
  page: Page,
  request: APIRequestContext,
  user: SeedUser,
): Promise<void> {
  const { email, password } = SEED_ACCOUNTS[user];
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `login API falló para ${email}`).toBeTruthy();
  const tokens = (await res.json()) as { refresh_token: string };

  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* noop */
      }
    },
    ['gad:refresh_token', tokens.refresh_token] as const,
  );
}

/** Genera un email único para tests de registro (evita colisiones). */
export function uniqueEmail(prefix = 'e2e'): string {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rnd}@test.com`;
}

/**
 * Test fixture extendido que expone helpers de autenticación.
 * Permite `const { loginAs } = fixtures; loginAs(page, 'alice');`.
 */
export const test = base.extend<{
  /** Helper inyectado: login vía UI con cuenta sembrada. */
  loginUI: (user: SeedUser) => Promise<void>;
}>({
  loginUI: async ({ page }, use) => {
    await use(async (user: SeedUser) => {
      await loginAs(page, user);
    });
  },
});

export { expect };
