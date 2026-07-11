// frontend/src/features/venues/api.ts
import { apiGet } from '../../api/client';
import type { VenueListOut, VenuesQuery } from './types';

/** Query params numéricos como espera el wrapper api/client ({ query }). */
function toQuery(q: VenuesQuery): Record<string, number | string> {
  const params: Record<string, number | string> = { lat: q.lat, lng: q.lng };
  if (q.radius !== undefined) params.radius = q.radius;
  if (q.category) params.category = q.category;
  if (q.limit !== undefined) params.limit = q.limit;
  return params;
}

/** GET /venues — venues sponsoreados cercanos (auth required). */
export function fetchVenues(q: VenuesQuery): Promise<VenueListOut> {
  return apiGet<VenueListOut>('/venues', { query: toQuery(q) });
}
