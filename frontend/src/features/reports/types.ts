/**
 * Tipos del dominio Reports (contrato §Reportes).
 *
 * POST /users/{user_id}/report (rate-limit 10/día, no a uno mismo).
 */
export interface ReportIn {
  /** 1..50 caracteres. */
  reason: string;
  /** max 1000, opcional. */
  description?: string | null;
}

export interface ReportOut {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string; // ISO 8601
}
