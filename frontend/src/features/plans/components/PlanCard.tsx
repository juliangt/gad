// frontend/src/features/plans/components/PlanCard.tsx
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { haversine } from '../../../lib/geo';
import { formatDistance } from '../../../lib/format';
import { ACTIVITY_META } from '../constants';
import type { PlanListItem } from '../types';

interface Props {
  plan: PlanListItem;
  userLocation: [number, number] | null;
  onClick?: (planId: string) => void;
}

export function PlanCard({ plan, userLocation, onClick }: Props) {
  const meta = ACTIVITY_META[plan.activity_type] ?? ACTIVITY_META.other;
  const ActivityIcon = meta.icon;
  const distanceLabel = userLocation
    ? formatDistance(haversine(userLocation[0], userLocation[1], plan.location_lat, plan.location_lng))
    : '—';

  return (
    <div
      onClick={() => onClick?.(plan.id)}
      className="glass-panel p-4 rounded-2xl flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(plan.id);
        }
      }}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-900/5 flex items-center justify-center text-gray-700">
            <ActivityIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{plan.title}</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
              <MapPin className="w-3 h-3" />
              <span>A {distanceLabel} de ti</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1">
        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5',
            plan.mode === 'now' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-600',
          )}
        >
          {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
          {plan.mode === 'now' ? 'Ahora' : formatScheduled(plan.scheduled_at)}
        </div>
        <div className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {plan.current_participants}/{plan.max_participants}
        </div>
      </div>
    </div>
  );
}

/** Helper local: formato corto "18:30" para el badge scheduled. */
function formatScheduled(iso: string | null): string {
  if (!iso) return 'Agendado';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Agendado';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
