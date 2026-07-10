/**
 * Almacén de tokens (módulo singleton, sin React).
 *
 * - Access token (TTL 15 min): en memoria. Se pierde al recargar; el refresh lo recupera.
 * - Refresh token (TTL 7 días): `localStorage` bajo `gad:refresh_token`.
 *
 * Ningún token se persiste en cookies ni sessionStorage.
 */

const REFRESH_KEY = 'gad:refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  try {
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // localStorage puede no estar disponible (modo privado, SSR). El refresh se pierde.
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  accessToken = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // noop
  }
}

/** Mutex para que el interceptor no dispare N refreshes paralelos ante N 401. */
export function getRefreshMutex(): Promise<string | null> | null {
  return refreshPromise;
}

export function setRefreshMutex(p: Promise<string | null> | null): void {
  refreshPromise = p;
}

/** Resetea el estado interno (solo para tests). */
export function __resetTokenStoreForTests(): void {
  accessToken = null;
  refreshPromise = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // noop
  }
}
