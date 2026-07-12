import { useState, useEffect } from 'react';
import { AdminNav } from '../components/AdminNav';
import { AdminUserRow } from '../components/AdminUserRow';
import { ResetPasswordModal } from '../components/ResetPasswordModal';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import {
  useAdminUsers,
  useBanUser,
  useSuspendUser,
  useActivateUser,
  useGrantAdmin,
  useRevokeAdmin,
  useResetUserPassword,
} from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'deleted', label: 'Eliminados' },
];

export default function UsersAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [isAdminFilter, setIsAdminFilter] = useState<boolean | undefined>(undefined);

  // debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useAdminUsers(status, debouncedQ || undefined, isAdminFilter);
  const ban = useBanUser();
  const suspend = useSuspendUser();
  const activate = useActivateUser();
  const grantAdmin = useGrantAdmin();
  const revokeAdmin = useRevokeAdmin();
  const resetPw = useResetUserPassword();
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const busy =
    ban.isPending ||
    suspend.isPending ||
    activate.isPending ||
    grantAdmin.isPending ||
    revokeAdmin.isPending ||
    resetPw.isPending;

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
        <Input placeholder="Buscar por email o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="flex flex-wrap items-center gap-2">
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
          <div role="group" aria-label="Filtrar por rol" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
            <button
              aria-pressed={isAdminFilter === undefined}
              onClick={() => setIsAdminFilter(undefined)}
              className={`px-3 py-1.5 text-sm rounded-md ${isAdminFilter === undefined ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              Todos
            </button>
            <button
              aria-pressed={isAdminFilter === true}
              onClick={() => setIsAdminFilter(true)}
              className={`px-3 py-1.5 text-sm rounded-md ${isAdminFilter === true ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'}`}
            >
              Admins
            </button>
          </div>
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
              onGrantAdmin={(id) => grantAdmin.mutate(id)}
              onRevokeAdmin={(id) => revokeAdmin.mutate(id)}
              onResetPassword={(id) => {
                setResetTarget(id);
                resetPw.mutate(id);
              }}
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

      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        temporaryPassword={resetPw.data?.temporary_password ?? null}
        loading={resetPw.isPending}
      />
    </div>
  );
}
