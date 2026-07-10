// frontend/src/features/plans/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePlans,
  usePlan,
  useCreatePlan,
  useUpdatePlan,
  useCancelPlan,
} from '../hooks';

// Desde src/features/plans/__tests__/ el módulo api/client está en ../../../api/client.
vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost, apiPatch, apiDelete } from '../../../api/client';
import type { PlanOut } from '../types';

const mGet = vi.mocked(apiGet);
const mPost = vi.mocked(apiPost);
const mPatch = vi.mocked(apiPatch);
const mDel = vi.mocked(apiDelete);

function makePlan(overrides: Partial<PlanOut> = {}): PlanOut {
  return {
    id: 'p1',
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 2,
    current_participants: 1,
    title: 'Café',
    description: 'desc',
    location_label: 'Palermo',
    location_lat: -34.588,
    location_lng: -58.431,
    search_radius_m: 2000,
    status: 'open',
    expires_at: '2026-07-10T18:00:00Z',
    host: {
      id: 'u1',
      display_name: 'Sofía',
      avatar_url: null,
      reputation_score: 4.9,
      verification_level: 'email',
    },
    created_at: '2026-07-09T17:00:00Z',
    ...overrides,
  };
}

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('usePlans', () => {
  it('usa la query key correcta y llama GET /plans con query params', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makePlan()]);
    const { result } = renderHook(
      () => usePlans({ lat: -34.59, lng: -58.43, radius: 2000 }),
      { wrapper: withClient(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans', {
      query: { lat: -34.59, lng: -58.43, radius: 2000 },
    });
    expect(result.current.data).toHaveLength(1);
  });

  it('omite activity/mode undefined', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => usePlans({ lat: 0, lng: 0, activity: 'coffee', mode: 'now' }),
      { wrapper: withClient(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans', {
      query: { lat: 0, lng: 0, activity: 'coffee', mode: 'now' },
    });
  });

  it('no habilita la query si lat/lng son null', async () => {
    const client = newClient();
    const { result } = renderHook(() => usePlans(null), {
      wrapper: withClient(client),
    });
    expect(mGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('usePlan', () => {
  it('usa key ["plans", id] y GET /plans/{id}', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce(makePlan({ id: 'abc' }));
    const { result } = renderHook(() => usePlan('abc'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans/abc');
    expect(result.current.data?.id).toBe('abc');
  });
});

describe('useCreatePlan', () => {
  it('POST /plans y al éxito invalida ["plans"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makePlan({ id: 'new1' }));

    const { result } = renderHook(() => useCreatePlan(), {
      wrapper: withClient(client),
    });
    result.current.mutate({
      activity_type: 'coffee',
      mode: 'now',
      scheduled_at: null,
      window_minutes: 120,
      max_participants: 1,
      title: 'Café',
      description: null,
      location: { lat: -34.59, lng: -58.43, label: 'Palermo' },
      search_radius_m: 2000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/plans', expect.objectContaining({ title: 'Café' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
  });
});

describe('useUpdatePlan', () => {
  it('PATCH /plans/{id} e invalida detalle + lista', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPatch.mockResolvedValueOnce(makePlan({ id: 'p9', title: 'Nuevo' }));

    const { result } = renderHook(() => useUpdatePlan('p9'), {
      wrapper: withClient(client),
    });
    result.current.mutate({ title: 'Nuevo' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPatch).toHaveBeenCalledWith('/plans/p9', { title: 'Nuevo' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', 'p9'] });
  });
});

describe('useCancelPlan', () => {
  it('DELETE /plans/{id} e invalida lista', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mDel.mockResolvedValueOnce(makePlan({ id: 'p9', status: 'cancelled' }));

    const { result } = renderHook(() => useCancelPlan(), {
      wrapper: withClient(client),
    });
    result.current.mutate('p9');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mDel).toHaveBeenCalledWith('/plans/p9');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans'] });
  });
});
