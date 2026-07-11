// frontend/src/features/venues/hooks.ts
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { fetchVenues } from './api';
import type { VenueListOut, VenuesQuery } from './types';

/**
 * GET /venues — venues sponsoreados cercanos. Auth required.
 *
 * `query` es `null` mientras no haya ubicación → la query queda
 * deshabilitada y no dispara requests sin lat/lng (que darían 422).
 * Mismo patrón que usePlans.
 */
export function useVenues(
  query: VenuesQuery | null,
  options?: Omit<UseQueryOptions<VenueListOut>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: query
      ? [
          'venues',
          {
            lat: query.lat,
            lng: query.lng,
            radius: query.radius,
            category: query.category,
          },
        ]
      : ['venues', 'disabled'],
    queryFn: () => fetchVenues(query!),
    enabled: query !== null,
    staleTime: 30_000,
    ...options,
  });
}
