/**
 * Tipos del dominio Admin (contrato §Admin). Requieren rol admin en backend.
 *
 * `GET /admin/stats` → AdminStatsOut.
 * `GET /admin/reports` → PaginatedOut<ReportOut>; PATCH /admin/reports/{id} {status}.
 * `GET /admin/users` → PaginatedOut<AdminUserOut>; ban/suspend/activate.
 * `POST /admin/plans/{id}/cancel` → { message }.
 * `GET /admin/reviews` → PaginatedOut<AdminReviewOut>; DELETE /admin/reviews/{id}.
 */
import type { UserStatus } from '../../types/enums';
import type { ReportOut } from '../reports/types';

/** Reexport del `ReportOut` de F6 para que admin lo consuma sin saltar de feature. */
export type { ReportOut } from '../reports/types';

/** `GET /admin/stats`. */
export interface AdminStatsOut {
  total_users: number;
  total_plans: number;
  total_matches: number;
  open_reports: number;
}

/** Estados posibles de un reporte (contrato usa string libre; acotamos). */
export type ReportStatus = 'open' | 'resolved' | 'closed';

/** `GET /admin/users` items. */
export interface AdminUserOut {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  is_admin: boolean;
  reputation_score: number;
  created_at: string;
}

/** Body de `PATCH /admin/reports/{id}`. */
export interface ReportStatusUpdate {
  status: string;
}

/** Reseña flagged devuelta por `GET /admin/reviews` (dict crudo del backend). */
export interface AdminReviewOut {
  id: string;
  match_id?: string;
  reviewer_id?: string;
  reviewee_id?: string;
  rating: number;
  comment?: string | null;
  flag?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Marca el tipo como usado para evitar lint de import no consumido. */
export type ReportRow = ReportOut;

/** Tipos para gestión admin de venues (GET/POST/PATCH /admin/venues*). */
export interface VenueOfferAdminOut {
  id: string;
  title: string;
  description: string;
  redemption_method: string;
  valid_from: string;
  valid_until: string;
  active: boolean;
}

export interface VenueAdminOut {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  status: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  created_at: string;
  offers: VenueOfferAdminOut[];
}

export interface VenueCreateInput {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
}

export interface VenueOfferCreateInput {
  title: string;
  description: string;
  redemption_method: string;
  valid_from: string;
  valid_until: string;
}
