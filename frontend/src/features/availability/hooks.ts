/**
 * Hooks de datos (TanStack Query v5) para Availability.
 *
 * Query key: ['availability', 'me'].
 *
 * useAvailability usa refetchInterval corto (cada 30s) mientras está activa
 * para refrescar el countdown hacia expires_at y detectar expiración.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type { AvailabilityIn, AvailabilityOut } from './types';
import type { OKMessage } from '../../types/common';

type Invalidator = (keys: unknown[]) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return (keys) => qc.invalidateQueries({ queryKey: keys });
}

export function useAvailability() {
  return useQuery<AvailabilityOut | null>({
    queryKey: ['availability', 'me'],
    queryFn: () => apiGet<AvailabilityOut | null>('/availability/me'),
    refetchInterval: (query) => {
      // Refresca cada 30s solo mientras esté activa (para countdown + expiración).
      const data = query.state.data;
      return data?.active ? 30_000 : false;
    },
    staleTime: 15_000,
  });
}

export function useSetAvailability(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<AvailabilityOut, Error, AvailabilityIn>({
    mutationFn: (body) => apiPost<AvailabilityOut>('/availability', body),
    onSuccess: () => inv(['availability', 'me']),
  });
}

export function useDeleteAvailability(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<OKMessage, Error, void>({
    mutationFn: () => apiDelete<OKMessage>('/availability/me'),
    onSuccess: () => inv(['availability', 'me']),
  });
}
