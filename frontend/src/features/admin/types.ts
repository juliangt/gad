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

/** `GET /admin/users/{id}` — detalle extendido de un usuario. */
export interface AdminUserDetailOut extends AdminUserOut {
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null;
  gender: string;
  locale: string;
  timezone: string;
  verification_level: string;
  last_active_at: string | null;
  google_id: string | null;
  plans_count: number;
  matches_count: number;
  reports_received: number;
  avg_rating: number;
}

/** Body de `PATCH /admin/users/{id}`. */
export interface AdminUserUpdateInput {
  display_name?: string;
  email?: string;
  locale?: string;
  timezone?: string;
  verification_level?: string;
}

/** `GET /admin/users/{id}/plans` — página de planes del usuario. */
export interface AdminUserPlansPage {
  items: AdminUserPlanItem[];
  next_cursor: string | null;
}

/** Item de `AdminUserPlansPage`. */
export interface AdminUserPlanItem {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  created_at: string;
  expires_at: string;
}

/** `GET /admin/users/{id}/reports` — reportes emitidos y recibidos. */
export interface AdminUserReports {
  filed: ReportOut[];
  received: ReportOut[];
}

/** `GET /admin/users/{id}/reviews` — reseñas emitidas y recibidas. */
export interface AdminUserReviews {
  given: AdminReviewOut[];
  received: AdminReviewOut[];
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

/** `GET /admin/plans` — ítem del listado admin de planes. */
export interface AdminPlanListItem {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  mode: string;
  host_id: string;
  host_name: string;
  current_participants: number;
  max_participants: number;
  created_at: string;
  expires_at: string;
  hidden_by_host: boolean;
}

/** `GET /admin/plans/{id}` — detalle admin de un plan (host sin anonimizar + ubicación del grid). */
export interface AdminPlanDetailOut {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  mode: string;
  scheduled_at: string | null;
  window_minutes: number;
  max_participants: number;
  current_participants: number;
  description: string | null;
  location_label: string;
  location_lat: number;
  location_lng: number;
  search_radius_m: number;
  expires_at: string;
  created_at: string;
  hidden_by_host: boolean;
  host_id: string;
  host_email: string;
  host_name: string;
}

/** GET /admin/settings/user-defaults */
export interface UserDefaultsOut {
  default_plan_validity_mins: number;
  default_search_radius_m: number;
  age_range_min: number;
  age_range_max: number;
  group_size_preference: string;
  gender_preference: string;
  activity_types: string[];
}

/** GET /admin/settings/operational */
export interface OperationalSettingsOut {
  rate_limit_enabled: boolean;
  default_rate_limit: string;
  access_token_expire_minutes: number;
  refresh_token_expire_days: number;
  max_avatar_bytes: number;
  ws_max_message_rate: number;
}

/** GET /admin/settings/feature-flags */
export interface FeatureFlagOut {
  key: string;
  enabled: boolean;
  description: string | null;
}

/** GET /admin/settings/maintenance */
export interface MaintenanceOut {
  enabled: boolean;
  message: string;
  banner_active: boolean;
  banner_message: string;
  banner_level: 'info' | 'warning';
  updated_by: string | null;
}

/** GET /admin/settings/audit */
export interface AuditEventOut {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
