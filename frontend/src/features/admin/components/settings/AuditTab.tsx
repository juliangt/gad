import { useState } from 'react';
import { useAuditLog } from '../../hooks';
import { Spinner } from '../../../../components/ui/Spinner';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { formatRelativeTime } from '../../../../lib/format';

export function AuditTab() {
  const [action, setAction] = useState<string | undefined>(undefined);
  const query = useAuditLog(action);
  const events = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3">
      <select
        className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-sm"
        value={action ?? ''}
        onChange={(e) => setAction(e.target.value || undefined)}
      >
        <option value="">Todas las acciones</option>
        <option value="settings.user_defaults.update">Defaults</option>
        <option value="settings.operational.update">Operativos</option>
        <option value="settings.feature_flag.update">Feature flags</option>
        <option value="settings.maintenance.update">Mantenimiento</option>
        <option value="user.ban">Ban de usuario</option>
        <option value="user.grant_admin">Grant admin</option>
        <option value="user.reset_password">Reset password</option>
        <option value="plan.cancel">Cancel plan</option>
      </select>

      {query.isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between">
                <Badge variant="brand">{ev.action}</Badge>
                <span className="text-xs text-gray-500">{formatRelativeTime(ev.created_at)}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Actor: <span className="font-mono">{ev.actor_id?.slice(0, 8) ?? 'sistema'}</span>
                {ev.target_id && <> · Target: <span className="font-mono">{ev.target_id.slice(0, 8)}</span></>}
              </p>
              {Object.keys(ev.detail).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer">Detalle</summary>
                  <pre className="mt-1 text-xs bg-gray-100 rounded-lg p-2 overflow-x-auto">
                    {JSON.stringify(ev.detail, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
