// frontend/src/features/reviews/components/ReviewList.tsx
import { Flag } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { StarRating } from './StarRating';
import { useReviews } from '../hooks';
import { REVIEW_FLAG_LABELS } from '../schemas';
import type { ReviewWithReviewer } from '../types';
import { formatRelativeTime } from '../../../lib/format';
import { ApiError } from '../../../api/errors';

export interface ReviewListProps {
  userId: string;
  /** Mostrar el nombre/avatar del reviewer. Default true. */
  showReviewer?: boolean;
}

export function ReviewList({ userId, showReviewer = true }: ReviewListProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useReviews(userId);

  const reviews: ReviewWithReviewer[] = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const apiErr = error instanceof ApiError ? error : null;
    return <ErrorState message={apiErr?.detail} onRetry={() => refetch()} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        title="Sin reseñas todavía"
        description="Esta persona todavía no recibió reseñas."
      />
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <article
          key={r.id}
          className="bg-white rounded-2xl border border-gray-100 p-4"
        >
          {showReviewer && (
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={r.reviewer.display_name} src={r.reviewer.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">
                  {r.reviewer.display_name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatRelativeTime(r.created_at)}
                </p>
              </div>
              {r.flag && (
                <Badge variant="warning">
                  <Flag className="w-3 h-3" />
                  {REVIEW_FLAG_LABELS[r.flag] ?? r.flag}
                </Badge>
              )}
            </div>
          )}
          <div className="mb-1">
            <StarRating value={r.rating} size="sm" readOnly />
          </div>
          {r.comment && <p className="text-sm text-gray-700 leading-relaxed">{r.comment}</p>}
        </article>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
          >
            Cargar más reseñas
          </Button>
        </div>
      )}
    </div>
  );
}
