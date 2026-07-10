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
  NotificationOut,
  UnreadCountOut,
  VapidPublicKeyOut,
  PushSubscriptionIn,
  MarkedOut,
  DeletedOut,
} from './types';

/** Query keys jerárquicas del dominio. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', { unreadOnly }] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  vapid: () => ['notifications', 'vapid'] as const,
};

const PAGE_SIZE = 30;
/** Polling del badge cada 45s. */
const UNREAD_POLL_MS = 45_000;

/** Lista paginada por cursor (`before`). */
export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiGet<PaginatedOut<NotificationOut>>('/notifications', {
        query: {
          unread_only: unreadOnly ? true : undefined,
          limit: PAGE_SIZE,
          before: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

/** Badge: cuenta de no leídas. Polling + refetch on focus. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiGet<UnreadCountOut>('/notifications/unread/count'),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: UNREAD_POLL_MS,
  });
}

/** Marca una notificación como leída (PATCH). Optimista sobre la lista y el count. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch<OKMessage>(`/notifications/${id}/read`),
    onMutate: async (id: string) => {
      // Marca optimista en TODAS las variantes de lista (readOnly true/false).
      await qc.cancelQueries({ queryKey: ['notifications', 'list'] });
      const listQueries = qc.getQueriesData<PaginatedOut<NotificationOut>>({
        queryKey: ['notifications', 'list'],
      });
      for (const [key, data] of listQueries) {
        if (!data) continue;
        qc.setQueryData<PaginatedOut<NotificationOut>>(key, {
          ...data,
          items: data.items.map((n) =>
            n.id === id && n.read_at === null ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        });
      }
      // Decrementa el count optimista (mínimo 0).
      const count = qc.getQueryData<UnreadCountOut>(notificationKeys.unreadCount());
      if (count && count.count > 0) {
        qc.setQueryData<UnreadCountOut>(notificationKeys.unreadCount(), { count: count.count - 1 });
      }
      return { id };
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

/** Marca todas como leídas (POST read-all). */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<MarkedOut>('/notifications/read-all'),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(data.marked > 0 ? `${data.marked} marcadas como leídas` : 'No había notificaciones nuevas');
    },
    onError: () => toast.error('No se pudieron marcar las notificaciones.'),
  });
}

/** Borra todas las notificaciones del usuario (DELETE). */
export function useDeleteAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<DeletedOut>('/notifications'),
    onSuccess: (data) => {
      qc.setQueryData<PaginatedOut<NotificationOut>>(notificationKeys.list(false), {
        items: [],
        next_cursor: null,
      });
      qc.setQueryData<PaginatedOut<NotificationOut>>(notificationKeys.list(true), {
        items: [],
        next_cursor: null,
      });
      qc.setQueryData<UnreadCountOut>(notificationKeys.unreadCount(), { count: 0 });
      toast.success(`${data.deleted} notificaciones eliminadas`);
    },
    onError: () => toast.error('No se pudieron eliminar las notificaciones.'),
  });
}

/**
 * Lee la clave pública VAPID (público). Cache de la sesión.
 * `data.public_key === ""` significa que el backend no tiene VAPID configurado
 * → la feature push se omite silenciosamente.
 */
export function useVapidPublicKey() {
  return useQuery({
    queryKey: notificationKeys.vapid(),
    queryFn: () =>
      apiGet<VapidPublicKeyOut>('/notifications/vapid-public-key', {
        publicEndpoint: true,
      }),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Registra la suscripción push en el backend (POST /notifications/register).
 *
 * NOTA: el orquestador (pedir permiso + pushManager.subscribe) vive en `push.ts`,
 * que forma parte del alcance PWA/WebPush (omitido en esta fase). Este hook queda
 * disponible para cuando se incorpore `push.ts`; por ahora no se invoca desde la UI.
 */
export function useRegisterPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { subscription: PushSubscriptionIn }) => {
      return apiPost<OKMessage>('/notifications/register', vars.subscription);
    },
    onSuccess: () => {
      toast.success('Notificaciones push activadas.');
      qc.invalidateQueries({ queryKey: notificationKeys.vapid() });
    },
    onError: () => toast.error('No se pudieron activar las notificaciones push.'),
  });
}

/** Elimina la suscripción push del backend (DELETE /notifications/subscription?endpoint=). */
export function useUnregisterPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (endpoint?: string) => {
      return apiDelete<DeletedOut>('/notifications/subscription', {
        query: endpoint ? { endpoint } : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Notificaciones push desactivadas.');
      qc.invalidateQueries({ queryKey: notificationKeys.vapid() });
    },
    onError: () => toast.error('No se pudieron desactivar las notificaciones.'),
  });
}
