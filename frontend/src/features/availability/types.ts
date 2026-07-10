/**
 * Tipos del dominio Availability (contrato §Disponibilidad).
 *
 * POST   /availability (activar modo disponible).
 * GET    /availability/me.
 * DELETE /availability/me.
 */
import type { ActivityType } from '../../types/enums';

export interface AvailabilityLocation {
  lat: number; // -90..90
  lng: number; // -180..180
}

export interface AvailabilityIn {
  location: AvailabilityLocation;
  /** 100..50000, default 2000. */
  radius_m?: number;
  activity_filter?: ActivityType[] | null;
  /** 15..1440, default 120. */
  window_minutes?: number;
}

export interface AvailabilityOut {
  id: string;
  radius_m: number;
  activity_filter: string[] | null;
  expires_at: string; // ISO 8601
  active: boolean;
  created_at: string; // ISO 8601
}
