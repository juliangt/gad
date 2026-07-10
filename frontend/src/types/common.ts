import type { VerificationLevel } from './enums';

/** Paginación por cursor (contrato §4). */
export interface PaginatedOut<T> {
  items: T[];
  next_cursor: string | null;
}

/** Mensaje de error de dominio (contrato §2). code es null en errores no-GAD. */
export interface ErrorOut {
  detail: string;
  code: string | null;
}

/** Mensaje OK simple. */
export interface OKMessage {
  message: string;
}

/** Resumen de un host/usuario embebido en otras respuestas. */
export interface HostSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}

/** Resumen mínimo de usuario (para listas). */
export interface UserSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: VerificationLevel | string;
}

/** Respuesta pública de `GET /auth/me`. */
export interface UserPublic {
  id: string;
  email: string;
  display_name: string;
  verification_level: string;
  reputation_score: number;
  is_admin?: boolean;
}
