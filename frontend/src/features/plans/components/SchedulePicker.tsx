// frontend/src/features/plans/components/SchedulePicker.tsx
import { useEffect, useMemo, useState } from 'react';
import { addDays, format as fnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';

interface TimeRange {
  id: 'manana' | 'mediodia' | 'tarde' | 'noche';
  label: string;
  subLabel: string;
  hours: number[];
}

const TIME_RANGES: TimeRange[] = [
  { id: 'manana', label: 'Mañana', subLabel: '9:00 - 12:00 hs', hours: [9, 10, 11, 12] },
  { id: 'mediodia', label: 'Mediodía', subLabel: '12:00 - 15:00 hs', hours: [12, 13, 14, 15] },
  { id: 'tarde', label: 'Tarde', subLabel: '15:00 - 19:00 hs', hours: [15, 16, 17, 18] },
  { id: 'noche', label: 'Noche', subLabel: '19:00 - 23:00 hs', hours: [19, 20, 21, 22] },
];

interface Props {
  /** ISO del scheduled_at actual. Si viene uno existente, se inicializa con su día/hora. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Mensaje de error de validación a mostrar bajo el selector (opcional). */
  error?: string;
}

export function SchedulePicker({ value, onChange, error }: Props) {
  const days = useMemo(() => {
    const list = [];
    const base = new Date();
    for (let i = 0; i < 6; i++) {
      const d = addDays(base, i);
      let label = '';
      const dayNum = fnsFormat(d, 'd');
      if (i === 0) {
        label = 'Hoy';
      } else if (i === 1) {
        label = 'Mañ';
      } else {
        const dayName = fnsFormat(d, 'eee', { locale: es });
        label = dayName.replace('.', '');
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      list.push({ date: d, label, dayNum });
    }
    return list;
  }, []);

  // Inicializar estado desde value (si hay un scheduled_at existente, ej. edición)
  const initial = useMemo(() => {
    if (!value) return { dayIdx: 0, range: null, hour: null };
    const d = new Date(value);
    const h = d.getHours();
    const matchingRange = TIME_RANGES.find((r) => r.hours.includes(h));
    // Buscar el día más cercano en la grilla de 6 días
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
    const dayIdx = Math.max(0, Math.min(5, dayDiff));
    return { dayIdx, range: matchingRange?.id ?? null, hour: h };
  }, [value]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(initial.dayIdx);
  const [selectedRange, setSelectedRange] = useState<
    'manana' | 'mediodia' | 'tarde' | 'noche' | null
  >(initial.range);
  const [selectedHour, setSelectedHour] = useState<number | null>(initial.hour);

  // Emitir ISO al padre cuando cambia la selección
  useEffect(() => {
    if (selectedHour !== null) {
      const baseDate = days[selectedDayIdx]?.date || new Date();
      const updatedDate = new Date(baseDate);
      updatedDate.setHours(selectedHour, 0, 0, 0);
      onChange(updatedDate.toISOString());
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIdx, selectedHour]);

  const handleRangeSelect = (rangeId: 'manana' | 'mediodia' | 'tarde' | 'noche') => {
    setSelectedRange(rangeId);
    setSelectedHour(null);
  };

  return (
    <section className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* DÍA */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Día
        </label>
        <div className="grid grid-cols-6 gap-1.5 w-full">
          {days.map((d, idx) => {
            const isSelected = selectedDayIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className={cn(
                  'flex flex-col items-center justify-center h-16 rounded-2xl border transition-colors w-full',
                  isSelected
                    ? 'bg-gray-100 border-gray-900 border-2 font-bold text-gray-900 shadow-sm'
                    : 'bg-gray-50/50 border-gray-100 text-gray-400 hover:bg-gray-50',
                )}
              >
                <span className="text-[11px] font-semibold">{d.label}</span>
                <span className="text-lg font-bold mt-0.5 leading-none">{d.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RANGO HORARIO */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Rango Horario
        </label>
        <div className="grid grid-cols-2 gap-3">
          {TIME_RANGES.map((range) => {
            const isSelectedRange = selectedRange === range.id;
            if (isSelectedRange) {
              return (
                <div
                  key={range.id}
                  className="border border-gray-900 bg-white rounded-2xl p-2.5 flex items-center justify-between gap-1.5 h-[68px] w-full"
                >
                  {range.hours.map((h) => {
                    const isHourSelected = selectedHour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHour(h);
                        }}
                        className={cn(
                          'flex-1 h-full rounded-xl font-semibold text-xs flex items-center justify-center transition-colors border',
                          isHourSelected
                            ? 'bg-gray-100 border-gray-900 border-2 font-bold text-gray-900 shadow-sm'
                            : 'bg-white border-gray-100 text-gray-800 hover:bg-gray-50 active:scale-95',
                        )}
                      >
                        {h}h
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <button
                key={range.id}
                type="button"
                onClick={() => handleRangeSelect(range.id)}
                className="flex flex-col items-start justify-center p-3 h-[68px] rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 text-left transition-colors"
              >
                <span className="text-sm font-semibold text-gray-700">{range.label}</span>
                <span className="text-[11px] text-gray-400 mt-0.5">{range.subLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </section>
  );
}
