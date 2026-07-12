import { useState, useEffect } from 'react';
import { AdminNav } from '../components/AdminNav';
import { AdminPlanRow } from '../components/AdminPlanRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminPlans, useAdminHidePlan, useAdminUnhidePlan, useAdminClosePlan } from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'matched', label: 'Con match' },
  { value: 'closed', label: 'Cerrados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'expired', label: 'Expirados' },
];

export default function PlansAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useAdminPlans(status, debouncedQ || undefined);
  const hide = useAdminHidePlan();
  const unhide = useAdminUnhidePlan();
  const close = useAdminClosePlan();
  const busy = hide.isPending || unhide.isPending || close.isPending;

  const plans = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Planes</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <Input
          placeholder="Buscar por título, descripción o lugar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Filtrar por estado"
            className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit"
          >
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  status === f.value
                    ? 'bg-white shadow text-gray-900 font-medium'
                    : 'text-gray-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {query.isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}
        {query.isError && (
          <ErrorState title="No se pudieron cargar los planes" onRetry={() => query.refetch()} />
        )}
        {!query.isLoading && !query.isError && plans.length === 0 && (
          <EmptyState title="Sin planes" description="No hay planes con este filtro." />
        )}

        <ul className="space-y-2">
          {plans.map((p) => (
            <AdminPlanRow
              key={p.id}
              plan={p}
              onHide={(id) => hide.mutate(id)}
              onUnhide={(id) => unhide.mutate(id)}
              onClose={(id) => close.mutate(id)}
              busy={busy}
            />
          ))}
        </ul>

        {query.hasNextPage && (
          <div className="flex justify-center">
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
