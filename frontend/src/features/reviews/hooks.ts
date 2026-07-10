/**
 * Hooks de datos (TanStack Query v5) para Reviews.
 *
 * Query keys:
 *  - ['reviews', userId]  (infinite query)
 *
 * POST /reviews invalida TODAS las keys ['reviews', ...] (la nueva reseña
 * cambia la lista del reviewee y potencialmente el reputation_score en /me).
 * Por eso el invalidador usa un prefijo, no exact.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import type { PaginatedOut, OKMessage } from '../../types/common';
import type { ReviewIn, ReviewOut, ReviewWithReviewer } from './types';

type InvalidationSpec = { prefix: unknown[]; exact?: boolean };
type Invalidator = (spec: InvalidationSpec) => void;

function useInvalidator(): Invalidator {
  const qc = useQueryClient();
  return ({ prefix, exact = false }) =>
    qc.invalidateQueries({ queryKey: prefix, exact });
}

export interface UseReviewsOptions {
  limit?: number; // default 20
}

export function useReviews(userId: string, options: UseReviewsOptions = {}) {
  const limit = options.limit ?? 20;
  return useInfiniteQuery<PaginatedOut<ReviewWithReviewer>>({
    queryKey: ['reviews', userId],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedOut<ReviewWithReviewer>>('/reviews', {
        query: { user_id: userId, limit, before: pageParam as string | undefined },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useCreateReview(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<ReviewOut, Error, ReviewIn>({
    mutationFn: (body) => apiPost<ReviewOut>('/reviews', body),
    onSuccess: () => inv({ prefix: ['reviews'], exact: false }),
  });
}

export function useDeleteReview(invalidate?: Invalidator) {
  const inv = invalidate ?? useInvalidator();
  return useMutation<OKMessage, Error, string>({
    mutationFn: (reviewId: string) => apiDelete<OKMessage>(`/reviews/${reviewId}`),
    onSuccess: () => inv({ prefix: ['reviews'], exact: false }),
  });
}
