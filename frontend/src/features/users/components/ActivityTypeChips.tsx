// frontend/src/features/users/components/ActivityTypeChips.tsx
import type { ActivityType } from '@/types/enums';
import { cn } from '@/lib/utils';
import { ACTIVITY_OPTIONS } from '../constants';
import { ACTIVITY_META } from '@/features/plans/constants';

interface ActivityTypeChipsProps {
  value: ActivityType[];
  onChange: (next: ActivityType[]) => void;
  /** Cuando true es solo lectura (perfil). */
  readOnly?: boolean;
}

export function ActivityTypeChips({ value, onChange, readOnly = false }: ActivityTypeChipsProps) {
  const toggle = (a: ActivityType) => {
    if (readOnly) return;
    onChange(value.includes(a) ? value.filter((v) => v !== a) : [...value, a]);
  };

  if (readOnly && value.length === 0) {
    return <p className="text-sm text-gray-400">Sin intereses definidos.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIVITY_OPTIONS.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(opt.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              selected
                ? ACTIVITY_META[opt.value]?.activeClass || 'bg-brand-600 text-white border-brand-200'
                : 'bg-gray-50 text-gray-600 border-gray-200',
              readOnly && 'cursor-default',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
