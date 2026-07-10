/** Radio medio de la Tierra en metros (WGS84). */
const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Distancia Haversine en metros entre dos puntos (lat/lng en grados).
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Envuelve `navigator.geolocation.getCurrentPosition` en una Promise con
 * timeout (10s por defecto). Rechaza si se deniega el permiso, si hay un
 * error de posición, o si vence el timeout.
 */
export function getCurrentPosition(timeoutMs = 10_000): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('La geolocalización no está disponible en este dispositivo.'));
      return;
    }

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('No pudimos obtener tu ubicación a tiempo.'));
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Necesitamos permiso de ubicación para mostrarte planes cerca.'
              : 'No pudimos obtener tu ubicación.',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
