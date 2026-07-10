// frontend/src/features/safety/components/LiveTracker.tsx
import { useEffect, useState } from 'react';
import { MapPin, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../../components/ui/Badge';
import { usePing } from '../hooks';
import { useThrottledWatchPosition } from '../useThrottledWatchPosition';

export interface LiveTrackerProps {
  matchId: string;
  /** Throttle de pings en ms. Default 60000 (60s). */
  throttleMs?: number;
}

type Status = 'idle' | 'active' | 'denied' | 'error';

/**
 * Durante un match activo, envía POST /safety/{match_id}/ping con la
 * ubicación del usuario (vía watchPosition throttleado). Se activa al
 * montar y se detiene al desmontar.
 *
 * UX: muestra el estado (compartiendo / permiso denegado / error) y la
 * última posición enviada. Los errores de ping son no-fatales (log + toast
 * suave cada N fallos).
 */
export function LiveTracker({ matchId, throttleMs = 60_000 }: LiveTrackerProps) {
  const ping = usePing();
  const [status, setStatus] = useState<Status>('idle');
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  const { active, lastPosition, start, stop } = useThrottledWatchPosition({
    throttleMs,
    onPosition: (lat, lng) => {
      ping.mutate(
        { matchId, lat, lng },
        {
          onSuccess: () => setConsecutiveErrors(0),
          onError: (e) => {
            setConsecutiveErrors((n) => n + 1);
            // Solo tostar cada 3 fallos para no spamear.
            // eslint-disable-next-line no-console
            console.warn('[safety] ping failed', e);
          },
        },
      );
    },
    onError: (err) => {
      if (err.denied) {
        setStatus('denied');
        toast.error('Permiso de ubicación denegado. No podemos compartir tu ubicación.');
      } else {
        setStatus('error');
      }
    },
  });

  // Arrancar al montar, parar al desmontar.
  useEffect(() => {
    setStatus('active');
    start();
    return () => stop();
    // start/stop son estables vía useCallback; matchId/throttleMs definen la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, throttleMs]);

  useEffect(() => {
    if (consecutiveErrors > 0 && consecutiveErrors % 3 === 0) {
      toast.error('No estamos pudiendo actualizar tu ubicación. Revisá tu conexión.');
    }
  }, [consecutiveErrors]);

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Ubicación compartida</h2>
        </div>
        <TrackerBadge status={status} active={active} pending={ping.isPending} />
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        Estamos compartiendo tu ubicación con tu par cada {Math.round(throttleMs / 1000)}s mientras
        dure el encuentro. Cerrá esta pantalla para dejar de compartir.
      </p>
      {lastPosition && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5" />
          <span>
            Última: {lastPosition.lat.toFixed(5)}, {lastPosition.lng.toFixed(5)}
          </span>
        </div>
      )}
      {status === 'denied' && (
        <p className="mt-3 text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Habilitá el permiso de ubicación en tu navegador para activar el seguimiento.
        </p>
      )}
    </section>
  );
}

function TrackerBadge({
  status,
  active,
  pending,
}: {
  status: Status;
  active: boolean;
  pending: boolean;
}) {
  if (status === 'denied') {
    return (
      <Badge variant="danger">
        <AlertCircle className="w-3 h-3" /> Permiso denegado
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="warning">
        <AlertCircle className="w-3 h-3" /> Reintentando
      </Badge>
    );
  }
  if (pending) {
    return (
      <Badge variant="brand">
        <RefreshCw className="w-3 h-3 animate-spin" /> Enviando
      </Badge>
    );
  }
  if (active) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="w-3 h-3" /> Compartiendo
      </Badge>
    );
  }
  return <Badge variant="neutral">Inactivo</Badge>;
}
