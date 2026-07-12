import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../../../lib/format';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { AdminPlanListItem } from '../types';

export interface AdminPlanRowProps {
  plan: AdminPlanListItem;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onClose: (id: string) => void;
  busy?: boolean;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'success',
  matched: 'brand',
  closed: 'neutral',
  cancelled: 'danger',
  expired: 'warning',
};

const ACTIVITY_LABELS: Record<string, string> = {
  coffee: 'Café',
  drinks: 'Trago',
  food: 'Comida',
  walk: 'Caminata',
  park: 'Parque',
  event: 'Evento',
  other: 'Otro',
};

export function AdminPlanRow({ plan, onHide, onUnhide, onClose, busy }: AdminPlanRowProps) {
  const detailTo = `/admin/plans/${plan.id}`;
  const isClosable = plan.status === 'open' || plan.status === 'matched';
  return (
    <li className="glass-panel rounded-xl p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={detailTo}
            className="font-semibold text-gray-900 truncate hover:underline"
          >
            {plan.title}
          </Link>
          <Badge variant="neutral">{ACTIVITY_LABELS[plan.activity_type] ?? plan.activity_type}</Badge>
          <Badge variant={STATUS_VARIANT[plan.status] ?? 'neutral'}>{plan.status}</Badge>
          {plan.hidden_by_host && <Badge variant="warning">Oculto</Badge>}
        </div>
        <p className="text-xs text-gray-500 truncate">
          Host: {plan.host_name} · {plan.current_participants}/{plan.max_participants} ·{' '}
          {formatRelativeTime(plan.created_at)}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0 items-center">
        <Link
          to={detailTo}
          className="px-3 py-1.5 text-sm rounded-lg glass-button text-gray-800 border border-gray-200 hover:bg-white/90 active:scale-[0.98] font-semibold transition-transform"
        >
          Ver
        </Link>
        {plan.hidden_by_host ? (
          <Button size="sm" variant="secondary" onClick={() => onUnhide(plan.id)} disabled={busy}>
            Mostrar
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onHide(plan.id)} disabled={busy}>
            Ocultar
          </Button>
        )}
        {isClosable && (
          <Button size="sm" variant="danger" onClick={() => onClose(plan.id)} disabled={busy}>
            Cerrar
          </Button>
        )}
      </div>
    </li>
  );
}
