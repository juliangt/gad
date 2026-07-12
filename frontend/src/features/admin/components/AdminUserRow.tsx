import { Link } from 'react-router-dom';
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
  onGrantAdmin?: (id: string) => void;
  onRevokeAdmin?: (id: string) => void;
  onResetPassword?: (id: string) => void;
  busy?: boolean;
}

// `Badge.variant` no expone `info`; mapeamos estados a variantes válidas.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

export function AdminUserRow({
  user,
  onBan,
  onSuspend,
  onActivate,
  onGrantAdmin,
  onRevokeAdmin,
  onResetPassword,
  busy,
}: AdminUserRowProps) {
  const isActive = user.status === 'active';
  const detailTo = `/admin/users/${user.id}`;
  return (
    <li className="glass-panel rounded-xl p-4 flex items-center gap-3">
      <Avatar name={user.display_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={detailTo}
            className="font-semibold text-gray-900 truncate hover:underline"
          >
            {user.display_name}
          </Link>
          {user.is_admin && <Badge variant="brand">Admin</Badge>}
          <Badge variant={STATUS_VARIANT[user.status] ?? 'neutral'}>{user.status}</Badge>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {user.email} · Reputación: {user.reputation_score.toFixed(1)} · {formatRelativeTime(user.created_at)}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0 items-center">
        <Link
          to={detailTo}
          className="px-3 py-1.5 text-sm rounded-lg glass-button text-gray-800 border border-gray-200 hover:bg-white/90 active:scale-[0.98] font-semibold transition-transform"
        >
          Ver
        </Link>
        {onGrantAdmin && !user.is_admin && (
          <Button size="sm" variant="secondary" onClick={() => onGrantAdmin(user.id)} disabled={busy}>
            Hacer admin
          </Button>
        )}
        {onRevokeAdmin && user.is_admin && (
          <Button size="sm" variant="danger" onClick={() => onRevokeAdmin(user.id)} disabled={busy}>
            Quitar admin
          </Button>
        )}
        {onResetPassword && (
          <Button size="sm" variant="ghost" onClick={() => onResetPassword(user.id)} disabled={busy}>
            Reset clave
          </Button>
        )}
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
