// frontend/src/features/plans/pages/PlanDetailPage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { PlanDetailSheet } from '../components/PlanDetailSheet';
import { EditPlanSheet } from '../components/EditPlanSheet';
import { ApplySheet } from '../../matching/components/ApplySheet';
import { usePlan, useCancelPlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import { useAuth } from '../../../auth/useAuth';
import type { ApiError } from '../../../api/errors';
import type { PlanOut } from '../types';

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const gps = useUserLocation();
  const { data: plan, isLoading, isError, error, refetch } = usePlan(planId);
  const cancelPlan = useCancelPlan();
  const [showEdit, setShowEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showApply, setShowApply] = useState(false);

  const apiErr = error as ApiError | null;
  const isNotFound = apiErr?.status === 404 || apiErr?.code === 'not_found';

  if (isLoading) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center gap-2">
        <Spinner />
        <p className="text-sm text-gray-500">Cargando plan...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center p-6">
        {isNotFound ? (
          <ErrorState
            message="Este plan no existe o fue cancelado."
            onRetry={() => navigate('/explore', { replace: true })}
            retryLabel="Volver a explorar"
          />
        ) : (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudo cargar el plan'}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    );
  }

  if (!plan) return null;

  const isHost = auth.user?.id === plan.host.id;

  return (
    <div className="absolute inset-0">
      {/* Mini-mapa con la ubicación aproximada del plan */}
      <PlanDetailMap plan={plan} />

      {/* Back (top-left) */}
      <div className="absolute top-0 left-0 z-50 p-4 pt-safe-top">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-button w-9 h-9 rounded-full flex items-center justify-center text-gray-700"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <PlanDetailSheet
        plan={plan}
        userLocation={gps.location}
        isHost={isHost}
        onClose={() => navigate('/explore')}
        onEdit={() => setShowEdit(true)}
        onCancel={() => setConfirmCancel(true)}
        onApply={() => {
          if (!isHost) setShowApply(true);
        }}
      />

      {showEdit && (
        <EditPlanSheet
          plan={plan}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            // useUpdatePlan ya invalida ['plans', planId]; el refetch es automático.
          }}
        />
      )}

      {!isHost && showApply && (
        <ApplySheet
          planId={plan.id}
          planTitle={plan.title}
          onClose={() => setShowApply(false)}
          onApplied={() => {
            // useApply ya invalida ['my-applications'] y toastea.
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar plan?"
        message="Vas a cancelar este plan. Los participantes serán notificados. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        cancelLabel="No, volver"
        danger
        loading={cancelPlan.isPending}
        onConfirm={() => {
          cancelPlan.mutate(plan.id, {
            onSuccess: () => navigate('/explore', { replace: true }),
            onSettled: () => setConfirmCancel(false),
          });
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

/** Mini-mapa con la ubicación del plan (sin markers de otros planes). */
function PlanDetailMap({ plan }: { plan: PlanOut }) {
  return (
    <div className="absolute inset-0 z-0">
      <MapBackground
        userLocation={[plan.location_lat, plan.location_lng]}
        plans={[{ id: plan.id, lat: plan.location_lat, lng: plan.location_lng }]}
      />
    </div>
  );
}
