import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface WatchError {
  denied: boolean;
  message: string;
}

export interface UseThrottledWatchPositionOptions {
  /** Callback invocado con cada posición NO throttleada. */
  onPosition: (lat: number, lng: number) => void;
  /** Callback de error (permiso denegado, etc). */
  onError?: (err: WatchError) => void;
  /** Intervalo mínimo entre emisiones al callback. Default 60000 (60s). */
  throttleMs?: number;
  /** Opciones de watchPosition. */
  watchOptions?: PositionOptions;
}

export interface UseThrottledWatchPositionResult {
  active: boolean;
  lastPosition: GeoCoords | null;
  start: () => void;
  stop: () => void;
}

/**
 * Envuelve navigator.geolocation.watchPosition y emite coordenadas al
 * callback throttleado a `throttleMs`. Los updates intermedios se ignoran,
 * pero se guarda el último como "pendiente" para flushearlo al detener.
 *
 * Pensado para el live-tracking de safety (ping cada 60s): GPS da updates
 * cada ~1-10s pero no queremos spamear el backend.
 *
 * El callback de posición puede ser stale; los consumers deben usar refs
 * propios para leer estado fresco dentro del callback si lo necesitan.
 */
export function useThrottledWatchPosition(
  options: UseThrottledWatchPositionOptions,
): UseThrottledWatchPositionResult {
  const { onPosition, onError, throttleMs = 60_000, watchOptions } = options;
  const [active, setActive] = useState(false);
  const [lastPosition, setLastPosition] = useState<GeoCoords | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);
  const pendingRef = useRef<GeoCoords | null>(null);
  const onPositionRef = useRef(onPosition);
  const onErrorRef = useRef(onError);

  // Mantener refs frescas sin re-arrancar el watch.
  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const emit = useCallback(
    (lat: number, lng: number) => {
      const coords: GeoCoords = { lat, lng };
      setLastPosition(coords);
      const now = Date.now();
      if (now - lastEmitRef.current >= throttleMs) {
        lastEmitRef.current = now;
        pendingRef.current = null;
        onPositionRef.current(lat, lng);
      } else {
        // Guardar como pendiente para flushear al detener.
        pendingRef.current = coords;
      }
    },
    [throttleMs],
  );

  const flushPending = useCallback(() => {
    if (pendingRef.current) {
      const { lat, lng } = pendingRef.current;
      pendingRef.current = null;
      lastEmitRef.current = Date.now();
      onPositionRef.current(lat, lng);
    }
  }, []);

  const start = useCallback(() => {
    if (active) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) {
      onErrorRef.current?.({ denied: false, message: 'Geolocalización no disponible.' });
      return;
    }
    lastEmitRef.current = 0;
    pendingRef.current = null;
    setActive(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => emit(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        onErrorRef.current?.({ denied, message: err.message || 'Error de ubicación.' });
        if (denied) {
          setActive(false);
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        }
      },
      watchOptions ?? { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }, [active, emit, watchOptions]);

  const stop = useCallback(() => {
    flushPending();
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setActive(false);
  }, [flushPending]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { active, lastPosition, start, stop };
}
