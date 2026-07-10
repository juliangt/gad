// frontend/src/features/safety/components/PeerLocation.tsx
import { AlertCircle, Clock, MapPin } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { usePeerLocation } from '../hooks';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime } from '../../../lib/format';

export interface PeerLocationProps {
  matchId: string;
  /** Habilitar/deshabilitar polling (p.ej. solo si match activo). */
  enabled?: boolean;
  /** Intervalo de polling en ms. Default 30000. */
  intervalMs?: number;
}

/**
 * Muestra la ubicación del par (GET /safety/{match_id}/peer, polling 30s)
 * sobre MapBackground. Si el par no compartió ubicación (lat/lng null),
 * muestra un estado informativo.
 */
export function PeerLocation({ matchId, enabled = true, intervalMs = 30_000 }: PeerLocationProps) {
  const { data, isLoading, isError, error, refetch } = usePeerLocation(matchId, {
    enabled,
    intervalMs,
  });

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Ubicación de tu par</h2>
        </div>
        {data?.last_ping_at && (
          <Badge variant="neutral">
            <Clock className="w-3 h-3" /> {formatRelativeTime(data.last_ping_at)}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {isError && (() => {
        const apiErr = error instanceof ApiError ? error : null;
        // 422 validation_error: no participante.
        if (apiErr?.status === 422) {
          return (
            <ErrorState
              title="No podés ver esta ubicación"
              message="Solo los participantes del match pueden ver la ubicación del par."
            />
          );
        }
        return <ErrorState message={apiErr?.detail} onRetry={() => refetch()} />;
      })()}

      {!isLoading && !isError && data && (
        <>
          {data.lat === null || data.lng === null ? (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                Tu par todavía no compartió su ubicación.
              </p>
              {data.last_ping_at && (
                <p className="text-xs text-gray-400 mt-1">
                  Última actualización: {formatRelativeTime(data.last_ping_at)}
                </p>
              )}
            </div>
          ) : (
            <div className="relative h-48 rounded-xl overflow-hidden border border-gray-100">
              <MapBackground
                userLocation={[data.lat, data.lng]}
                plans={[{ id: 'peer', lat: data.lat, lng: data.lng }]}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
