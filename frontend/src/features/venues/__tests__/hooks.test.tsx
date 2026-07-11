// frontend/src/features/venues/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVenues } from '../hooks';
import type { VenueListOut } from '../types';

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '../../../api/client';

const mockedApiGet = vi.mocked(apiGet);

const sampleResponse: VenueListOut = {
  items: [
    {
      id: 'v1',
      name: 'Bar X',
      category: 'drinks',
      address: 'Calle 1',
      lat: -34.59,
      lng: -58.43,
      distance_m: 100,
      offers: [
        {
          id: 'o1',
          title: '2x1',
          description: '2x1 cervezas',
          redemption_method: 'mention',
          valid_from: '2026-07-01T00:00:00Z',
          valid_until: '2026-07-31T00:00:00Z',
        },
      ],
    },
  ],
  count: 1,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // eslint-disable-next-line react-refresh/only-export-components
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useVenues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches venues when query is provided', async () => {
    mockedApiGet.mockResolvedValueOnce(sampleResponse);
    const { result } = renderHook(
      () => useVenues({ lat: -34.59, lng: -58.43, radius: 5000 }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].name).toBe('Bar X');
    expect(mockedApiGet).toHaveBeenCalledWith(
      '/venues',
      { query: { lat: -34.59, lng: -58.43, radius: 5000 } },
    );
  });

  it('does not fetch when query is null', async () => {
    const { result } = renderHook(() => useVenues(null), {
      wrapper: makeWrapper(),
    });
    expect(mockedApiGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
