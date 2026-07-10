// frontend/src/features/availability/components/AvailabilityToggle.tsx
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import {
  useAvailability,
  useSetAvailability,
  useDeleteAvailability,
} from '../hooks';
import { getCurrentPosition } from '../../../lib/geo';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime } from '../../../lib/format';
import type { ActivityType } from '../../../types/enums';

export interface AvailabilityToggleProps {
  /** Ubicación actual del usuario [lat, lng], si está disponible. */
  location: [number, number] | null;
  /** Radio de búsqueda en metros (default del usuario o 2000). */
  radiusM?: number;
  /** Filtro de actividades opcional. */
  activityFilter?: ActivityType[] | null;
  /** Ventana en minutos (default 120). */
  windowMinutes?: number;
}

/**
 * Toggle de modo "disponible ahora". Al activar pide GPS (si no hay location),
 * construye AvailabilityIn y POST /availability. Al desactivar DELETE /availability/me.
 *
 * Muestra el estado activo con countdown hacia expires_at.
 */
export function AvailabilityToggle({
  location,
  radiusM = 2000,
  activityFilter = null,
  windowMinutes = 120,
}: AvailabilityToggleProps) {
  const { data, isLoading } = useAvailability();
  const setAvail = useSetAvailability();
  const deleteAvail = useDeleteAvailability();
  const [now, setNow] = useState(() => Date.now());

  // Tick cada 60s para refrescar el countdown en pantalla.
  useEffect(() => {
    if (!data?.active) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [data?.active]);

  const active = data?.active === true;
  const remainingLabel = useMemo(() => {
    if (!data?.expires_at) return null;
    const expires = Date.parse(data.expires_at);
    const diff = expires - now;
    if (!Number.isFinite(diff) || diff <= 0) return 'Expirando…';
    const mins = Math.round(diff / 60_000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m restantes` : `${h}h restantes`;
    }
    return `${mins} min restantes`;
  }, [data?.expires_at, now]);

  const handleActivate = async () => {
    let coords = location;
    if (!coords) {
      try {
        const pos = await getCurrentPosition();
        coords = [pos.latitude, pos.longitude];
      } catch {
        toast.error(
          'Necesitamos tu ubicación para activar el modo disponible. Habilitá el permiso de GPS.',
        );
        return;
      }
    }
    const [lat, lng] = coords;
    try {
      await setAvail.mutateAsync({
        location: { lat, lng },
        radius_m: radiusM,
        activity_filter: activityFilter,
        window_minutes: windowMinutes,
      });
      toast.success('Modo disponible activado. Te avisaremos si hay planes cerca.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos activar el modo disponible.');
    }
  };

  const handleDeactivate = async () => {
    try {
      await deleteAvail.mutateAsync();
      toast.success('Modo disponible desactivado.');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast.error(apiErr?.detail ?? 'No pudimos desactivar el modo disponible.');
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-4 flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <section
      className={`glass-panel rounded-2xl p-4 transition ${
        active ? 'ring-2 ring-green-400/50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {active ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900">
              {active ? 'Estás disponible' : 'Modo disponible'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {active
                ? 'Recibirás alertas de planes y matches cercanos.'
                : 'Activá para recibir alertas de planes cerca ahora.'}
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={active}
            onChange={() => (active ? handleDeactivate() : handleActivate())}
            disabled={setAvail.isPending || deleteAvail.isPending}
            aria-label="Activar modo disponible"
          />
          <div className="w-12 h-7 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-6 after:h-6 after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {remainingLabel && (
            <Badge variant="success">
              <Clock className="w-3 h-3" /> {remainingLabel}
            </Badge>
          )}
          <Badge variant="neutral">
            <MapPin className="w-3 h-3" /> {Math.round((data?.radius_m ?? radiusM) / 1000)} km
          </Badge>
          {data?.expires_at && (
            <span className="text-xs text-gray-400 ml-auto">
              hasta {formatRelativeTime(data.expires_at)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
