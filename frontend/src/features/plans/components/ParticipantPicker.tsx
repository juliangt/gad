// frontend/src/features/plans/components/ParticipantPicker.tsx
import { cn } from '../../../lib/utils';

const OPTIONS = [
  { value: 1, label: 'Solo uno' },
  { value: 4, label: 'Grupo chico' },
  { value: 10, label: 'Sin límite' },
] as const;

interface Props {
  value: number;
  onChange: (value: 1 | 4 | 10) => void;
}

export function ParticipantPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'py-3 rounded-xl font-medium text-xs flex items-center justify-center transition-colors border',
              isSelected
                ? 'bg-gray-100 border-gray-900 border-2 font-bold text-gray-900 shadow-sm'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
