import { test, expect } from './helpers';
import { SEED_ACCOUNTS, uniqueEmail } from './helpers';

test.describe('Auth — login / registro / guards', () => {
  test('login con cuenta sembrada redirige a /explore', async ({ page }) => {
    await test.step('completar formulario de login', async () => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(SEED_ACCOUNTS.alice.email);
      await page.getByLabel('Contraseña').fill(SEED_ACCOUNTS.alice.password);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    });

    await test.step('redirige a explore y muestra el título', async () => {
      await page.waitForURL('**/explore', { timeout: 15_000 });
      await expect(page).toHaveURL(/\/explore$/);
      // Título "GAD" que muestra ExplorePage en el top floating area.
      await expect(page.getByRole('heading', { name: 'GAD', exact: true })).toBeVisible();
    });
  });

  test('login con contraseña incorrecta muestra error y no sale de /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(SEED_ACCOUNTS.alice.email);
    await page.getByLabel('Contraseña').fill('wrongpass');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // Mensaje de error del campo password (invalid_credentials).
    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
    // Sigue en /login.
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login con email inexistente muestra error', async ({ page }) => {
    await page.goto('/login');
    // Email sintácticamente válido pero inexistente (zod rechazaría un TLD
    // reservado como .test antes de enviar la request al backend).
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Contraseña').fill(SEED_ACCOUNTS.alice.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('ruta protegida (/explore) redirige a /login sin sesión', async ({ page }) => {
    // Sin login previo: RequireAuth debe redirigir a /login preservando `from`.
    await page.goto('/explore');
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
    // El formulario de login está presente.
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('registro crea cuenta, loguea y redirige a /explore', async ({ page }) => {
    const email = uniqueEmail('e2e-register');

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();

    await page.getByLabel('Nombre').fill('E2E Usuario');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Contraseña').fill(SEED_ACCOUNTS.alice.password);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // Tras registro exitoso se navega a /explore.
    await page.waitForURL('**/explore', { timeout: 20_000 });
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole('heading', { name: 'GAD', exact: true })).toBeVisible();
  });
});
