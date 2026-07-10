// frontend/src/features/plans/components/PlanFilters.tsx
import { cn } from '../../../lib/utils';
import { ACTIVITY_TYPES, PLAN_MODES } from '../constants';
import type { PlanFiltersState } from '../types';

interface Props {
  value: PlanFiltersState;
  onChange: (next: PlanFiltersState) => void;
  className?: string;
}

export function PlanFilters({ value, onChange, className }: Props) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
        <Chip
          selected={value.activity === 'all'}
          onClick={() => onChange({ ...value, activity: 'all' })}
          label="Todas"
        />
        {ACTIVITY_TYPES.map((a) => (
          <Chip
            key={a.id}
            selected={value.activity === a.id}
            onClick={() => onChange({ ...value, activity: a.id })}
            label={a.label}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Chip
          selected={value.mode === 'all'}
          onClick={() => onChange({ ...value, mode: 'all' })}
          label="Cualquier momento"
        />
        {PLAN_MODES.map((m) => (
          <Chip
            key={m.id}
            selected={value.mode === m.id}
            onClick={() => onChange({ ...value, mode: m.id })}
            label={m.label}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
        selected
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white/80 text-gray-600 border-gray-200',
      )}
    >
      {label}
    </button>
  );
}
