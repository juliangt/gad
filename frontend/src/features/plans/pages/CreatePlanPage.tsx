// frontend/src/features/plans/pages/CreatePlanPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Calendar, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ActivityPicker } from '../components/ActivityPicker';
import { ParticipantPicker } from '../components/ParticipantPicker';
import { RadiusPicker } from '../components/RadiusPicker';
import { SchedulePicker } from '../components/SchedulePicker';
import { ValidityPicker } from '../components/ValidityPicker';
import { PLAN_DEFAULTS, PLAN_MODES, ACTIVITY_META } from '../constants';
import { planInSchema, type PlanInForm } from '../schemas';
import { useCreatePlan } from '../hooks';
import { useMe } from '../../users/hooks';
import { useUserLocation } from '../useUserLocation';
import { MapPicker } from '../components/MapPicker';
import type { ActivityType, PlanIn, PlanMode } from '../types';

export default function CreatePlanPage() {
  const navigate = useNavigate();
  const gps = useUserLocation();
  const createPlan = useCreatePlan();
  const { data: me } = useMe();

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
      title_suffix: '',
      description: null,
      location: {
        // Coords por defecto: las del usuario si ya hay, si no centro de CABA.
        lat: gps.location?.[0] ?? -34.5900,
        lng: gps.location?.[1] ?? -58.4300,
        label: '—',
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
  const scheduledAt = watch('scheduled_at');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Estados locales para los botones de las opciones avanzadas
  const [selectedValidity, setSelectedValidity] = useState<
    60 | 120 | 180 | 0
  >(120);

  // Cargar preferencias del usuario como valores por defecto al iniciar
  useEffect(() => {
    if (me?.preferences) {
      const radius = me.preferences.default_search_radius_m;
      if (radius) {
        setValue('search_radius_m', radius);
      }
      const validity = me.preferences.default_plan_validity_mins;
      if (validity === 0) {
        setSelectedValidity(0);
      } else if (validity === 60 || validity === 120 || validity === 180) {
        setSelectedValidity(validity as any);
      }
      const groupSize = me.preferences.group_size_preference;
      if (groupSize) {
        const groupSizeMap = {
          one_on_one: 1,
          small_group: 4,
          either: 10,
        };
        setValue('max_participants', groupSizeMap[groupSize]);
      }
    }
  }, [me, setValue]);

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

  // Sincronizar vigencia con react-hook-form
  useEffect(() => {
    if (selectedValidity === 0) {
      const mins = getMinutesRemainingInDay(scheduledAt);
      setValue('window_minutes', mins, { shouldValidate: true });
    } else {
      setValue('window_minutes', selectedValidity, { shouldValidate: true });
    }
  }, [selectedValidity, scheduledAt, setValue]);

  const onSubmit = (values: PlanInForm) => {
    const activityLabel = ACTIVITY_META[values.activity_type as ActivityType]?.label || 'Nuevo Plan';
    const suffix = values.title_suffix?.trim() ?? '';
    const finalTitle = suffix ? `${activityLabel} · ${suffix}` : activityLabel;

    const payload: PlanIn = {
      activity_type: values.activity_type as ActivityType,
      mode: values.mode as PlanMode,
      scheduled_at: values.mode === 'scheduled' ? values.scheduled_at : null,
      window_minutes: values.window_minutes,
      max_participants: values.max_participants,
      title: finalTitle,
      description: values.description?.trim() ? values.description : null,
      location: {
        label: suffix || '—',
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
      {/* Mapa de fondo táctil */}
      <div className="absolute inset-0 z-0">
        <MapPicker
          userLocation={gps.location}
          onMapClick={(lat, lng) => gps.setManualLocation(lat, lng)}
          circle={{
            center: gps.location ?? [-34.5900, -58.4300],
            radiusM: watch('search_radius_m'),
          }}
          pickerMarker={gps.location}
        />
      </div>



      {/* Modal / Bottom Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: dragStart === null ? 'transform 0.2s ease-out, max-h 0.3s ease-in-out, height 0.3s ease-in-out' : 'none',
        }}
        className={cn(
          "absolute bottom-4 left-4 right-4 bg-white rounded-3xl shadow-2xl z-20 flex flex-col overflow-hidden transition-all duration-300 ease-in-out",
          isMinimized ? "max-h-[140px] h-[140px]" : "max-h-[88vh]"
        )}
      >
        {/* Barra superior de arrastre / Clickeable para minimizar/agrandar */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsMinimized(!isMinimized)}
          className="w-full py-4 flex flex-col items-center cursor-pointer hover:bg-gray-50 transition-colors"
          title={isMinimized ? "Expandir formulario" : "Minimizar formulario"}
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Cabecera del modal */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="px-5 pb-2 flex items-center justify-between"
        >
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gray-900">Crear Plan</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-transform"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isMinimized && (
          <div className="px-5 pb-4 animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="w-full py-2 bg-brand-50 text-brand-700 rounded-xl font-semibold text-sm hover:bg-brand-100 transition-colors"
            >
              Expandir formulario para continuar
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className={cn(
            "flex-1 flex flex-col max-h-[75vh] overflow-hidden",
            isMinimized && "hidden"
          )}
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

          {/* Ubicación: punto de referencia via mapa */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Ubicación
            </label>
            <p className="text-xs text-gray-400">Tocá el mapa para ubicar tu plan</p>
          </section>

          {/* Referencia (campo title_suffix) */}
          <section className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Referencia
            </label>
            <Input
              placeholder="Palermo, plaza del barrio"
              maxLength={32}
              {...register('title_suffix')}
            />
            {errors.title_suffix && (
              <p className="text-xs text-red-500 mt-1">{errors.title_suffix.message as string}</p>
            )}
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
              {/* Más detalles (campo description) */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Más detalles
                </label>
                <Textarea
                  placeholder="Opcional"
                  maxLength={1000}
                  rows={3}
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-xs text-red-500 mt-1">{errors.description.message as string}</p>
                )}
              </section>

              {/* Participantes */}
              <section className="flex flex-col gap-2">
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
              </section>

              {/* Radio de búsqueda */}
              <section className="flex flex-col gap-2">
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
              </section>

              {/* Ventana de validez */}
              <section className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Vigencia del plan
                </label>
                <ValidityPicker
                  value={selectedValidity}
                  onChange={setSelectedValidity}
                />
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
