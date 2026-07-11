// frontend/src/features/plans/constants.ts
import {
  Coffee,
  Beer,
  Utensils,
  Footprints,
  Trees,
  CalendarHeart,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityType, PlanMode } from './types';

export interface ActivityMeta {
  id: ActivityType;
  label: string; // es-AR
  icon: LucideIcon;
  /** Tailwind bg/text para chip seleccionado. */
  activeClass: string;
}

/** Las 7 actividades del enum ActivityType (orden de UI). */
export const ACTIVITY_TYPES: ActivityMeta[] = [
  { id: 'coffee', label: 'Café', icon: Coffee, activeClass: 'bg-brown-50 text-brown-700 border-brown-200' },
  { id: 'drinks', label: 'Cerveza', icon: Beer, activeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'food', label: 'Comida', icon: Utensils, activeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'walk', label: 'Caminata', icon: Footprints, activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'park', label: 'Parque', icon: Trees, activeClass: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'event', label: 'Evento', icon: CalendarHeart, activeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'other', label: 'Otro', icon: MapPin, activeClass: 'bg-gray-100 text-gray-700 border-gray-200' },
];

/** Lookup rápido id → meta. */
export const ACTIVITY_META: Record<ActivityType, ActivityMeta> = Object.fromEntries(
  ACTIVITY_TYPES.map((a) => [a.id, a]),
) as Record<ActivityType, ActivityMeta>;

export interface PlanModeMeta {
  id: PlanMode;
  label: string;
}

export const PLAN_MODES: PlanModeMeta[] = [
  { id: 'now', label: 'Ahora' },
  { id: 'scheduled', label: 'Agendar' },
];

/** Valores por defecto del formulario de creación (alineados con el backend). */
export const PLAN_DEFAULTS = {
  activity_type: 'coffee' as ActivityType,
  mode: 'now' as PlanMode,
  window_minutes: 120,
  max_participants: 1,
  search_radius_m: 2000,
} as const;

/** Rate limit documentado: POST /plans → 10/hora. */
export const PLAN_CREATE_RATE_LIMIT_PER_HOUR = 10;
