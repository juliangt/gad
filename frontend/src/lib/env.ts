/**
 * Centralización de variables de entorno y feature flags.
 * `import.meta.env.VITE_*` están tipadas en `src/vite-env.d.ts` (F0).
 */

function boolFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() !== 'false' && String(value) !== '0';
}

export const ENV = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000',
  oauthGoogleClientId: import.meta.env.VITE_OAUTH_GOOGLE_CLIENT_ID ?? '',
  enablePush: boolFlag(import.meta.env.VITE_ENABLE_PUSH, true),
} as const;
