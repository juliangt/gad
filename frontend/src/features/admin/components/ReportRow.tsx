import { formatRelativeTime } from '../../../lib/format';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import type { ReportOut } from '../types';

export interface ReportRowProps {
  report: ReportOut;
  onStatusChange: (id: string, status: string) => void;
  disabled?: boolean;
}

// `Badge.variant` no expone `info`; mapeamos estados a variantes válidas.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'warning',
  resolved: 'success',
  closed: 'brand',
};

export function ReportRow({ report, onStatusChange, disabled }: ReportRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[report.status] ?? 'neutral'}>{report.status}</Badge>
            <span className="text-sm font-semibold text-gray-900">{report.reason}</span>
          </div>
          {report.description && <p className="text-sm text-gray-700 mt-1">{report.description}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Reporter: <span className="font-mono">{report.reporter_id.slice(0, 8)}</span> ·
            Reportado: <span className="font-mono">{report.reported_id.slice(0, 8)}</span> ·
            {formatRelativeTime(report.created_at)}
          </p>
        </div>
        <label className="text-xs text-gray-600 flex flex-col gap-1 flex-shrink-0">
          Estado
          <select
            value={report.status}
            disabled={disabled}
            onChange={(e) => onStatusChange(report.id, e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm disabled:opacity-50"
            aria-label={`Cambiar estado del reporte ${report.id}`}
          >
            <option value="open">Abierto</option>
            <option value="resolved">Resuelto</option>
            <option value="closed">Cerrado</option>
          </select>
        </label>
      </div>
    </li>
  );
}
