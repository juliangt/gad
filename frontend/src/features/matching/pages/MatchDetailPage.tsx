// frontend/src/features/matching/pages/MatchDetailPage.tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MapPin, MessageCircle, Shield, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { MatchParticipantList } from '../components/MatchParticipantList';
import { ConfirmActionDialog } from '../components/ConfirmActionDialog';
import { MATCH_STATUS_META } from '../constants';
import { useAuth } from '../../../auth/useAuth';
import { useCancelMatch, useCompleteMatch, useMatch } from '../hooks';
import { formatDateTime } from '../../../lib/format';
import type { ApiError } from '../../../api/errors';

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: match, isLoading, isError, error, refetch } = useMatch(matchId);
  const complete = useCompleteMatch(matchId ?? '');
  const cancel = useCancelMatch(matchId ?? '');

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const apiErr = error as ApiError | null;
  const isNotFound = apiErr?.status === 404 || apiErr?.code === 'not_found';

  if (isLoading) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center gap-2">
        <Spinner />
        <p className="text-sm text-gray-500">Cargando match...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center p-6">
        {isNotFound ? (
          <ErrorState
            message="Este match no existe o no tenés acceso."
            onRetry={() => navigate('/matches', { replace: true })}
            retryLabel="Volver a matches"
          />
        ) : (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudo cargar el match'}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    );
  }

  if (!match) return null;

  const meta = MATCH_STATUS_META[match.status];
  const isActive = match.status === 'active';
  const hasExactLocation =
    match.exact_location_lat !== null && match.exact_location_lng !== null;
  const names = match.participants.map((p) => p.display_name).join(' · ');

  // F5 (chat) está fuera del scope: mostramos toast en lugar de navegar a una
  // ruta inexistente. F6 (safety) sí se implementará, así que navegamos.
  const openChat = () => {
    toast.info('El chat estará disponible pronto.');
  };

  const openSafety = () => {
    navigate(`/matches/${matchId}/safety`);
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/matches')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{names}</h1>
          <p className="text-xs text-gray-500">
            Inició {formatDateTime(match.started_at)}
          </p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Ubicación exacta */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Punto de encuentro
          </h2>
          {hasExactLocation ? (
            <div className="rounded-2xl overflow-hidden border border-gray-100 h-48">
              <MapBackground
                userLocation={[match.exact_location_lat!, match.exact_location_lng!]}
                plans={[
                  {
                    id: 'meet',
                    lat: match.exact_location_lat!,
                    lng: match.exact_location_lng!,
                  },
                ]}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 flex flex-col items-center justify-center text-center gap-2 bg-white">
              <MapPin className="w-6 h-6 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">
                Ubicación no disponible
              </p>
              <p className="text-xs text-gray-400">
                El organizador no fijó un punto exacto o todavía no tenés acceso.
              </p>
            </div>
          )}
        </section>

        {/* Participantes */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Participantes ({match.participants.length})
          </h2>
          <MatchParticipantList
            participants={match.participants}
            currentUserId={auth.user?.id}
          />
        </section>

        {/* Acciones rápidas: chat + safety (teasers de F5/F6) */}
        {isActive && (
          <section className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={openChat} className="flex-col h-auto py-4">
              <MessageCircle className="w-6 h-6 mb-1" />
              <span className="text-sm">Chat</span>
            </Button>
            <Button variant="ghost" onClick={openSafety} className="flex-col h-auto py-4">
              <Shield className="w-6 h-6 mb-1" />
              <span className="text-sm">Seguridad</span>
            </Button>
          </section>
        )}

        {/* Estado final */}
        {match.ended_at && (
          <p className="text-xs text-gray-500 text-center">
            {match.status === 'completed' ? 'Finalizado' : 'Cancelado'} el{' '}
            {formatDateTime(match.ended_at)}
          </p>
        )}

        {/* Acciones de cierre del match */}
        {isActive && (
          <section className="flex flex-col gap-2 mt-2">
            <Button onClick={() => setConfirmComplete(true)}>
              <Check className="w-5 h-5" />
              Finalizar match
            </Button>
            <Button variant="ghost" className="text-red-600" onClick={() => setConfirmCancel(true)}>
              <X className="w-5 h-5" />
              Cancelar match
            </Button>
          </section>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmComplete}
        title="¿Finalizar match?"
        message="Marcá el encuentro como finalizado. Esto habilita las reseñas del otro participante."
        confirmLabel="Sí, finalizar"
        loading={complete.isPending}
        onConfirm={() => {
          complete.mutate(matchId ?? '', {
            onSettled: () => setConfirmComplete(false),
          });
        }}
        onClose={() => setConfirmComplete(false)}
      />

      <ConfirmActionDialog
        open={confirmCancel}
        title="¿Cancelar match?"
        message="Si cancelás el match, no podrán seguir coordinando ni dejar reseñas. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        danger
        loading={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(matchId ?? '', {
            onSettled: () => setConfirmCancel(false),
          });
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}
