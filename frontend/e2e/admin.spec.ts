import { test, expect } from './helpers';
import { loginAs } from './helpers';

test.describe('Admin — panel y guards', () => {
  test('admin autenticado ve el panel de administración', async ({ page }) => {
    await loginAs(page, 'admin');

    await page.goto('/admin');
    // El dashboard muestra el título y la nav de admin.
    await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible();

    // Las tarjetas de métricas tienen labels estables (DashboardPage).
    await expect(page.getByText('Usuarios', { exact: true })).toBeVisible();
    await expect(page.getByText('Planes', { exact: true })).toBeVisible();
    await expect(page.getByText('Matches', { exact: true })).toBeVisible();
    // "Reportes abiertos" también debería estar visible (aunque sea 0).
    await expect(page.getByText('Reportes abiertos')).toBeVisible();
  });

  test('usuario no-admin es redirigido fuera del panel', async ({ page }) => {
    // RequireAdminRoute: auth pero no admin → <Navigate to="/explore" replace />.
    await loginAs(page, 'alice');

    await page.goto('/admin');
    // Debe terminar en /explore (no en /admin) y NO ver el panel.
    await page.waitForURL('**/explore', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole('heading', { name: 'Panel de administración' })).toHaveCount(0);
  });
});
