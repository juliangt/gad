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
  AdminUserDetailOut,
  AdminUserUpdateInput,
  AdminUserPlanItem,
  AdminUserReports,
  AdminUserReviews,
  ReportOut,
  ReportStatusUpdate,
  AdminReviewOut,
  VenueAdminOut,
  VenueCreateInput,
  VenueOfferCreateInput,
  AdminPlanListItem,
  AdminPlanDetailOut,
} from './types';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  reports: (status?: string) => ['admin', 'reports', { status }] as const,
  users: (status?: string, q?: string, isAdmin?: boolean) =>
    ['admin', 'users', { status, q, isAdmin }] as const,
  userDetail: (id: string) => ['admin', 'users', id] as const,
  userPlans: (id: string) => ['admin', 'users', id, 'plans'] as const,
  userReports: (id: string) => ['admin', 'users', id, 'reports'] as const,
  userReviews: (id: string) => ['admin', 'users', id, 'reviews'] as const,
  reviews: () => ['admin', 'reviews'] as const,
  venues: (status?: string) => ['admin', 'venues', { status }] as const,
  plans: (status?: string, q?: string) => ['admin', 'plans', { status, q }] as const,
  planDetail: (id: string) => ['admin', 'plans', id] as const,
  planApplications: (id: string) => ['admin', 'plans', id, 'applications'] as const,
  planMatches: (id: string) => ['admin', 'plans', id, 'matches'] as const,
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

export function useAdminUsers(status?: string, q?: string, isAdmin?: boolean) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(status, q, isAdmin),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserOut>>('/admin/users', {
        query: { status, q, is_admin: isAdmin, limit: PAGE_SIZE, before: pageParam },
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

export function useGrantAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/grant-admin`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Rol de admin otorgado.', 'No se pudo otorgar el rol.'),
  });
}

export function useRevokeAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<AdminUserOut>(`/admin/users/${userId}/revoke-admin`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ...userActionToast('Rol de admin revocado.', 'No se pudo revocar el rol.'),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<{ temporary_password: string }>(`/admin/users/${userId}/reset-password`),
    onError: () => toast.error('No se pudo restablecer la contraseña.'),
  });
}

export function useUpdateUserAdmin(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminUserUpdateInput) =>
      apiPatch<AdminUserDetailOut>(`/admin/users/${userId}`, input),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.userDetail(userId), updated);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Usuario actualizado.');
    },
    onError: () => toast.error('No se pudo actualizar el usuario.'),
  });
}

export function useAdminUserDetail(userId: string) {
  return useQuery({
    queryKey: adminKeys.userDetail(userId),
    queryFn: () => apiGet<AdminUserDetailOut>(`/admin/users/${userId}`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserPlans(userId: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.userPlans(userId),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminUserPlanItem>>(`/admin/users/${userId}/plans`, {
        query: { limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserReports(userId: string) {
  return useQuery({
    queryKey: adminKeys.userReports(userId),
    queryFn: () => apiGet<AdminUserReports>(`/admin/users/${userId}/reports`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useAdminUserReviews(userId: string) {
  return useQuery({
    queryKey: adminKeys.userReviews(userId),
    queryFn: () => apiGet<AdminUserReviews>(`/admin/users/${userId}/reviews`),
    enabled: Boolean(userId),
    staleTime: 30_000,
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

// ---------- Plans admin (SP2) ----------

export function useAdminPlans(status?: string, q?: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.plans(status, q),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<AdminPlanListItem>>('/admin/plans', {
        query: { status, q, limit: PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useAdminPlanDetail(planId: string) {
  return useQuery({
    queryKey: adminKeys.planDetail(planId),
    queryFn: () => apiGet<AdminPlanDetailOut>(`/admin/plans/${planId}`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminPlanApplications(planId: string) {
  return useQuery({
    queryKey: adminKeys.planApplications(planId),
    queryFn: () => apiGet<unknown[]>(`/admin/plans/${planId}/applications`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminPlanMatches(planId: string) {
  return useQuery({
    queryKey: adminKeys.planMatches(planId),
    queryFn: () => apiGet<unknown[]>(`/admin/plans/${planId}/matches`),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useAdminHidePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/hide`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Plan oculto.', 'No se pudo ocultar el plan.'),
  });
}

export function useAdminUnhidePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/unhide`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Plan visible.', 'No se pudo mostrar el plan.'),
  });
}

export function useAdminClosePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      apiPost<AdminPlanDetailOut>(`/admin/plans/${planId}/close`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      qc.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    ...userActionToast('Plan cerrado.', 'No se pudo cerrar el plan.'),
  });
}

export function useAdminCancelMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => apiPost<OKMessage>(`/admin/matches/${matchId}/cancel`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    ...userActionToast('Match cancelado.', 'No se pudo cancelar el match.'),
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

// ---------- Venues (sponsor management) ----------

export function useAdminVenues(status?: string) {
  return useQuery({
    queryKey: adminKeys.venues(status),
    queryFn: () =>
      apiGet<VenueAdminOut[]>('/admin/venues', {
        query: { status, limit: 100 },
      }),
    staleTime: 30_000,
  });
}

export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VenueCreateInput) => apiPost<VenueAdminOut>('/admin/venues', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'venues'] });
      toast.success('Venue creado.');
    },
    onError: () => toast.error('No se pudo crear el venue.'),
  });
}

export function useApproveVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/approve`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue aprobado.'),
    onError: () => toast.error('No se pudo aprobar el venue.'),
  });
}

export function usePauseVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/pause`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue pausado.'),
    onError: () => toast.error('No se pudo pausar el venue.'),
  });
}

export function useRevokeVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/revoke`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue revocado.'),
    onError: () => toast.error('No se pudo revocar el venue.'),
  });
}

export function useCreateVenueOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, input }: { venueId: string; input: VenueOfferCreateInput }) =>
      apiPost<VenueAdminOut>(`/admin/venues/${venueId}/offers`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'venues'] });
      toast.success('Oferta creada.');
    },
    onError: () => toast.error('No se pudo crear la oferta.'),
  });
}
