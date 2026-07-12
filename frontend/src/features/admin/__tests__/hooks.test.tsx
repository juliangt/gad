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
  useAdminUsers,
  useGrantAdmin,
  useResetUserPassword,
  useUserDefaults,
  useUpdateFeatureFlag,
  useMaintenance,
} from '../hooks';

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
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

describe('useAdminUsers', () => {
  it('pasa q e is_admin en la query', async () => {
    (client.apiGet as any).mockResolvedValue({ items: [], next_cursor: null });
    const { result } = renderHook(() => useAdminUsers(undefined, 'ali', true), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiGet).toHaveBeenCalledWith('/admin/users', expect.objectContaining({
      query: expect.objectContaining({ q: 'ali', is_admin: true }),
    }));
  });
});

describe('useGrantAdmin', () => {
  it('pega al endpoint correcto', async () => {
    (client.apiPost as any).mockResolvedValue({ id: 'u1', is_admin: true });
    const { result } = renderHook(() => useGrantAdmin(), { wrapper: createWrapper() });
    await result.current.mutateAsync('u1');
    expect(client.apiPost).toHaveBeenCalledWith('/admin/users/u1/grant-admin');
  });
});

describe('useResetUserPassword', () => {
  it('devuelve contraseña temporal', async () => {
    (client.apiPost as any).mockResolvedValue({ temporary_password: 'TempPass12345678' });
    const { result } = renderHook(() => useResetUserPassword(), { wrapper: createWrapper() });
    const res = await result.current.mutateAsync('u1');
    expect(res.temporary_password).toBe('TempPass12345678');
  });
});

describe('useUserDefaults', () => {
  it('obtiene los defaults de usuario', async () => {
    (client.apiGet as any).mockResolvedValue({ default_plan_validity_mins: 120 });
    const { result } = renderHook(() => useUserDefaults(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.default_plan_validity_mins).toBe(120));
    expect(client.apiGet).toHaveBeenCalledWith('/admin/settings/user-defaults');
  });
});

describe('useUpdateFeatureFlag', () => {
  it('pega al endpoint de feature flag correcto', async () => {
    (client.apiPut as any).mockResolvedValue({ key: 'reviews', enabled: false });
    const { result } = renderHook(() => useUpdateFeatureFlag(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ key: 'reviews', enabled: false });
    expect(client.apiPut).toHaveBeenCalledWith('/admin/settings/feature-flags/reviews', { enabled: false });
  });
});

describe('useMaintenance', () => {
  it('lee el estado de mantenimiento', async () => {
    (client.apiGet as any).mockResolvedValue({ enabled: false, banner_active: false });
    const { result } = renderHook(() => useMaintenance(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.enabled).toBe(false));
    expect(client.apiGet).toHaveBeenCalledWith('/admin/settings/maintenance');
  });
});
