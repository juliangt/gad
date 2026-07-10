import { useState } from 'react';
import { AdminNav } from '../components/AdminNav';
import { AdminUserRow } from '../components/AdminUserRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminUsers, useBanUser, useSuspendUser, useActivateUser } from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'deleted', label: 'Eliminados' },
];

export default function UsersAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const query = useAdminUsers(status);
  const ban = useBanUser();
  const suspend = useSuspendUser();
  const activate = useActivateUser();
  const busy = ban.isPending || suspend.isPending || activate.isPending;

  const users = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Usuarios</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div role="tablist" aria-label="Filtrar por estado" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md ${status === f.value ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {query.isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {query.isError && <ErrorState title="No se pudieron cargar los usuarios" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && users.length === 0 && (
          <EmptyState title="Sin usuarios" description="No hay usuarios con este filtro." />
        )}

        <ul className="space-y-2">
          {users.map((u) => (
            <AdminUserRow
              key={u.id}
              user={u}
              onBan={(id) => ban.mutate(id)}
              onSuspend={(id) => suspend.mutate(id)}
              onActivate={(id) => activate.mutate(id)}
              busy={busy}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
