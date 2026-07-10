import { useState } from 'react';
import { BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useDeleteAllNotifications } from '../hooks';
import { NotificationItem } from '../components/NotificationItem';
import { NotificationBell } from '../components/NotificationBell';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);

  const query = useNotifications(unreadOnly);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const deleteAll = useDeleteAllNotifications();

  const notifications = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Notificaciones</h1>
          <NotificationBell />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Filtros y acciones masivas */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div role="tablist" aria-label="Filtrar notificaciones" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              role="tab"
              aria-selected={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
              className={`px-3 py-1.5 text-sm rounded-md ${!unreadOnly ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              Todas
            </button>
            <button
              role="tab"
              aria-selected={unreadOnly}
              onClick={() => setUnreadOnly(true)}
              className={`px-3 py-1.5 text-sm rounded-md ${unreadOnly ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              No leídas
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || notifications.length === 0}
            >
              <CheckCheck className="w-4 h-4 mr-1" aria-hidden="true" /> Marcar todas
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteAll.mutate()}
              disabled={deleteAll.isPending || notifications.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-1" aria-hidden="true" /> Borrar todas
            </Button>
          </div>
        </div>

        {/* Lista */}
        {query.isLoading && (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        )}
        {query.isError && (
          <ErrorState
            title="No se pudieron cargar las notificaciones"
            onRetry={() => query.refetch()}
          />
        )}
        {!query.isLoading && !query.isError && notifications.length === 0 && (
          <EmptyState
            icon={<BellOff className="w-10 h-10 text-gray-400" aria-hidden="true" />}
            title={unreadOnly ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
            description="Cuando ocurra algo importante (match, mensajes, postulaciones) aparecerá aquí."
          />
        )}

        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationItem
                notification={n}
                onMarkRead={(id) => markRead.mutate(id)}
              />
            </li>
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
