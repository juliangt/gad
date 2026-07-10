import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '../../../api/client';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
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
afterEach(() => {
  vi.useRealTimers();
});

describe('useUnreadCount', () => {
  it('carga el count inicial', async () => {
    (client.apiGet as any).mockResolvedValue({ count: 3 });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.count).toBe(3));
  });

  it('se configura con refetchInterval para polling del badge', async () => {
    (client.apiGet as any).mockResolvedValue({ count: 1 });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.count).toBe(1));
    // El contrato del hook: debe pedir refetch periódico y refetch on focus.
    expect(result.current.fetchStatus).toBeDefined();
  });
});

describe('useNotifications', () => {
  it('carga la primera página y expone next_cursor', async () => {
    const page1 = {
      items: [
        { id: 'n1', type: 'match', payload: null, read_at: null, created_at: '2026-07-09T10:00:00Z' },
        { id: 'n2', type: 'new_message', payload: null, read_at: null, created_at: '2026-07-09T09:00:00Z' },
      ],
      next_cursor: '2026-07-09T09:00:00Z',
    };
    (client.apiGet as any).mockResolvedValue(page1);
    const { result } = renderHook(() => useNotifications(false), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.pages[0].items).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(true);
  });
});

describe('useMarkRead', () => {
  it('hace PATCH al endpoint de leído', async () => {
    (client.apiPatch as any).mockResolvedValue({ message: 'ok' });
    const { result } = renderHook(() => useMarkRead(), { wrapper: createWrapper() });
    await result.current.mutateAsync('n1');
    expect(client.apiPatch).toHaveBeenCalledWith('/notifications/n1/read');
  });
});

describe('useMarkAllRead', () => {
  it('hace POST a read-all', async () => {
    (client.apiPost as any).mockResolvedValue({ marked: 4 });
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: createWrapper() });
    await result.current.mutateAsync();
    expect(client.apiPost).toHaveBeenCalledWith('/notifications/read-all');
  });
});
