/**
 * Hooks de datos para Reports.
 *
 * POST /users/{user_id}/report. Las mutaciones de reporte no invalidan
 * queries de dominio (el reporte es side-channel; no cambia lo que el
 * usuario ve de forma inmediata).
 */
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../api/client';
import type { ReportIn, ReportOut } from './types';

export interface ReportArgs {
  userId: string;
  reason: string;
  description?: string | null;
}

export function useReportUser() {
  return useMutation<ReportOut, Error, ReportArgs>({
    mutationFn: ({ userId, reason, description }) =>
      apiPost<ReportOut>(`/users/${userId}/report`, {
        reason,
        description: description ?? null,
      } satisfies ReportIn),
  });
}
