/**
 * Hooks de datos (TanStack Query v5) para el dominio Safety.
 *
 * Query keys:
 *  - ['trusted-contacts']
 *  - ['safety', 'peer', matchId]
 *  - ['safety', 'share-link', matchId]
 *
 * El endpoint público GET /s/{token} NO pasa por el interceptor de auth
 * (publicEndpoint: true).
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type {
  TrustedContactOut,
  TrustedContactIn,
  PingIn,
  PeerLocationOut,
  ShareLinkOut,
  SosOut,
  PublicLocationOut,
} from './types';

/** Invalidador inyectable para los tests (evita acoplamiento al queryClient real). */
type Invalidator = (keys: unknown[]) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return (keys: unknown[]) => qc.invalidateQueries({ queryKey: keys });
}

// —— Trusted contacts ——

export function useTrustedContacts() {
  return useQuery<TrustedContactOut[]>({
    queryKey: ['trusted-contacts'],
    queryFn: () => apiGet<TrustedContactOut[]>('/me/trusted-contacts'),
    staleTime: 30_000,
  });
}

export function useAddTrustedContact(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<TrustedContactOut, Error, TrustedContactIn>({
    mutationFn: (body) => apiPost<TrustedContactOut>('/me/trusted-contacts', body),
    onSuccess: () => inv(['trusted-contacts']),
  });
}

export function useDeleteTrustedContact(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<{ message: string }, Error, string>({
    mutationFn: (contactId: string) =>
      apiDelete<{ message: string }>(`/me/trusted-contacts/${contactId}`),
    onSuccess: () => inv(['trusted-contacts']),
  });
}

// —— Pings de ubicación (live-tracking) ——

export interface PingArgs {
  matchId: string;
  lat: number;
  lng: number;
}

/**
 * POST /safety/{match_id}/ping. No invalida ninguna query: el live-tracking
 * es write-only desde el cliente; la ubicación del par se lee por polling
 * en usePeerLocation.
 *
 * Los errores de ping se manejan en LiveTracker (log + toast suave); no
 * rompen el flujo del match.
 */
export function usePing(invalidate?: Invalidator) {
  // Ping es write-only: NO invalida ninguna query (la ubicación del par se lee
  // por polling en usePeerLocation). El parámetro `invalidate` se acepta por
  // simetría con el resto de los hooks y para tests, pero no se invoca: el
  // live-tracking no debe disparar refetch en el cliente.
  void invalidate;
  return useMutation<{ message: string }, Error, PingArgs>({
    mutationFn: ({ matchId, lat, lng }) =>
      apiPost<{ message: string }>(`/safety/${matchId}/ping`, { lat, lng } satisfies PingIn),
  });
}

// —— Ubicación del par (polling) ——

export interface UsePeerLocationOptions {
  /** Si false, no consulta (p.ej. match no activo). */
  enabled?: boolean;
  /** Intervalo de refetch en ms. `false` = sin auto-refetch. Default 30000. */
  intervalMs?: number | false;
}

export function usePeerLocation(matchId: string, options: UsePeerLocationOptions = {}) {
  const { enabled = true, intervalMs = 30_000 } = options;
  const queryOptions: UseQueryOptions<PeerLocationOut> = {
    queryKey: ['safety', 'peer', matchId],
    queryFn: () => apiGet<PeerLocationOut>(`/safety/${matchId}/peer`),
    enabled: Boolean(matchId) && enabled,
    staleTime: 0,
  };
  if (intervalMs !== false) {
    (queryOptions as { refetchInterval?: number }).refetchInterval = intervalMs;
  }
  return useQuery<PeerLocationOut>(queryOptions);
}

// —— Share-link ——

export function useCreateShareLink(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<ShareLinkOut, Error, string>({
    mutationFn: (matchId: string) =>
      apiPost<ShareLinkOut>(`/safety/${matchId}/share-link`),
    onSuccess: (_data, matchId) => inv(['safety', 'share-link', matchId]),
  });
}

export interface RevokeShareLinkArgs {
  matchId: string;
  token: string;
}

export function useRevokeShareLink(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<{ message: string }, Error, RevokeShareLinkArgs>({
    mutationFn: ({ matchId, token }) =>
      apiDelete<{ message: string }>(`/safety/${matchId}/share-link`, {
        query: { token },
      }),
    onSuccess: (_data, { matchId }) => inv(['safety', 'share-link', matchId]),
  });
}

// —— SOS ——

export interface SosArgs {
  matchId: string;
  lat: number;
  lng: number;
}

export function useSos() {
  return useMutation<SosOut, Error, SosArgs>({
    mutationFn: ({ matchId, lat, lng }) =>
      apiPost<SosOut>(`/safety/${matchId}/sos`, { lat, lng } satisfies PingIn),
  });
}

// —— Vista pública /s/:token (SIN auth) ——

/**
 * GET /s/{token}. Endpoint PÚBLICO: marca publicEndpoint:true para evitar
 * el interceptor de 401→refresh y el header Bearer.
 *
 * No usa refetchInterval por defecto (la vista pública es pasiva); el
 * componente puede forzar refetch manualmente.
 */
export function usePublicLocation(token: string) {
  return useQuery<PublicLocationOut>({
    queryKey: ['public-location', token],
    queryFn: () => apiGet<PublicLocationOut>(`/s/${token}`, { publicEndpoint: true }),
    enabled: Boolean(token),
    retry: false, // 401/404 son terminales para la vista pública
    staleTime: 15_000,
  });
}
