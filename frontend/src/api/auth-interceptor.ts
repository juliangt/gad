import { apiPost } from './client';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getRefreshMutex,
  setRefreshMutex,
} from '../auth/tokenStore';

interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}

/**
 * Inyecta el access token como Bearer. No muta requests ya autenticados.
 */
function withBearer(init: RequestInit): RequestInit {
  const token = getAccessToken();
  if (!token) return init;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Refresh con mutex: si hay un refresh en curso, espera su resultado en lugar
 * de disparar otro. Devuelve el nuevo access token o null si falló.
 */
async function doRefresh(): Promise<string | null> {
  const existing = getRefreshMutex();
  if (existing) return existing;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const promise = (async () => {
    try {
      const tokens = await apiPost<TokenOut>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      emitAuthEvent({ type: 'refreshed', access_token: tokens.access_token });
      return tokens.access_token;
    } catch {
      clearTokens();
      emitAuthEvent({ type: 'session_expired' });
      return null;
    } finally {
      setRefreshMutex(null);
    }
  })();

  setRefreshMutex(promise);
  return promise;
}

/**
 * Fábrica del interceptor que el AuthProvider registra vía `setApplyAuth`.
 * Devuelve el RequestInit con el Bearer inyectado.
 */
export function createAuthInterceptor(): (init: RequestInit) => Promise<RequestInit> {
  return async (init: RequestInit) => withBearer(init);
}

/**
 * Fetch autenticado con reintento ante 401 (refresh una sola vez, con mutex).
 * Expuesto para casos donde un hook necesite bypass de apiGet/apiPost.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const authedInit = withBearer(init);
  const res = await fetch(input, authedInit);

  if (res.status !== 401) return res;

  const newToken = await doRefresh();
  if (!newToken) {
    // Refresh fallido: el AuthProvider se entera por el evento session_expired.
    return res;
  }

  const retriedInit = withBearer(init);
  return fetch(input, retriedInit);
}

/** Eventos de sesión que emite el interceptor. */
export type AuthEvent =
  | { type: 'session_expired' }
  | { type: 'refreshed'; access_token: string };

type Listener = (e: AuthEvent) => void;
const listeners = new Set<Listener>();

export function subscribeAuthEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitAuthEvent(e: AuthEvent): void {
  listeners.forEach((fn) => fn(e));
}
