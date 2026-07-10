// frontend/src/features/matching/pages/ApplicationsPage.tsx
// Vista host: GET /plans/{id}/applications (array directo) + aceptar/rechazar.
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Inbox } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ApplicationCard } from '../components/ApplicationCard';
import { useAccept, useApplications, useReject } from '../hooks';
import { usePlan } from '../../plans/hooks';
import type { ApiError } from '../../../api/errors';

export default function ApplicationsPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  const planQuery = usePlan(planId);
  const appsQuery = useApplications(planId);
  const accept = useAccept(planId ?? '');
  const reject = useReject(planId ?? '');

  const plan = planQuery.data;
  const applications = appsQuery.data ?? [];
  const pending = applications.filter((a) => a.status === 'pending');
  const decided = applications.filter((a) => a.status !== 'pending');

  const apiErr = appsQuery.error as ApiError | null;
  const isLoading = appsQuery.isLoading;

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">Postulaciones</h1>
          <p className="text-xs text-gray-500 truncate">
            {plan ? plan.title : 'Cargando plan...'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {isLoading && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Spinner />
            <p className="text-sm text-gray-500">Cargando postulaciones...</p>
          </div>
        )}

        {!isLoading && appsQuery.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar las postulaciones.'}
            onRetry={() => void appsQuery.refetch()}
          />
        )}

        {!isLoading && !appsQuery.isError && applications.length === 0 && (
          <EmptyState
            title="Todavía no hay postulaciones"
            description="Cuando alguien se postule a tu plan, aparecerá acá para que la aceptes o rechaces."
            icon={<Inbox className="w-8 h-8 text-gray-300" />}
          />
        )}

        {/* Pendientes primero */}
        {pending.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">
              Pendientes ({pending.length})
            </h2>
            {pending.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                actionLoading={accept.isPending || reject.isPending}
                onAccept={(id) => accept.mutate(id)}
                onReject={(id) => reject.mutate(id)}
              />
            ))}
          </section>
        )}

        {/* Ya decididas */}
        {decided.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Decididas</h2>
            {decided.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
