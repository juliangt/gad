// frontend/src/features/matching/hooks.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '../../api/client';
import type { ApiError } from '../../api/errors';
import { MATCHING_PAGE_SIZE } from './constants';
import type {
  ApplicationIn,
  ApplicationList,
  ApplicationOut,
  CursorQuery,
  MatchOut,
  MatchesPage,
  MyApplicationsPage,
} from './types';

/** Serializa CursorQuery a opciones de apiGet. Omite undefined. */
function cursorParams(
  q: CursorQuery,
): { query: Record<string, number | string> } {
  const query: Record<string, number | string> = {
    limit: q.limit ?? MATCHING_PAGE_SIZE,
  };
  if (q.before) query.before = q.before;
  return { query };
}

/** Devuelve un mensaje es-AR según el code del ApiError. */
function errorMessage(err: unknown, fallback: string): string {
  const e = err as ApiError | null;
  if (!e) return fallback;
  switch (e.code) {
    case 'conflict':
      return 'Ya te habías postulado a este plan.';
    case 'validation_error':
      return e.detail ?? 'No se puede realizar esta acción sobre el plan.';
    case 'not_found':
      return 'El recurso no existe o ya no está disponible.';
    default:
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// Queries de lectura
// ---------------------------------------------------------------------------

/**
 * GET /plans/{id}/applications — lista de postulaciones a un plan propio (host).
 * Devuelve un **array directo** (ApplicationOut[]), NO paginado. Por eso useQuery.
 */
export function useApplications(planId: string | undefined) {
  return useQuery({
    queryKey: ['applications', planId],
    queryFn: () => apiGet<ApplicationList>(`/plans/${planId}/applications`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

/**
 * GET /me/applications — mis postulaciones, paginado por cursor.
 * next_cursor (ISO del último item) se pasa como `before` en la siguiente página.
 */
export function useMyApplications() {
  return useInfiniteQuery({
    queryKey: ['my-applications'],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<MyApplicationsPage>(
        '/me/applications',
        cursorParams({ before: pageParam }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MyApplicationsPage) =>
      lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * GET /matches — mis matches, paginado por cursor.
 */
export function useMatches() {
  return useInfiniteQuery({
    queryKey: ['matches'],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<MatchesPage>('/matches', cursorParams({ before: pageParam })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MatchesPage) =>
      lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/** GET /matches/{id} — detalle de un match. */
export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['matches', matchId],
    queryFn: () => apiGet<MatchOut>(`/matches/${matchId}`),
    enabled: Boolean(matchId),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

/**
 * POST /plans/{planId}/applications — postularse a un plan.
 * Errores esperados: 409 conflict (ya postulado), 422 validation_error (plan cerrado/propio).
 */
export function useApply(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationIn) =>
      apiPost<ApplicationOut>(`/plans/${planId}/applications`, input),
    onSuccess: () => {
      // El host todavía no la ve (está pendiente), pero invalidamos por si tenía
      // la pestaña abierta. El postulante la verá en "mis postulaciones".
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Te postulaste. El organizador revisará tu solicitud.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo enviar la postulación.'));
    },
  });
}

/**
 * POST /applications/{id}/accept — aceptar postulación (host).
 * Devuelve MatchOut | null: null si todavía no se alcanza max_participants.
 * Recibe planId para invalidar la lista correcta de aplicaciones.
 */
export function useAccept(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<MatchOut | null>(`/applications/${applicationId}/accept`),
    onSuccess: (match: MatchOut | null) => {
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      if (match) {
        toast.success('¡Se formó un match! Ya pueden coordinar el encuentro.');
      } else {
        toast.success('Postulación aceptada.');
      }
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo aceptar la postulación.'));
    },
  });
}

/** POST /applications/{id}/reject — rechazar postulación (host). */
export function useReject(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<{ message: string }>(`/applications/${applicationId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications', planId] });
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Postulación rechazada.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo rechazar la postulación.'));
    },
  });
}

/** DELETE /applications/{id} — retirar postulación propia. */
export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiDelete<{ message: string }>(`/applications/${applicationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] });
      toast.success('Postulación retirada.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo retirar la postulación.'));
    },
  });
}

/**
 * POST /matches/{id}/complete — finalizar match (participante).
 * Recibe matchId para invalidar el detalle además de la lista.
 */
export function useCompleteMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    // El id puede pasarse desde el caller (cae al mismo matchId del closure).
    mutationFn: (_id: string = matchId) =>
      apiPost<MatchOut>(`/matches/${matchId}/complete`),
    onSuccess: (updated: MatchOut) => {
      qc.setQueryData(['matches', matchId], updated);
      qc.invalidateQueries({ queryKey: ['matches', matchId] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Match finalizado. ¡Gracias por usar GAD!');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo finalizar el match.'));
    },
  });
}

/** POST /matches/{id}/cancel — cancelar match (participante). */
export function useCancelMatch(matchId: string) {
  const qc = useQueryClient();
  return useMutation({
    // El id puede pasarse desde el caller (cae al mismo matchId del closure).
    mutationFn: (_id: string = matchId) =>
      apiPost<MatchOut>(`/matches/${matchId}/cancel`),
    onSuccess: (updated: MatchOut) => {
      qc.setQueryData(['matches', matchId], updated);
      qc.invalidateQueries({ queryKey: ['matches', matchId] });
      qc.invalidateQueries({ queryKey: ['matches'] });
      toast.success('Match cancelado.');
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'No se pudo cancelar el match.'));
    },
  });
}
