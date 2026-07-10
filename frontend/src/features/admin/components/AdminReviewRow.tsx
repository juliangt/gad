import { Star, Flag } from 'lucide-react';
import { formatRelativeTime } from '../../../lib/format';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { AdminReviewOut } from '../types';

export interface AdminReviewRowProps {
  review: AdminReviewOut;
  onDelete: (id: string) => void;
  busy?: boolean;
}

export function AdminReviewRow({ review, onDelete, busy }: AdminReviewRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-amber-500" aria-label={`Puntuación: ${review.rating}`}>
              <Star className="w-4 h-4 fill-current" aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-900">{review.rating}</span>
            </span>
            {review.flag && (
              <Badge variant="warning">
                <Flag className="w-3 h-3 mr-1" aria-hidden="true" />
                {review.flag}
              </Badge>
            )}
          </div>
          {review.comment && <p className="text-sm text-gray-700 mt-1">{review.comment}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Reseña <span className="font-mono">{review.id.slice(0, 8)}</span>
            {review.created_at && <> · {formatRelativeTime(review.created_at)}</>}
          </p>
        </div>
        <Button size="sm" variant="danger" onClick={() => onDelete(review.id)} disabled={busy}>
          Eliminar
        </Button>
      </div>
    </li>
  );
}
