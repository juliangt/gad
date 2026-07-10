// frontend/src/features/plans/components/PlanDetailSheet.tsx
import { Calendar, Check, Clock, MapPin, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { haversine } from '../../../lib/geo';
import { formatDistance, formatRating } from '../../../lib/format';
import type { PlanOut } from '../types';

interface Props {
  plan: PlanOut;
  userLocation: [number, number] | null;
  /** true si el usuario actual es el host (puede editar/cancelar). */
  isHost: boolean;
  onClose?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onApply?: () => void;
}

export function PlanDetailSheet({
  plan,
  userLocation,
  isHost,
  onClose,
  onEdit,
  onCancel,
  onApply,
}: Props) {
  const distanceLabel = userLocation
    ? formatDistance(
        haversine(userLocation[0], userLocation[1], plan.location_lat, plan.location_lng),
      )
    : '—';

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-2" />

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn(plan.mode === 'now' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-600')}>
                {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                {plan.mode === 'now' ? 'Ahora' : (plan.scheduled_at ?? 'Agendado')}
              </Badge>
              <Badge className="bg-gray-100 text-gray-600">
                <MapPin className="w-3.5 h-3.5" />
                A {distanceLabel}
              </Badge>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">{plan.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 flex-shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Host */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
          <Avatar
            name={plan.host.display_name}
            src={plan.host.avatar_url ?? undefined}
            size="lg"
          />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Organizado por {plan.host.display_name}
            </h3>
            <p className="text-xs text-gray-500">
              Reputación: {formatRating(plan.host.reputation_score)} · {plan.host.verification_level}
            </p>
          </div>
          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-sm flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-brand-500" />
            {plan.current_participants}/{plan.max_participants}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Sobre el plan</h4>
          <p className="text-sm text-gray-600 leading-relaxed">
            {plan.description || 'Sin descripción'}
          </p>
        </div>

        {/* Acciones por rol */}
        {isHost ? (
          <div className="flex flex-col gap-2">
            <Button onClick={onEdit}>Editar plan</Button>
            <Button variant="ghost" className="text-red-600" onClick={onCancel}>
              Cancelar plan
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => {
              // F4 conecta este botón a useApply. Por ahora, toast informativo.
              onApply?.();
              if (!onApply) toast.info('Las postulaciones estarán disponibles pronto (F4).');
            }}
          >
            <Check className="w-5 h-5" />
            Postularme
          </Button>
        )}
      </div>
    </div>
  );
}
