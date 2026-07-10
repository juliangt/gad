/** Códigos del backend (contrato §2). */
const ERROR_MESSAGES_ES: Record<string, string> = {
  auth_error: 'Tenés que iniciar sesión para continuar.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  invalid_token: 'Tu sesión expiró. Iniciá sesión de nuevo.',
  forbidden: 'No tenés permiso para hacer esto.',
  not_found: 'No encontramos lo que buscabas.',
  conflict: 'Hubo un conflicto con esta operación.',
  email_already_exists: 'Ya existe una cuenta con ese email.',
  validation_error: 'Algunos datos no son válidos.',
  oauth_error: 'No pudimos autenticarte con Google.',
  rate_limit_exceeded: 'Demasiados intentos. Esperá un momento.',
  error: 'Ocurrió un error inesperado.',
};

const DEFAULT_MESSAGE_ES = 'Ocurrió un error inesperado.';

/** Error de dominio del backend. `code` es null si la respuesta no era GADError.
 *  `retryAfter` (segundos) se setea cuando llega un 429 con header `Retry-After`. */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;
  readonly detail: string;
  readonly retryAfter?: number;

  constructor(code: string | null, status: number, detail: string, retryAfter?: number) {
    super(detail);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

/**
 * Traduce un code a mensaje en es-AR. Si `code` es null/desconocido, usa `fallback`
 * (típicamente el `detail` crudo del backend) o el mensaje genérico.
 */
export function mapErrorMessage(code: string | null, fallback?: string): string {
  if (code && ERROR_MESSAGES_ES[code]) {
    return ERROR_MESSAGES_ES[code];
  }
  return fallback ?? DEFAULT_MESSAGE_ES;
}
