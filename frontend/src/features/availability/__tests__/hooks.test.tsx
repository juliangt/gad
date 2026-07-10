import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import * as client from '../../../api/client';
import {
  useAvailability,
  useSetAvailability,
  useDeleteAvailability,
} from '../hooks';
import type { AvailabilityOut } from '../types';

vi.spyOn(client, 'apiGet');
vi.spyOn(client, 'apiPost');
vi.spyOn(client, 'apiDelete');

const mocked = {
  apiGet: vi.mocked(client.apiGet),
  apiPost: vi.mocked(client.apiPost),
  apiDelete: vi.mocked(client.apiDelete),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const AVAIL: AvailabilityOut = {
  id: 'a1',
  radius_m: 2000,
  activity_filter: ['coffee'],
  expires_at: '2026-07-09T20:00:00Z',
  active: true,
  created_at: '2026-07-09T18:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('useAvailability', () => {
  it('GET /availability/me', async () => {
    mocked.apiGet.mockResolvedValueOnce(AVAIL);
    const { result } = renderHook(() => useAvailability(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiGet).toHaveBeenCalledWith('/availability/me');
  });

  it('acepta null (sin disponibilidad activa)', async () => {
    mocked.apiGet.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAvailability(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useSetAvailability', () => {
  it('POST /availability y invalida availability/me', async () => {
    mocked.apiPost.mockResolvedValueOnce(AVAIL);
    const invalidate = vi.fn();
    const { result } = renderHook(() => useSetAvailability(invalidate), {
      wrapper: createWrapper(),
    });
    result.current.mutate({
      location: { lat: -34.6, lng: -58.4 },
      radius_m: 2000,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/availability', {
      location: { lat: -34.6, lng: -58.4 },
      radius_m: 2000,
    });
    expect(invalidate).toHaveBeenCalledWith(['availability', 'me']);
  });
});

describe('useDeleteAvailability', () => {
  it('DELETE /availability/me y invalida', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Modo disponible desactivado' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => useDeleteAvailability(invalidate), {
      wrapper: createWrapper(),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/availability/me');
    expect(invalidate).toHaveBeenCalledWith(['availability', 'me']);
  });
});
