// frontend/src/features/matching/pages/MyApplicationsPage.tsx
// Mis postulaciones: GET /me/applications paginado + retirar.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Inbox, MapPin } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { ConfirmActionDialog } from '../components/ConfirmActionDialog';
import { APPLICATION_STATUS_META } from '../constants';
import { useMyApplications, useWithdraw } from '../hooks';
import { formatRelativeTime } from '../../../lib/format';
import type { ApiError } from '../../../api/errors';
import type { ApplicationOut } from '../types';

export default function MyApplicationsPage() {
  const navigate = useNavigate();
  const query = useMyApplications();
  const withdraw = useWithdraw();
  const [pendingWithdraw, setPendingWithdraw] = useState<string | null>(null);

  const applications = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/me')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Mis postulaciones</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {query.isLoading && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Spinner />
            <p className="text-sm text-gray-500">Cargando tus postulaciones...</p>
          </div>
        )}

        {!query.isLoading && query.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar tus postulaciones.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && applications.length === 0 && (
          <EmptyState
            title="No tenés postulaciones"
            description="Explorá planes cercanos y postulate desde el detalle de un plan."
            icon={<Inbox className="w-8 h-8 text-gray-300" />}
            action={
              <Button variant="secondary" size="sm" onClick={() => navigate('/explore')}>
                Explorar planes
              </Button>
            }
          />
        )}

        {applications.map((app) => (
          <MyApplicationRow
            key={app.id}
            application={app}
            onOpenPlan={() => navigate(`/plans/${app.plan_id}`)}
            onWithdraw={() => setPendingWithdraw(app.id)}
          />
        ))}

        {query.hasNextPage && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? (
                <>
                  <Spinner size="sm" /> Cargando...
                </>
              ) : (
                'Cargar más'
              )}
            </Button>
          </div>
        )}
      </div>

      <ConfirmActionDialog
        open={pendingWithdraw !== null}
        title="¿Retirar postulación?"
        message="Si retirás tu postulación, el organizador ya no la verá como pendiente. Podés postularte de nuevo más adelante."
        confirmLabel="Sí, retirar"
        danger
        loading={withdraw.isPending}
        onConfirm={() => {
          if (pendingWithdraw) {
            withdraw.mutate(pendingWithdraw, {
              onSettled: () => setPendingWithdraw(null),
            });
          }
        }}
        onClose={() => setPendingWithdraw(null)}
      />
    </div>
  );
}

function MyApplicationRow({
  application,
  onOpenPlan,
  onWithdraw,
}: {
  application: ApplicationOut;
  onOpenPlan: () => void;
  onWithdraw: () => void;
}) {
  const meta = APPLICATION_STATUS_META[application.status];
  const a = application.applicant;

  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={a.display_name} src={a.avatar_url ?? undefined} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">
            Postulaste {formatRelativeTime(application.created_at)}
          </p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </div>

      {application.message && (
        <p className="text-sm text-gray-600 bg-gray-50/60 rounded-xl p-3 border border-gray-100">
          “{application.message}”
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenPlan}
          className="flex items-center gap-2 text-sm text-brand-600 font-medium active:scale-95"
        >
          <MapPin className="w-4 h-4" />
          Ver plan
          <ChevronRight className="w-4 h-4" />
        </button>

        {application.status === 'pending' && (
          <button
            type="button"
            onClick={onWithdraw}
            className="text-sm text-red-600 font-medium active:scale-95"
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  );
}
