// frontend/src/features/venues/types.ts
import type {
  ActivityType,
  OfferRedemption,
} from '../../types/enums';

export type { ActivityType, OfferRedemption, VenueStatus } from '../../types/enums';

/** Offer vigente devuelto en GET /venues (solo incluye las no expiradas). */
export interface VenueOfferOut {
  id: string;
  title: string;
  description: string;
  redemption_method: OfferRedemption;
  valid_from: string;
  valid_until: string;
}

/** Item de GET /venues. */
export interface VenueListItem {
  id: string;
  name: string;
  category: ActivityType;
  address: string;
  lat: number;
  lng: number;
  distance_m: number | null;
  offers: VenueOfferOut[];
}

/** Respuesta de GET /venues. */
export interface VenueListOut {
  items: VenueListItem[];
  count: number;
}

/** Query params de GET /venues. lat/lng obligatorios. */
export interface VenuesQuery {
  lat: number;
  lng: number;
  radius?: number;
  category?: ActivityType;
  limit?: number;
}
