import { defineConfig, devices } from '@playwright/test';

/**
 * Config de Playwright para E2E contra el stack Docker completo.
 *
 * Asume que el stack ya está levantado (docker compose up). No arranca
 * webServer: el stack lo gestiona docker-compose.
 *
 * baseURL es configurable vía E2E_BASE_URL para CI/entornos distintos.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // La app pide geolocalización; la concedemos para ExplorePage.
    geolocation: { latitude: -34.5772, longitude: -58.4307 },
    permissions: ['geolocation'],
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
