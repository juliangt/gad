// frontend/src/features/plans/components/ValidityPicker.tsx
import { cn } from '../../../lib/utils';

const OPTIONS = [
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
  { value: 0, label: 'Resto del día' },
] as const;

interface Props {
  value: 60 | 120 | 180 | 0;
  onChange: (value: 60 | 120 | 180 | 0) => void;
}

export function ValidityPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1.5 w-full">
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'py-3 rounded-xl font-medium text-[11px] flex items-center justify-center text-center transition-colors border leading-tight',
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
