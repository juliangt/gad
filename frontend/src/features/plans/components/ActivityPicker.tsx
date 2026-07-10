// frontend/src/features/plans/components/ActivityPicker.tsx
import { cn } from '../../../lib/utils';
import { ACTIVITY_TYPES } from '../constants';
import type { ActivityType } from '../types';

interface Props {
  value: ActivityType;
  onChange: (a: ActivityType) => void;
  className?: string;
}

/** Fila scrollable de chips de actividad (expandido a las 7 del enum). */
export function ActivityPicker({ value, onChange, className }: Props) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto hide-scrollbar pb-2', className)} role="radiogroup" aria-label="Actividad">
      {ACTIVITY_TYPES.map((act) => {
        const selected = act.id === value;
        const Icon = act.icon;
        return (
          <button
            key={act.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(act.id)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors border',
              selected
                ? act.activeClass
                : 'bg-gray-50 text-gray-600 border-gray-200',
            )}
          >
            <Icon className="w-4 h-4" />
            {act.label}
          </button>
        );
      })}
    </div>
  );
}
