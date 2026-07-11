// frontend/src/features/plans/components/EditPlanSheet.tsx
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Calendar, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ActivityPicker } from './ActivityPicker';
import { ParticipantPicker } from './ParticipantPicker';
import { RadiusPicker } from './RadiusPicker';
import { SchedulePicker } from './SchedulePicker';
import { PLAN_MODES } from '../constants';
import { planInSchema, type PlanInForm } from '../schemas';
import { useUpdatePlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import type { PlanOut } from '../types';
import type { ActivityType, PlanMode, PlanIn } from '../types';

interface Props {
  plan: PlanOut;
  onClose: () => void;
  onSaved?: (plan: PlanOut) => void;
}

export function EditPlanSheet({ plan, onClose, onSaved }: Props) {
  const updatePlan = useUpdatePlan(plan.id);
  const gps = useUserLocation();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanInForm>({
    resolver: zodResolver(planInSchema) as any,
    defaultValues: {
      activity_type: plan.activity_type,
      mode: plan.mode,
      scheduled_at: plan.scheduled_at,
      window_minutes: plan.window_minutes,
      max_participants: plan.max_participants,
      title: plan.title,
      description: plan.description,
      location: {
        lat: plan.location_lat,
        lng: plan.location_lng,
        label: plan.location_label,
      },
      search_radius_m: plan.search_radius_m,
    },
    mode: 'onTouched',
  });

  const mode = watch('mode');

  const [selectedValidity, setSelectedValidity] = useState<
    60 | 120 | 180 | 'resto_del_dia'
  >(() => {
    const wm = plan.window_minutes;
    if (wm === 60) return 60;
    if (wm === 120) return 120;
    if (wm === 180) return 180;
    return 'resto_del_dia';
  });

  const scheduledAt = watch('scheduled_at');

  // Helper para vigencia: calcular minutos restantes del día
  const getMinutesRemainingInDay = (scheduledAtIso: string | null) => {
    const baseDate = scheduledAtIso ? new Date(scheduledAtIso) : new Date();
    const endOfDay = new Date(baseDate);
    endOfDay.setHours(23, 59, 59, 999);
    const diffMs = endOfDay.getTime() - baseDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return Math.max(15, Math.min(1440, diffMins));
  };

  useEffect(() => {
    if (selectedValidity === 'resto_del_dia') {
      const mins = getMinutesRemainingInDay(scheduledAt);
      setValue('window_minutes', mins, { shouldValidate: true });
    } else {
      setValue('window_minutes', selectedValidity, { shouldValidate: true });
    }
  }, [selectedValidity, scheduledAt, setValue]);

  const onSubmit = (values: PlanInForm) => {
    const payload: PlanIn = {
      activity_type: values.activity_type as ActivityType,
      mode: values.mode as PlanMode,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      window_minutes: values.window_minutes,
      max_participants: values.max_participants,
      title: values.title,
      description: values.description ?? null,
      location: {
        label: values.location.label,
        lat: gps.location?.[0] ?? values.location.lat,
        lng: gps.location?.[1] ?? values.location.lng,
      },
      search_radius_m: values.search_radius_m,
    };
    updatePlan.mutate(payload, {
      onSuccess: (updated) => {
        onSaved?.(updated);
        onClose();
      },
    });
  };

  return (
    <div className="absolute inset-0 z-[110] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[88vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Modificar plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Actividad */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ¿Qué querés hacer?
            </label>
            <Controller
              control={control}
              name="activity_type"
              render={({ field }) => (
                <ActivityPicker
                  value={field.value as ActivityType}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {/* Modalidad */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
                        {m.id === 'now' ? (
                          <Clock className="w-4 h-4" />
                        ) : (
                          <Calendar className="w-4 h-4" />
                        )}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {/* Fecha/hora si scheduled */}
          {mode === 'scheduled' && (
            <Controller
              control={control}
              name="scheduled_at"
              render={({ field }) => (
                <SchedulePicker
                  value={field.value as string | null}
                  onChange={field.onChange}
                  error={errors.scheduled_at?.message as string | undefined}
                />
              )}
            />
          )}

          {/* Título */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Título
            </label>
            <Input {...register('title')} invalid={!!errors.title} />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">
                {errors.title.message as string}
              </p>
            )}
          </div>

          {/* Descripción */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Descripción
            </label>
            <Textarea
              rows={3}
              {...register('description')}
              invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-xs text-red-500 mt-1">
                {errors.description.message as string}
              </p>
            )}
          </div>

          {/* Ubicación */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Ubicación
            </label>
            <Input
              placeholder="Barrio o referencia (ej: Palermo)"
              {...register('location.label')}
              invalid={!!errors.location?.label}
            />
            {errors.location?.label && (
              <p className="text-xs text-red-500 mt-1">
                {errors.location.label.message as string}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Coordenadas:{' '}
                {gps.location
                  ? `${gps.location[0].toFixed(4)}, ${gps.location[1].toFixed(4)}`
                  : `${plan.location_lat.toFixed(4)}, ${plan.location_lng.toFixed(4)}`}
              </span>
              <button
                type="button"
                className="text-brand-600 font-medium underline"
                onClick={() => void gps.request()}
              >
                {gps.location ? 'Actualizar' : 'Activar GPS'}
              </button>
            </div>
          </div>

          {/* Participantes */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cuánta gente busco
            </label>
            <Controller
              control={control}
              name="max_participants"
              render={({ field }) => (
                <ParticipantPicker
                  value={field.value as number}
                  onChange={field.onChange}
                />
              )}
            />
            {plan.current_participants > 0 && (
              <p className="text-xs text-gray-400">
                Hay {plan.current_participants} participante
                {plan.current_participants === 1 ? '' : 's'} aceptado
                {plan.current_participants === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          {/* Radio de búsqueda */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Radio de búsqueda
            </label>
            <Controller
              control={control}
              name="search_radius_m"
              render={({ field }) => (
                <RadiusPicker
                  value={field.value as number}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {/* Vigencia */}
          <div className="flex flex-col gap-2">
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
          </div>

          <div className="pt-2 pb-4">
            <Button type="submit" disabled={updatePlan.isPending} className="w-full">
              {updatePlan.isPending ? 'Modificando...' : 'Modificar plan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
