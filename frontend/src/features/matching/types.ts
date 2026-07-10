// frontend/src/features/matching/types.ts
// Espejo de la sección "Matching (sin prefijo)" de docs/API_CONTRACT.md.

import type { HostSummary, PaginatedOut, OKMessage } from '../../types/common';

// Re-export de enums para que las features consuman desde un único punto.
export type {
  ApplicationStatus,
  MatchStatus,
  MatchRole,
} from '../../types/enums';

/** applicant embebe los campos de HostSummary (mismos campos que UserSummary en el contrato). */
export type ApplicantSummary = HostSummary;

/** Body de POST /plans/{plan_id}/applications (ApplicationIn en el contrato). */
export interface ApplicationIn {
  message?: string | null; // ..500
}

/**
 * Respuesta de POST /plans/{id}/applications, GET /plans/{id}/applications,
 * GET /me/applications (item).
 */
export interface ApplicationOut {
  id: string;
  plan_id: string;
  applicant: ApplicantSummary;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  created_at: string; // ISO 8601
  decided_at: string | null; // ISO 8601 — fecha de accept/reject/withdraw
}

/** GET /plans/{id}/applications devuelve un array directo (NO PaginatedOut). */
export type ApplicationList = ApplicationOut[];

/** GET /me/applications es paginado por cursor. */
export type MyApplicationsPage = PaginatedOut<ApplicationOut>;

/** Item del array `participants` de MatchOut. */
export interface MatchParticipant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'host' | 'participant';
  joined_at: string; // ISO 8601
}

/**
 * Respuesta de GET /matches, GET /matches/{id}, POST /matches/{id}/complete,
 * POST /matches/{id}/cancel. Y de POST /applications/{id}/accept cuando se
 * forma el match (puede devolver null si todavía no se alcanza max_participants).
 */
export interface MatchOut {
  id: string;
  plan_id: string;
  status: 'active' | 'completed' | 'cancelled';
  started_at: string; // ISO 8601
  ended_at: string | null; // ISO 8601
  location_sharing_active: boolean;
  participants: MatchParticipant[];
  /**
   * Ubicación exacta del encuentro. Solo visible para participantes:
   * el backend devuelve null si el solicitante no es participante.
   * null también puede significar que el host no fijó ubicación exacta.
   */
  exact_location_lat: number | null;
  exact_location_lng: number | null;
}

/** GET /matches es paginado por cursor. */
export type MatchesPage = PaginatedOut<MatchOut>;

/** Re-export de OKMessage para que las pages no importen de types/common indirectamente. */
export type { OKMessage };

/** Query params del listado de mis postulaciones / matches. */
export interface CursorQuery {
  limit?: number; // 1..100, default 50
  before?: string; // ISO 8601 — valor de next_cursor de la página anterior
}
