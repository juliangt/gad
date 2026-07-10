import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '../../../api/client';
import {
  useAdminStats,
  useAdminReports,
  useUpdateReportStatus,
  useBanUser,
} from '../hooks';

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useAdminStats', () => {
  it('carga las métricas', async () => {
    (client.apiGet as any).mockResolvedValue({
      total_users: 10,
      total_plans: 5,
      total_matches: 3,
      open_reports: 2,
    });
    const { result } = renderHook(() => useAdminStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.total_users).toBe(10));
  });
});

describe('useAdminReports', () => {
  it('carga la primera página de reportes con el filtro de estado', async () => {
    (client.apiGet as any).mockResolvedValue({
      items: [
        { id: 'r1', reporter_id: 'u1', reported_id: 'u2', reason: 'spam', description: null, status: 'open', payload: null, created_at: '2026-07-09T10:00:00Z' },
      ],
      next_cursor: null,
    });
    const { result } = renderHook(() => useAdminReports('open'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.pages[0].items).toHaveLength(1));
    expect(client.apiGet).toHaveBeenCalledWith(
      '/admin/reports',
      expect.objectContaining({ query: expect.objectContaining({ status: 'open' }) }),
    );
  });
});

describe('useUpdateReportStatus', () => {
  it('hace PATCH al reporte con el nuevo status', async () => {
    (client.apiPatch as any).mockResolvedValue({
      id: 'r1', reporter_id: 'u1', reported_id: 'u2', reason: 'spam', description: null, status: 'resolved', payload: null, created_at: '2026-07-09T10:00:00Z',
    });
    const { result } = renderHook(() => useUpdateReportStatus(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ id: 'r1', status: 'resolved' });
    expect(client.apiPatch).toHaveBeenCalledWith('/admin/reports/r1', { status: 'resolved' });
  });
});

describe('useBanUser', () => {
  it('hace POST al ban', async () => {
    (client.apiPost as any).mockResolvedValue({
      id: 'u2', email: 'a@b.com', display_name: 'A', status: 'suspended', is_admin: false, reputation_score: 0, created_at: '2026-07-01T00:00:00Z',
    });
    const { result } = renderHook(() => useBanUser(), { wrapper: createWrapper() });
    await result.current.mutateAsync('u2');
    expect(client.apiPost).toHaveBeenCalledWith('/admin/users/u2/ban');
  });
});
