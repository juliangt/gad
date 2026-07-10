import { useState } from 'react';
import { AdminNav } from '../components/AdminNav';
import { ReportRow } from '../components/ReportRow';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminReports, useUpdateReportStatus } from '../hooks';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'closed', label: 'Cerrados' },
];

export default function ReportsAdminPage() {
  const [status, setStatus] = useState<string | undefined>('open');
  const query = useAdminReports(status);
  const update = useUpdateReportStatus();

  const reports = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Reportes</h1>
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
        {query.isError && <ErrorState title="No se pudieron cargar los reportes" onRetry={() => query.refetch()} />}
        {!query.isLoading && !query.isError && reports.length === 0 && (
          <EmptyState title="Sin reportes" description="No hay reportes con este filtro." />
        )}

        <ul className="space-y-2">
          {reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              onStatusChange={(id, st) => update.mutate({ id, status: st })}
              disabled={update.isPending}
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
