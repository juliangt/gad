// frontend/src/features/plans/pages/PlansPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ChevronRight, Plus, MapPin } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Avatar } from '../../../components/ui/Avatar';
import { EditPlanSheet } from '../components/EditPlanSheet';
import { MyPlanCard } from '../components/MyPlanCard';
import { useCancelPlan, useMyPlans } from '../hooks';
import { useMyApplications, useWithdraw } from '../../matching/hooks';
import { APPLICATION_STATUS_META } from '../../matching/constants';
import { formatRelativeTime } from '../../../lib/format';
import type { ApiError } from '../../../api/errors';
import type { MyPlanItem } from '../types';

type Tab = 'created' | 'applications';

export default function PlansPage() {
  const [tab, setTab] = useState<Tab>('created');
  return (
    <div className="w-full min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="px-4 pt-6 pb-3 bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
        <div className="flex gap-2 mt-4">
          <TabButton active={tab === 'created'} onClick={() => setTab('created')}>
            Creados por mí
          </TabButton>
          <TabButton active={tab === 'applications'} onClick={() => setTab('applications')}>
            Postulaciones
          </TabButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        {tab === 'created' ? <CreatedPlansTab /> : <ApplicationsTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function CreatedPlansTab() {
  const navigate = useNavigate();
  const query = useMyPlans();
  const cancelPlan = useCancelPlan();
  const [editing, setEditing] = useState<MyPlanItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MyPlanItem | null>(null);

  const plans = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  return (
    <div className="flex flex-col gap-3">
      {query.isLoading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Spinner />
          <p className="text-sm text-gray-500">Cargando tus planes...</p>
        </div>
      )}

      {!query.isLoading && query.isError && (
        <ErrorState
          message={apiErr?.detail ?? 'No se pudieron cargar tus planes.'}
          onRetry={() => void query.refetch()}
        />
      )}

      {!query.isLoading && !query.isError && plans.length === 0 && (
        <EmptyState
          title="Todavía no creaste ningún plan"
          description="Publicá un plan y encontrá compañía cercana para una salida casual."
          icon={<ClipboardList className="w-8 h-8 text-gray-300" />}
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/plans/new')}>
              <Plus className="w-4 h-4" /> Crear plan
            </Button>
          }
        />
      )}

      {plans.map((plan) => (
        <MyPlanCard
          key={plan.id}
          plan={plan}
          onEdit={(p) => setEditing(p)}
          onDelete={(p) => setPendingDelete(p)}
        />
      ))}

      {editing && (
        <EditPlanSheet
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este plan?"
        message="Se cancelará y dejará de ser visible para otros. Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar"
        danger
        loading={cancelPlan.isPending}
        onConfirm={() => {
          if (pendingDelete) {
            cancelPlan.mutate(pendingDelete.id, {
              onSettled: () => setPendingDelete(null),
            });
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ApplicationsTab() {
  const navigate = useNavigate();
  const query = useMyApplications();
  const withdraw = useWithdraw();
  const [pendingWithdraw, setPendingWithdraw] = useState<string | null>(null);

  const applications = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  return (
    <div className="flex flex-col gap-3">
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
          icon={<ClipboardList className="w-8 h-8 text-gray-300" />}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/explore')}>
              Explorar planes
            </Button>
          }
        />
      )}

      {applications.map((app) => {
        const meta = APPLICATION_STATUS_META[app.status];
        const a = app.applicant;
        return (
          <div key={app.id} className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={a.display_name} src={a.avatar_url ?? undefined} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">
                  Postulaste {formatRelativeTime(app.created_at)}
                </p>
              </div>
              <Badge className={meta.badgeClass}>{meta.label}</Badge>
            </div>

            {app.message && (
              <p className="text-sm text-gray-600 bg-gray-50/60 rounded-xl p-3 border border-gray-100">
                "{app.message}"
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigate(`/plans/${app.plan_id}`)}
                className="flex items-center gap-2 text-sm text-brand-600 font-medium active:scale-95"
              >
                <MapPin className="w-4 h-4" />
                Ver plan
                <ChevronRight className="w-4 h-4" />
              </button>

              {app.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => setPendingWithdraw(app.id)}
                  className="text-sm text-red-600 font-medium active:scale-95"
                >
                  Retirar
                </button>
              )}
            </div>
          </div>
        );
      })}

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

      <ConfirmDialog
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
