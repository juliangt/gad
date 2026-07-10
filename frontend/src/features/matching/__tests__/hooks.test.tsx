// frontend/src/features/matching/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useApply,
  useApplications,
  useAccept,
  useReject,
  useWithdraw,
  useMyApplications,
  useMatches,
  useMatch,
  useCompleteMatch,
  useCancelMatch,
} from '../hooks';

// Desde src/features/matching/__tests__/ el módulo api/client está en ../../../api/client.
vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost, apiDelete } from '../../../api/client';
import type {
  ApplicationOut,
  MatchOut,
  MyApplicationsPage,
  MatchesPage,
} from '../types';

const mGet = vi.mocked(apiGet);
const mPost = vi.mocked(apiPost);
const mDel = vi.mocked(apiDelete);

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

function makeApp(overrides: Partial<ApplicationOut> = {}): ApplicationOut {
  return {
    id: 'app1',
    plan_id: 'plan1',
    applicant: {
      id: 'u2',
      display_name: 'Lucía',
      avatar_url: null,
      reputation_score: 4.7,
      verification_level: 'email',
    },
    status: 'pending',
    message: 'Me sumo',
    created_at: '2026-07-09T17:00:00Z',
    decided_at: null,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchOut> = {}): MatchOut {
  return {
    id: 'm1',
    plan_id: 'plan1',
    status: 'active',
    started_at: '2026-07-09T18:00:00Z',
    ended_at: null,
    location_sharing_active: true,
    participants: [
      {
        user_id: 'u1',
        display_name: 'Martín',
        avatar_url: null,
        role: 'host',
        joined_at: '2026-07-09T18:00:00Z',
      },
      {
        user_id: 'u2',
        display_name: 'Lucía',
        avatar_url: null,
        role: 'participant',
        joined_at: '2026-07-09T18:00:00Z',
      },
    ],
    exact_location_lat: -34.588,
    exact_location_lng: -58.431,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useApply', () => {
  it('POST /plans/{id}/applications y al éxito invalida ["applications", planId] y ["my-applications"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeApp({ id: 'newApp' }));

    const { result } = renderHook(() => useApply('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate({ message: 'Hola' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/plans/plan1/applications', { message: 'Hola' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
  });
});

describe('useApplications', () => {
  it('usa key ["applications", planId] y GET /plans/{id}/applications (array directo)', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makeApp()]);
    const { result } = renderHook(() => useApplications('plan1'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/plans/plan1/applications');
    expect(result.current.data).toHaveLength(1);
  });

  it('no habilita la query si planId es undefined', async () => {
    const client = newClient();
    const { result } = renderHook(() => useApplications(undefined), {
      wrapper: withClient(client),
    });
    expect(mGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAccept', () => {
  it('POST /applications/{id}/accept y al éxito invalida applications, my-applications y matches', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch()); // se formó match

    const { result } = renderHook(() => useAccept('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/applications/app1/accept');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
  });

  it('acepta null (sin match todavía) sin romper', async () => {
    const client = newClient();
    mPost.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAccept('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useReject', () => {
  it('POST /applications/{id}/reject y al éxito invalida applications', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce({ message: 'Postulación rechazada' });

    const { result } = renderHook(() => useReject('plan1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/applications/app1/reject');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['applications', 'plan1'] });
  });
});

describe('useWithdraw', () => {
  it('DELETE /applications/{id} y al éxito invalida ["my-applications"]', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mDel.mockResolvedValueOnce({ message: 'Postulación retirada' });

    const { result } = renderHook(() => useWithdraw(), {
      wrapper: withClient(client),
    });
    result.current.mutate('app1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mDel).toHaveBeenCalledWith('/applications/app1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-applications'] });
  });
});

describe('useMyApplications', () => {
  it('usa useInfiniteQuery con getNextPageParam = next_cursor', async () => {
    const client = newClient();
    const page: MyApplicationsPage = {
      items: [makeApp()],
      next_cursor: '2026-07-09T17:00:00Z',
    };
    mGet.mockResolvedValueOnce(page);

    const { result } = renderHook(() => useMyApplications(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/me/applications', {
      query: { limit: 50 },
    });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('hasNextPage=false cuando next_cursor es null', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce({ items: [makeApp()], next_cursor: null });

    const { result } = renderHook(() => useMyApplications(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useMatches', () => {
  it('usa useInfiniteQuery con GET /matches', async () => {
    const client = newClient();
    const page: MatchesPage = {
      items: [makeMatch()],
      next_cursor: null,
    };
    mGet.mockResolvedValueOnce(page);

    const { result } = renderHook(() => useMatches(), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/matches', { query: { limit: 50 } });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useMatch', () => {
  it('usa key ["matches", id] y GET /matches/{id}', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce(makeMatch({ id: 'abc' }));
    const { result } = renderHook(() => useMatch('abc'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith('/matches/abc');
    expect(result.current.data?.id).toBe('abc');
  });
});

describe('useCompleteMatch', () => {
  it('POST /matches/{id}/complete e invalida ["matches"] y detalle', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch({ id: 'm1', status: 'completed' }));

    const { result } = renderHook(() => useCompleteMatch('m1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('m1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/matches/m1/complete');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches', 'm1'] });
  });
});

describe('useCancelMatch', () => {
  it('POST /matches/{id}/cancel e invalida ["matches"] y detalle', async () => {
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    mPost.mockResolvedValueOnce(makeMatch({ id: 'm1', status: 'cancelled' }));

    const { result } = renderHook(() => useCancelMatch('m1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('m1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/matches/m1/cancel');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches', 'm1'] });
  });
});
