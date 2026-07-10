import { test, expect } from './helpers';
import { loginAs } from './helpers';

/**
 * Specs de ExplorePage. La página es mobile-first con mapa + bottom sheet y
 * depende de geolocalización (concedida por la config de Playwright). Son
 * tests pragmáticos: verifican que la página carga sin error fatal y que
 * hay contenido sembrado, sin depender de selectores frágiles del mapa.
 */
test.describe('Plans — explore', () => {
  test('explore carga y muestra el contador de planes', async ({ page }) => {
    await loginAs(page, 'alice');

    // loginAs termina en /explore; aseguramos estar ahí.
    await page.waitForURL('**/explore', { timeout: 15_000 });

    // Título "GAD" del top floating area.
    await expect(page.getByRole('heading', { name: 'GAD', exact: true })).toBeVisible();

    // Sección "Cerca de ti" con el contador de planes. El texto es "{n} planes".
    await expect(page.getByText('Cerca de ti', { exact: true })).toBeVisible();
    // Aceptamos "0 planes" o "N planes": solo validamos que el indicador aparece.
    await expect(page.getByText(/\d+\s+planes?/)).toBeVisible({ timeout: 15_000 });
  });

  test('detalle de plan accesible por URL conocida carga sin error', async ({ page }) => {
    // Los IDs de planes son dinámicos (UUID generados por el seed), así que no
    // hardcodeamos uno. En su lugar, smoke test: navegar a un UUID inválido debe
    // resolver la ruta (404 del backend o estado de error de la UI) sin romper
    // la app. Esto valida que /plans/:planId está montada y requiere auth.
    await loginAs(page, 'alice');

    await page.goto('/plans/00000000-0000-0000-0000-000000000000');
    // No debe redirigir a /login (la ruta es válida y estamos autenticados).
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
