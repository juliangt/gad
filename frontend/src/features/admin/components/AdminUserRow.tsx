import { formatRelativeTime } from '../../../lib/format';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import type { AdminUserOut } from '../types';

export interface AdminUserRowProps {
  user: AdminUserOut;
  onBan: (id: string) => void;
  onSuspend: (id: string) => void;
  onActivate: (id: string) => void;
  busy?: boolean;
}

// `Badge.variant` no expone `info`; mapeamos estados a variantes válidas.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

export function AdminUserRow({ user, onBan, onSuspend, onActivate, busy }: AdminUserRowProps) {
  const isActive = user.status === 'active';
  return (
    <li className="glass-panel rounded-xl p-4 flex items-center gap-3">
      <Avatar name={user.display_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 truncate">{user.display_name}</span>
          {user.is_admin && <Badge variant="brand">Admin</Badge>}
          <Badge variant={STATUS_VARIANT[user.status] ?? 'neutral'}>{user.status}</Badge>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {user.email} · Reputación: {user.reputation_score.toFixed(1)} · {formatRelativeTime(user.created_at)}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {!isActive && (
          <Button size="sm" variant="secondary" onClick={() => onActivate(user.id)} disabled={busy}>
            Activar
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="secondary" onClick={() => onSuspend(user.id)} disabled={busy}>
            Suspender
          </Button>
        )}
        {user.status !== 'deleted' && (
          <Button size="sm" variant="danger" onClick={() => onBan(user.id)} disabled={busy}>
            Banear
          </Button>
        )}
      </div>
    </li>
  );
}
