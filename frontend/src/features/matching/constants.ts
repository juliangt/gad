// frontend/src/features/matching/constants.ts
import type { ApplicationStatus, MatchStatus } from './types';

export interface ApplicationStatusMeta {
  id: ApplicationStatus;
  label: string; // es-AR
  /** Clases tailwind para el badge de estado. */
  badgeClass: string;
}

/** Meta de los 4 estados de ApplicationStatus. */
export const APPLICATION_STATUS_META: Record<ApplicationStatus, ApplicationStatusMeta> = {
  pending: {
    id: 'pending',
    label: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  accepted: {
    id: 'accepted',
    label: 'Aceptada',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    id: 'rejected',
    label: 'Rechazada',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
  withdrawn: {
    id: 'withdrawn',
    label: 'Retirada',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

export interface MatchStatusMeta {
  id: MatchStatus;
  label: string;
  badgeClass: string;
}

/** Meta de los 3 estados de MatchStatus. */
export const MATCH_STATUS_META: Record<MatchStatus, MatchStatusMeta> = {
  active: {
    id: 'active',
    label: 'Activo',
    badgeClass: 'bg-brand-50 text-brand-600 border-brand-200',
  },
  completed: {
    id: 'completed',
    label: 'Finalizado',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  cancelled: {
    id: 'cancelled',
    label: 'Cancelado',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

/** Tamaño de página por defecto para listados paginados (matches, mis postulaciones). */
export const MATCHING_PAGE_SIZE = 50;
