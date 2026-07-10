// frontend/src/features/matching/components/ApplicationCard.tsx
import { Check, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';
import { formatRating, formatRelativeTime } from '../../../lib/format';
import { APPLICATION_STATUS_META } from '../constants';
import type { ApplicationOut } from '../types';

interface Props {
  application: ApplicationOut;
  /** true si la aplicación está siendo procesada (aceptar/rechazar) → deshabilita botones. */
  actionLoading?: boolean;
  onAccept?: (applicationId: string) => void;
  onReject?: (applicationId: string) => void;
}

/**
 * Fila de postulación vista desde el host. Muestra applicant (avatar, nombre,
 * reputación, verificación), mensaje opcional, estado y botones aceptar/rechazar
 * (solo visibles si está pending y hay handler).
 */
export function ApplicationCard({
  application,
  actionLoading = false,
  onAccept,
  onReject,
}: Props) {
  const meta = APPLICATION_STATUS_META[application.status];
  const a = application.applicant;
  const isPending = application.status === 'pending';

  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={a.display_name} src={a.avatar_url ?? undefined} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{a.display_name}</h3>
            <Badge className="bg-gray-100 text-gray-600">
              {formatRating(a.reputation_score)} ★
            </Badge>
            {a.verification_level !== 'none' && (
              <Badge className="bg-brand-50 text-brand-600">
                {a.verification_level === 'google' ? 'Google' : 'Email'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Postuló {formatRelativeTime(application.created_at)}
          </p>
        </div>
        <Badge className={meta.badgeClass}>{meta.label}</Badge>
      </div>

      {application.message && (
        <p className="text-sm text-gray-700 bg-gray-50/60 rounded-xl p-3 border border-gray-100">
          {application.message}
        </p>
      )}

      {isPending && (onAccept || onReject) && (
        <div className="flex gap-2">
          {onAccept && (
            <Button
              size="sm"
              className="flex-1"
              disabled={actionLoading}
              onClick={() => onAccept(application.id)}
            >
              <Check className="w-4 h-4" />
              Aceptar
            </Button>
          )}
          {onReject && (
            <Button
              size="sm"
              variant="ghost"
              className={cn('flex-1', !onAccept && 'text-red-600')}
              disabled={actionLoading}
              onClick={() => onReject(application.id)}
            >
              <X className="w-4 h-4" />
              Rechazar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
