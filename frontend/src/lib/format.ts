import { formatDistanceToNow, format as fnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Tiempo relativo en español (es): "hace 10 minutos", "hace alrededor de 4 horas".
 * `reference` es "ahora" por defecto (útil para tests con fake timers).
 */
export function formatRelativeTime(
  date: Date | string | number,
  reference: Date = new Date(),
): string {
  const d = new Date(date);
  const diffMs = reference.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'hace menos de un minuto';
  if (diffMin < 60) return `hace ${diffMin} minutos`;

  // >1h: usamos formatDistanceToNow con locale es, que aporta "hace X horas/días".
  // Nota: date-fns v4 no acepta baseDate; usa Date.now() internamente, que respeta
  // los fake timers de Vitest (vi.setSystemTime).
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
}

/**
 * Distancia en metros → "350 m" o "1,2 km" (coma decimal es-AR).
 */
export function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Puntaje de reputación → "4,9". "—" si falta o no es número.
 */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '—';
  return rating.toFixed(1).replace('.', ',');
}

/**
 * Fecha y hora absoluta en es: "10 de julio, 18:30".
 */
export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return fnsFormat(d, "d 'de' MMMM, HH:mm", { locale: es });
}
