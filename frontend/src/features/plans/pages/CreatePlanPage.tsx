// frontend/src/features/plans/pages/CreatePlanPage.tsx
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Calendar, ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ActivityPicker } from '../components/ActivityPicker';
import { PLAN_DEFAULTS, PLAN_MODES } from '../constants';
import { planInSchema, type PlanInForm } from '../schemas';
import { useCreatePlan } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import type { ActivityType, PlanIn, PlanMode } from '../types';

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
      title: '',
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

  const onSubmit = (values: PlanInForm) => {
    // El schema enum se infiere como `string` (ver schemas.ts), pero la validación
    // runtime de zod ya garantizó que son literales válidos de ActivityType/PlanMode.
    // Para mode=now, enviamos null (el backend usa "ahora").
    const payload: PlanIn = {
      activity_type: values.activity_type as ActivityType,
      mode: values.mode as PlanMode,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      window_minutes: values.window_minutes,
      max_participants: values.max_participants,
      title: values.title,
      description: values.description,
      // Forzar coords del usuario si las tenemos y el usuario no editó manualmente el label vacío.
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
    <div className="w-full h-[100dvh] bg-gray-50 flex flex-col pt-safe-top">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => navigate('/explore')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Crear Plan</h1>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex-1 overflow-y-auto p-5 flex flex-col gap-5"
      >
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
                          ? 'bg-brand-50 text-brand-600 border-brand-200'
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
          <section className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ¿Cuándo sucede?
            </label>
            <Input
              type="datetime-local"
              {...register('scheduled_at')}
              // datetime-local no admite ISO con Z; el usuario elige local y lo normalizamos antes del envío.
              onChange={(e) => {
                const v = e.target.value;
                setValue('scheduled_at', v ? new Date(v).toISOString() : null, { shouldValidate: true });
              }}
              invalid={!!errors.scheduled_at}
            />
            {errors.scheduled_at && (
              <p className="text-xs text-red-500 mt-1">{errors.scheduled_at.message as string}</p>
            )}
          </section>
        )}

        {/* Título */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Título
          </label>
          <Input
            placeholder="Ej: Café de especialidad en Palermo"
            {...register('title')}
            invalid={!!errors.title}
          />
          {errors.title && (
            <p className="text-xs text-red-500 mt-1">{errors.title.message as string}</p>
          )}
        </section>

        {/* Descripción */}
        <section>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            Descripción (opcional)
          </label>
          <Textarea
            rows={3}
            placeholder="Contá de qué se trata el plan..."
            {...register('description')}
            invalid={!!errors.description}
          />
          {errors.description && (
            <p className="text-xs text-red-500 mt-1">{errors.description.message as string}</p>
          )}
        </section>

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

        {/* Participantes */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Cuánta gente busco (máx.)
          </label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={10}
              className="w-24"
              invalid={!!errors.max_participants}
              {...register('max_participants', { valueAsNumber: true })}
            />
            <span className="text-xs text-gray-500">Entre 1 y 10</span>
          </div>
          {errors.max_participants && (
            <p className="text-xs text-red-500 mt-1">{errors.max_participants.message as string}</p>
          )}
        </section>

        {/* Radio de búsqueda */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Radio de búsqueda (metros)
          </label>
          <Input
            type="number"
            min={100}
            max={50000}
            step={100}
            invalid={!!errors.search_radius_m}
            {...register('search_radius_m', { valueAsNumber: true })}
          />
          {errors.search_radius_m && (
            <p className="text-xs text-red-500 mt-1">{errors.search_radius_m.message as string}</p>
          )}
        </section>

        {/* Ventana de validez */}
        <section className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Vigencia del plan (minutos)
          </label>
          <Input
            type="number"
            min={15}
            max={1440}
            step={15}
            invalid={!!errors.window_minutes}
            {...register('window_minutes', { valueAsNumber: true })}
          />
          {errors.window_minutes && (
            <p className="text-xs text-red-500 mt-1">{errors.window_minutes.message as string}</p>
          )}
        </section>

        <Button type="submit" disabled={isSubmitting || createPlan.isPending} className="mt-2">
          {createPlan.isPending ? 'Publicando...' : 'Publicar Plan'}
        </Button>
      </form>
    </div>
  );
}
