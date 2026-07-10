import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import { toast } from 'sonner';
import type { PaginatedOut, OKMessage } from '../../types/common';
import type {
  AdminStatsOut,
  AdminUserOut,
  ReportOut,
  ReportStatusUpdate,
  AdminReviewOut,
} from './types';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  reports: (status?: string) => ['admin', 'reports', { status }] as const,
  users: (status?: string) => ['admin', 'users', { status }] as const,
  reviews: () => ['admin', 'reviews'] as const,
};

const PAGE_SIZE = 50;

// ---------- Stats ----------

export function useAdminStats(enabled = true) {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => apiGet<AdminStatsOut>('/admin/stats'),
    enabled,
    staleTime: 60_000,
  });
}

// ---------- Reports ----------

export function useAdminReports(status?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.reports(status),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<ReportOut>>('/admin/reports', {
        query: { status, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useUpdateReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<ReportOut>(`/admin/reports/${id}`, { status } satisfies ReportStatusUpdate),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
      toast.success(`Reporte marcado como "${updated.status}".`);
    },
    onError: () => toast.error('No se pudo actualizar el reporte.'),
  });
}

// ---------- Users ----------

export function useAdminUsers(status?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(status),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserOut>>('/admin/users', {
        query: { status, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

function userActionToast(ok: string, err: string) {
  return {
    onSuccess: () => {
      toast.success(ok);
    },
    onError: () => toast.error(err),
  };
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/ban`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario baneado.', 'No se pudo banear al usuario.'),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/suspend`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario suspendido.', 'No se pudo suspender al usuario.'),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/activate`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Usuario reactivado.', 'No se pudo reactivar al usuario.'),
  });
}

// ---------- Plans (cancelación por moderación) ----------

export function useAdminCancelPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost<OKMessage>(`/admin/plans/${planId}/cancel`),
    onSuccess: () => {
      toast.success('Plan cancelado por moderación.');
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: () => toast.error('No se pudo cancelar el plan.'),
  });
}

// ---------- Reviews (moderación) ----------

export function useAdminReviews() {
  return useInfiniteQuery({
    queryKey: adminKeys.reviews(),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminReviewOut>>('/admin/reviews', {
        query: { limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useAdminDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => apiDelete<OKMessage>(`/admin/reviews/${reviewId}`),
    onSuccess: () => {
      toast.success('Reseña eliminada por moderación.');
      qc.invalidateQueries({ queryKey: adminKeys.reviews() });
    },
    onError: () => toast.error('No se pudo eliminar la reseña.'),
  });
}
