// frontend/src/features/plans/useUserLocation.ts
import { useCallback, useState } from 'react';
import { getCurrentPosition } from '../../lib/geo';

export type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export interface UseUserLocationResult {
  status: GpsStatus;
  /** [lat, lng] o null. */
  location: [number, number] | null;
  error: Error | null;
  /** Pide permiso y lee la posición. No lanza: captura a estado `denied`. */
  request: () => Promise<void>;
  /** Fallback manual (input de barrio → coords resueltas externamente). */
  setManualLocation: (lat: number, lng: number) => void;
  reset: () => void;
}

export function useUserLocation(): UseUserLocationResult {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const request = useCallback(async () => {
    setStatus('requesting');
    setError(null);
    try {
      // getCurrentPosition devuelve { latitude, longitude, accuracy }.
      const pos = await getCurrentPosition();
      setLocation([pos.latitude, pos.longitude]);
      setStatus('granted');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('denied');
    }
  }, []);

  const setManualLocation = useCallback((lat: number, lng: number) => {
    setLocation([lat, lng]);
    setError(null);
    setStatus('granted');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setLocation(null);
    setError(null);
  }, []);

  return { status, location, error, request, setManualLocation, reset };
}
