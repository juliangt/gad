// frontend/src/features/plans/hooks.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client';
import { toast } from 'sonner';
import {
  PLAN_CREATE_RATE_LIMIT_PER_HOUR,
} from './constants';
import type {
  MyPlansPage,
  PlanIn,
  PlanListItem,
  PlanOut,
  PlansQuery,
} from './types';

/** Query params numéricos como espera el wrapper api/client ({ query }). */
function toQuery(q: PlansQuery): Record<string, number | string> {
  const params: Record<string, number | string> = { lat: q.lat, lng: q.lng };
  if (q.radius !== undefined) params.radius = q.radius;
  if (q.activity) params.activity = q.activity;
  if (q.mode) params.mode = q.mode;
  return params;
}

/**
 * GET /plans — devuelve un array directo (PlanListItem[]), NO paginado.
 * El contrato API documenta que /plans no usa cursor; por eso useQuery y no
 * useInfiniteQuery. Si en el futuro el backend añade cursor, migrar aquí.
 *
 * `query` es `null` mientras no haya ubicación del usuario → la query queda
 * deshabilitada y no dispara requests sin lat/lng (que darían 422).
 */
export function usePlans(
  query: PlansQuery | null,
  options?: Omit<UseQueryOptions<PlanListItem[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: query
      ? ['plans', { lat: query.lat, lng: query.lng, radius: query.radius, activity: query.activity, mode: query.mode }]
      : ['plans', 'disabled'],
    queryFn: () =>
      apiGet<PlanListItem[]>('/plans', { query: toQuery(query!) }),
    enabled: query !== null,
    staleTime: 30_000,
    ...options,
  });
}

/** GET /me/plans — mis planes creados, paginado por cursor. */
export function useMyPlans() {
  return useInfiniteQuery({
    queryKey: ['me', 'plans'],
    queryFn: ({ pageParam }: { pageParam?: string }) => {
      const query: Record<string, number | string> = { limit: 50 };
      if (pageParam) query.before = pageParam;
      return apiGet<MyPlansPage>('/me/plans', { query });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MyPlansPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/** GET /plans/{id} */
export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: ['plans', planId],
    queryFn: () => apiGet<PlanOut>(`/plans/${planId}`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

/** POST /plans — rate limit documentado 10/hora (manejado vía 429). */
export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanIn) => apiPost<PlanOut>('/plans', input),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(`Plan "${plan.title}" publicado`);
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'rate_limit_exceeded') {
        toast.error(
          `Alcanzaste el límite de ${PLAN_CREATE_RATE_LIMIT_PER_HOUR} planes por hora. Intentá más tarde.`,
        );
      } else {
        toast.error('No se pudo publicar el plan. Intentá de nuevo.');
      }
    },
  });
}

/** PATCH /plans/{id} — solo host. Acepta el plan completo (PlanIn). */
export function useUpdatePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<PlanIn>) =>
      apiPatch<PlanOut>(`/plans/${planId}`, input),
    onSuccess: (plan) => {
      qc.setQueryData(['plans', planId], plan);
      qc.invalidateQueries({ queryKey: ['plans', planId] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['me', 'plans'] });
      toast.success('Plan actualizado');
    },
    onError: () => toast.error('No se pudo actualizar el plan.'),
  });
}

/** DELETE /plans/{id} — cancela y oculta el plan del host (soft-delete). */
export function useCancelPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiDelete<PlanOut>(`/plans/${planId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'plans'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan eliminado');
    },
    onError: () => toast.error('No se pudo eliminar el plan.'),
  });
}
