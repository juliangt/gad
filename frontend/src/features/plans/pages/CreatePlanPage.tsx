// frontend/src/features/plans/pages/CreatePlanPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Calendar, X } from 'lucide-react';
import { addDays, format as fnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ActivityPicker } from '../components/ActivityPicker';
import { PLAN_DEFAULTS, PLAN_MODES, ACTIVITY_META } from '../constants';
import { planInSchema, type PlanInForm } from '../schemas';
import { useCreatePlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import { MapBackground } from '../../../components/MapBackground';
import type { ActivityType, PlanIn, PlanMode } from '../types';

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

export default function CreatePlanPage() {
  const navigate = useNavigate();
  const gps = useUserLocation();
  const createPlan = useCreatePlan();

  useEffect(() => {
    void gps.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultValues: PlanInForm = useMemo(
    () => ({
      activity_type: PLAN_DEFAULTS.activity_type,
      mode: PLAN_DEFAULTS.mode,
      scheduled_at: null,
      window_minutes: PLAN_DEFAULTS.window_minutes,
      max_participants: PLAN_DEFAULTS.max_participants,
      title: ACTIVITY_META[PLAN_DEFAULTS.activity_type]?.label || 'Nuevo Plan',
      description: null,
      location: {
        // Coords por defecto: las del usuario si ya hay, si no centro de CABA.
        lat: gps.location?.[0] ?? -34.5900,
        lng: gps.location?.[1] ?? -58.4300,
        label: '',
      },
      search_radius_m: PLAN_DEFAULTS.search_radius_m,
    }),
    // Solo calcular al montar; si el GPS llega después, el usuario puede tocar "usar mi ubicación".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlanInForm>({
    resolver: zodResolver(planInSchema) as any,
    defaultValues,
    mode: 'onTouched',
  });

  const mode = watch('mode');
  const activityType = watch('activity_type');

  // Actualizar el título del formulario automáticamente según la actividad seleccionada
  useEffect(() => {
    const label = ACTIVITY_META[activityType as ActivityType]?.label || 'Nuevo Plan';
    setValue('title', label, { shouldValidate: true });
  }, [activityType, setValue]);

  // Estados locales para selección de fecha/hora en modo Agendar
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
      list.push({
        date: d,
        label,
        dayNum,
      });
    }
    return list;
  }, []);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [selectedRange, setSelectedRange] = useState<'manana' | 'mediodia' | 'tarde' | 'noche' | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estados locales para los botones de las opciones avanzadas
  const [selectedParticipants, setSelectedParticipants] = useState<1 | 4 | 10>(1);
  const [selectedRadius, setSelectedRadius] = useState<1000 | 2000 | 5000>(2000);
  const [selectedValidity, setSelectedValidity] = useState<60 | 120 | 180 | 'resto_del_dia'>(120);

  // Gesto de deslizar hacia abajo para cerrar
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStart === null) return;
    const currentY = e.touches[0].clientY;
    const offset = currentY - dragStart;
    if (offset > 0) {
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > 150) {
      navigate('/explore');
    } else {
      setDragOffset(0);
    }
    setDragStart(null);
  };

  // Helper para vigencia: calcular minutos restantes del día
  const getMinutesRemainingInDay = (scheduledAtIso: string | null) => {
    const baseDate = scheduledAtIso ? new Date(scheduledAtIso) : new Date();
    const endOfDay = new Date(baseDate);
    endOfDay.setHours(23, 59, 59, 999);
    const diffMs = endOfDay.getTime() - baseDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return Math.max(15, Math.min(1440, diffMins));
  };

  // Sincronizar estados locales de fecha/hora con react-hook-form
  useEffect(() => {
    if (mode === 'scheduled' && selectedHour !== null) {
      const baseDate = days[selectedDayIdx]?.date || new Date();
      const updatedDate = new Date(baseDate);
      updatedDate.setHours(selectedHour, 0, 0, 0);
      setValue('scheduled_at', updatedDate.toISOString(), { shouldValidate: true });
    } else {
      setValue('scheduled_at', null);
    }
  }, [mode, selectedDayIdx, selectedHour, setValue, days]);

  const scheduledAt = watch('scheduled_at');

  // Sincronizar estados locales de opciones avanzadas con react-hook-form
  useEffect(() => {
    setValue('max_participants', selectedParticipants, { shouldValidate: true });
  }, [selectedParticipants, setValue]);

  useEffect(() => {
    setValue('search_radius_m', selectedRadius, { shouldValidate: true });
  }, [selectedRadius, setValue]);

  useEffect(() => {
    if (selectedValidity === 'resto_del_dia') {
      const mins = getMinutesRemainingInDay(scheduledAt);
      setValue('window_minutes', mins, { shouldValidate: true });
    } else {
      setValue('window_minutes', selectedValidity, { shouldValidate: true });
    }
  }, [selectedValidity, scheduledAt, setValue]);

  const handleRangeSelect = (rangeId: 'manana' | 'mediodia' | 'tarde' | 'noche') => {
    setSelectedRange(rangeId);
    setSelectedHour(null);
  };

  const onSubmit = (values: PlanInForm) => {
    // Autocompletar el título según la actividad y descripción a null
    const finalTitle = ACTIVITY_META[values.activity_type as ActivityType]?.label || 'Nuevo Plan';

    const payload: PlanIn = {
      activity_type: values.activity_type as ActivityType,
      mode: values.mode as PlanMode,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      window_minutes: values.window_minutes,
      max_participants: values.max_participants,
      title: finalTitle,
      description: null,
      location: {
        label: values.location.label,
        lat: gps.location?.[0] ?? values.location.lat,
        lng: gps.location?.[1] ?? values.location.lng,
      },
      search_radius_m: values.search_radius_m,
    };
    createPlan.mutate(payload, {
      onSuccess: (plan) => navigate(`/plans/${plan.id}`, { replace: true }),
    });
  };

  return (
    <div className="absolute inset-0 z-50 overflow-hidden">
      {/* Mapa de fondo */}
      <div className="absolute inset-0 z-0">
        <MapBackground userLocation={gps.location} plans={[]} />
      </div>

      {/* Backdrop translúcido */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 animate-in fade-in duration-200"
        onClick={() => navigate('/explore')}
        aria-hidden="true"
      />

      {/* Modal / Bottom Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: dragStart === null ? 'transform 0.2s ease-out' : 'none',
        }}
        className="absolute bottom-4 left-4 right-4 bg-white rounded-3xl shadow-2xl z-20 flex flex-col max-h-[88vh] overflow-hidden"
      >
        {/* Barra superior de arrastre */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full py-3 flex flex-col items-center cursor-grab active:cursor-grabbing"
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>

        {/* Cabecera del modal */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="px-5 pb-2 flex items-center justify-between"
        >
          <h1 className="text-xl font-bold text-gray-900">Crear Plan</h1>
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-transform"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 flex flex-col max-h-[75vh] overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-5 pb-2 flex flex-col gap-5">
          {/* Actividad */}
          <section>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              ¿Qué querés hacer?
            </label>
            <Controller
              control={control}
              name="activity_type"
              render={({ field }) => (
                <ActivityPicker value={field.value as ActivityType} onChange={field.onChange} />
              )}
            />
          </section>

          {/* Modalidad */}
          <section>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              ¿Cuándo?
            </label>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <div className="flex gap-2">
                  {PLAN_MODES.map((m) => {
                    const selected = field.value === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          field.onChange(m.id as PlanMode);
                          if (m.id === 'now') setValue('scheduled_at', null);
                        }}
                        className={cn(
                          'flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border',
                          selected
                            ? 'bg-gray-100 text-gray-900 border-gray-900 border-2 font-bold shadow-sm'
                            : 'bg-gray-50 text-gray-600 border-gray-200',
                        )}
                      >
                        {m.id === 'now' ? <Clock className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </section>

          {/* Fecha/hora si scheduled */}
          {mode === 'scheduled' && (
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

              {errors.scheduled_at && (
                <p className="text-xs text-red-500 mt-1">{errors.scheduled_at.message as string}</p>
              )}
            </section>
          )}

          {/* Ubicación */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Ubicación
            </label>
            <Input
              placeholder="Barrio o referencia (ej: Palermo)"
              {...register('location.label')}
              invalid={!!errors.location?.label}
            />
            {errors.location?.label && (
              <p className="text-xs text-red-500 mt-1">{errors.location.label.message as string}</p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Coordenadas:{' '}
                {gps.location
                  ? `${gps.location[0].toFixed(4)}, ${gps.location[1].toFixed(4)}`
                  : '— sin GPS —'}
              </span>
              <button
                type="button"
                className="text-brand-600 font-medium underline"
                onClick={() => void gps.request()}
              >
                {gps.location ? 'Actualizar' : 'Activar GPS'}
              </button>
            </div>
          </section>

          {/* Botón Opciones Avanzadas */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-semibold text-brand-600 flex items-center justify-between w-full py-3 border-t border-b border-gray-100 my-2"
          >
            <span>OPCIONES AVANZADAS</span>
            <span className="text-sm font-bold">{showAdvanced ? '−' : '+'}</span>
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-5 animate-in fade-in duration-200">
              {/* Participantes */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Cuánta gente busco
                </label>
                <div className="grid grid-cols-3 gap-2 w-full">
                  {([
                    { value: 1, label: 'Solo uno' },
                    { value: 4, label: 'Grupo chico' },
                    { value: 10, label: 'Sin límite' },
                  ] as const).map((opt) => {
                    const isSelected = selectedParticipants === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedParticipants(opt.value)}
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
              </section>

              {/* Radio de búsqueda */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Radio de búsqueda
                </label>
                <div className="grid grid-cols-3 gap-2 w-full">
                  {([
                    { value: 1000, label: 'Hasta 1 km' },
                    { value: 2000, label: 'Entre 1 y 2 km' },
                    { value: 5000, label: 'Hasta 5 km' },
                  ] as const).map((opt) => {
                    const isSelected = selectedRadius === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedRadius(opt.value)}
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
              </section>

              {/* Ventana de validez */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Vigencia del plan
                </label>
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  {([
                    { value: 60, label: '1 hora' },
                    { value: 120, label: '2 horas' },
                    { value: 180, label: '3 horas' },
                    { value: 'resto_del_dia', label: 'Resto del día' },
                  ] as const).map((opt) => {
                    const isSelected = selectedValidity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedValidity(opt.value)}
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
              </section>
            </div>
          )}

          </div>

          <div className="px-5 pb-5 pt-2 border-t border-gray-100/60 bg-white">
            <Button type="submit" disabled={isSubmitting || createPlan.isPending} className="w-full">
              {createPlan.isPending ? 'Publicando...' : 'Publicar Plan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
