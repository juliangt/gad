import type { ErrorOut } from '../types/common';
import { ApiError } from './errors';

/** Base URL del backend. En dev el proxy Vite reescribe /api/* → backend. */
const BASE_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** Endpoints que NO llevan Bearer ni pasan por el interceptor de 401. */
const PUBLIC_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
  '/auth/oauth/google',
]);

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Evita añadir Bearer (login, refresh, endpoints públicos). */
  publicEndpoint?: boolean;
  /** Query params. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

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

/**
 * Wrapper central de fetch. Lanza ApiError en respuestas no-2xx.
 * No decide nada de auth aquí; el header Bearer lo inyecta quien llama
 * (o el interceptor). Esto mantiene client.ts testeable sin React.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, headers, publicEndpoint, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };

  if (body !== undefined && !(body instanceof FormData)) {
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
    // El navegador setea Content-Type multipart con boundary; no forzamos.
    const hdrs = init.headers as Record<string, string>;
    delete hdrs['Content-Type'];
  }

  const isPublic = publicEndpoint ?? PUBLIC_PATHS.has(path.split('?')[0]!);

  // Hook para que el interceptor inyecte auth y atrape 401.
  const finalInit = isPublic
    ? init
    : await applyAuth(init);

  const res = await fetch(buildUrl(path, query), finalInit);
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/**
 * Punto de extensión para auth. Por defecto es no-op (no añade nada).
 * El AuthProvider / interceptor lo reemplaza por una función que inyecta Bearer
 * y atrapa 401. Tests de client.ts usan el default o stub.
 */
export let applyAuth: (init: RequestInit) => Promise<RequestInit> | RequestInit =
  async (init) => init;

export function setApplyAuth(fn: typeof applyAuth): void {
  applyAuth = fn;
}

/** Helpers verbosos para los hooks. */
export const apiGet = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'POST', body });

export const apiPatch = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PATCH', body });

export const apiDelete = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' });

export const apiPut = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PUT', body });
