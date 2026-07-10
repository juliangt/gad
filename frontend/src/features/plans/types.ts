// frontend/src/features/plans/types.ts
// Espejo de la sección "Planes (/plans)" de docs/API_CONTRACT.md.

import type { HostSummary } from '../../types/common';
import type {
  ActivityType,
  PlanMode,
  PlanStatus,
} from '../../types/enums';

// Re-export de enums para que las features consuman desde un único punto.
export type { ActivityType, PlanMode, PlanStatus } from '../../types/enums';

/** Subset del location válido para crear plan. */
export interface PlanLocationInput {
  lat: number; // -90..90
  lng: number; // -180..180
  label: string; // 1..200
}

/** Body de POST /plans  (PlanIn en el contrato). */
export interface PlanIn {
  activity_type: ActivityType;
  mode: PlanMode;
  scheduled_at: string | null; // ISO 8601; obligatorio si mode === 'scheduled'
  window_minutes: number; // 15..1440, default 120
  max_participants: number; // 1..10, default 1
  title: string; // 1..200
  description: string | null; // ..1000
  location: PlanLocationInput;
  search_radius_m: number; // 100..50000, default 2000
}

/** Body de PATCH /plans/{id} (PlanUpdateIn en el contrato). Todos opcionales. */
export interface PlanUpdateIn {
  title?: string; // 1..200
  description?: string | null; // ..1000
  scheduled_at?: string | null; // ISO 8601
}

/** Respuesta de GET /plans/{id}, POST /plans, PATCH /plans/{id}, DELETE /plans/{id}. */
export interface PlanOut {
  id: string;
  activity_type: ActivityType;
  mode: PlanMode;
  scheduled_at: string | null;
  window_minutes: number;
  max_participants: number;
  current_participants: number;
  title: string;
  description: string | null;
  location_label: string;
  location_lat: number;
  location_lng: number;
  search_radius_m: number;
  status: PlanStatus;
  expires_at: string;
  host: HostSummary;
  created_at: string;
}

/**
 * Item de GET /plans. El contrato documenta que `GET /plans` devuelve
 * `PlanListItem[]` (= `PlanOut[]`) SIN cursor — NO es PaginatedOut.
 * Por eso `usePlans` usa `useQuery` (array directo), no `useInfiniteQuery`.
 */
export type PlanListItem = PlanOut;

/** Filtros de UI aplicables a GET /plans. `lat`/`lng` son obligatorios. */
export interface PlansQuery {
  lat: number;
  lng: number;
  radius?: number; // metros, 100..50000, default 2000
  activity?: ActivityType;
  mode?: PlanMode;
}

/** Estado interno de la UI de filtros (incluye 'all' = sin filtro). */
export interface PlanFiltersState {
  activity: ActivityType | 'all';
  mode: PlanMode | 'all';
}
