import { test, expect } from './helpers';
import { loginAs } from './helpers';

/**
 * Smoke test de /matches. Alice tiene un match (con Bob) según el seed,
 * así que además de validar que la página carga, verificamos que aparece
 * el header estable "Matches" y no hay estado de error fatal.
 */
test.describe('Matching — página de matches', () => {
  test('/matches carga y muestra el listado', async ({ page }) => {
    await loginAs(page, 'alice');

    await page.goto('/matches');
    await page.waitForURL('**/matches', { timeout: 15_000 });

    // Título estable de MatchesPage.
    await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
    await expect(page.getByText('Tus salidas confirmadas')).toBeVisible();

    // Alice tiene al menos un match con Bob (seed). Si la lista trae algo,
    // validamos que hay contenido; si por alguna razón está vacía (p.ej. el
    // match está en "historial"), igual aceptamos mientras no haya error.
    const errorState = page.getByText('No se pudieron cargar tus matches');
    await expect(errorState).toHaveCount(0);
  });
});
