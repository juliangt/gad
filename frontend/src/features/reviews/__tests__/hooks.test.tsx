import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import * as client from '../../../api/client';
import { useReviews, useCreateReview, useDeleteReview } from '../hooks';
import type { PaginatedOut } from '../../../types/common';
import type { ReviewWithReviewer, ReviewOut } from '../types';

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

const PAGE: PaginatedOut<ReviewWithReviewer> = {
  items: [
    {
      id: 'r1',
      match_id: 'm1',
      reviewer_id: 'u1',
      reviewee_id: 'u2',
      rating: 5,
      comment: 'Excelente',
      flag: null,
      created_at: '2026-07-09T18:00:00Z',
      reviewer: {
        id: 'u1',
        display_name: 'Ana',
        avatar_url: null,
        reputation_score: 4.5,
        verification_level: 'email',
      },
    },
  ],
  next_cursor: '2026-07-09T17:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('useReviews', () => {
  it('trae la primera página con user_id', async () => {
    mocked.apiGet.mockResolvedValueOnce(PAGE);
    const { result } = renderHook(() => useReviews('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiGet).toHaveBeenCalledWith('/reviews', {
      query: { user_id: 'u2', limit: 20, before: undefined },
    });
    expect(result.current.data?.pages[0].items).toHaveLength(1);
  });

  it('getNextPageParam usa next_cursor', async () => {
    mocked.apiGet.mockResolvedValueOnce(PAGE);
    const { result } = renderHook(() => useReviews('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('no consulta sin userId', async () => {
    const { result } = renderHook(() => useReviews(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCreateReview', () => {
  it('POST /reviews y invalida reviews del reviewee', async () => {
    const created: ReviewOut = {
      id: 'r1',
      match_id: 'm1',
      reviewer_id: 'u1',
      reviewee_id: 'u2',
      rating: 5,
      comment: null,
      flag: null,
      created_at: '2026-07-09T18:00:00Z',
    };
    mocked.apiPost.mockResolvedValueOnce(created);
    const invalidate = vi.fn();
    const { result } = renderHook(() => useCreateReview(invalidate), { wrapper: createWrapper() });
    result.current.mutate({
      match_id: 'm1',
      reviewee_id: 'u2',
      rating: 5,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/reviews', {
      match_id: 'm1',
      reviewee_id: 'u2',
      rating: 5,
    });
    expect(invalidate).toHaveBeenCalledWith({ prefix: ['reviews'], exact: false });
  });
});

describe('useDeleteReview', () => {
  it('DELETE /reviews/{id}', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Reseña eliminada' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => useDeleteReview(invalidate), { wrapper: createWrapper() });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/reviews/r1');
    expect(invalidate).toHaveBeenCalledWith({ prefix: ['reviews'], exact: false });
  });
});
