import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { VenueAdminOut } from '../types';

export interface VenueRowProps {
  venue: VenueAdminOut;
  onApprove: (id: string) => void;
  onPause: (id: string) => void;
  onRevoke: (id: string) => void;
  onEdit: (venue: VenueAdminOut) => void;
  onManageOffers: (venue: VenueAdminOut) => void;
  busy?: boolean;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  paused: 'neutral',
  revoked: 'danger',
};

export function VenueRow({
  venue,
  onApprove,
  onPause,
  onRevoke,
  onEdit,
  onManageOffers,
  busy,
}: VenueRowProps) {
  return (
    <li className="glass-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 truncate">{venue.name}</h3>
            <Badge variant={STATUS_VARIANT[venue.status] ?? 'neutral'}>{venue.status}</Badge>
          </div>
          <p className="text-sm text-gray-600">{venue.address}</p>
          <p className="mt-1 text-xs text-gray-500">
            {venue.category} · {venue.offers.length} oferta(s) · {venue.owner_name} ({venue.owner_email})
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {venue.status === 'pending' && (
            <Button size="sm" onClick={() => onApprove(venue.id)} disabled={busy}>
              Aprobar
            </Button>
          )}
          {venue.status === 'active' && (
            <Button size="sm" variant="secondary" onClick={() => onPause(venue.id)} disabled={busy}>
              Pausar
            </Button>
          )}
          {venue.status === 'paused' && (
            <Button size="sm" onClick={() => onApprove(venue.id)} disabled={busy}>
              Activar
            </Button>
          )}
          {(venue.status === 'active' || venue.status === 'paused') && (
            <Button size="sm" variant="danger" onClick={() => onRevoke(venue.id)} disabled={busy}>
              Revocar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEdit(venue)} disabled={busy}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onManageOffers(venue)} disabled={busy}>
            Ofertas
          </Button>
        </div>
      </div>
    </li>
  );
}
