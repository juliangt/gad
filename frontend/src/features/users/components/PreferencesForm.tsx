import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useMe, useUpdatePreferences } from '../hooks';
import { preferencesSchema, type PreferencesFormValues } from '../schemas';
import { ActivityTypeChips } from './ActivityTypeChips';
import { GENDER_PREFERENCE_OPTIONS } from '../constants';
import type { ActivityType } from '@/types/enums';
import { ParticipantPicker } from '../../plans/components/ParticipantPicker';
import { RadiusPicker } from '../../plans/components/RadiusPicker';
import { ValidityPicker } from '../../plans/components/ValidityPicker';

const sectionLabelClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block';

/**
 * Edición de preferencias del usuario autenticado (PUT /me/preferences).
 *
 * `useForm.values` re-sincroniza desde `me.preferences` cuando carga o cambia.
 */
export function PreferencesForm() {
  const { data: me } = useMe();
  const updatePrefs = useUpdatePreferences();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
        values: me
      ? {
          default_search_radius_m: me.preferences.default_search_radius_m,
          default_plan_validity_mins: me.preferences.default_plan_validity_mins,
          activity_types: me.preferences.activity_types,
          group_size_preference: me.preferences.group_size_preference,
          age_range_min: me.preferences.age_range_min,
          age_range_max: me.preferences.age_range_max,
          gender_preference: me.preferences.gender_preference,
          notify_new_plans: me.preferences.notify_new_plans,
          notify_messages: me.preferences.notify_messages,
          notify_pending_alerts: me.preferences.notify_pending_alerts,
        }
      : undefined,
    mode: 'onBlur',
  });

  const activityTypes = watch('activity_types');

  const onActivityChange = (next: ActivityType[]) => {
    setValue('activity_types', next, { shouldDirty: true });
  };

  const onSubmit = (values: PreferencesFormValues) => {
    updatePrefs.mutate(values, {
      onSuccess: () => toast.success('Preferencias guardadas'),
      onError: () => toast.error('No se pudo guardar. Intentá de nuevo.'),
    });
  };

  if (!me) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <span className={sectionLabelClass}>Radio de búsqueda</span>
        <Controller
          control={control}
          name="default_search_radius_m"
          render={({ field }) => (
            <RadiusPicker
              value={field.value as any}
              onChange={field.onChange}
            />
          )}
        />
        {errors.default_search_radius_m && (
          <p className="text-xs text-red-600 mt-1">{errors.default_search_radius_m.message}</p>
        )}
      </div>

      <div>
        <span className={sectionLabelClass}>Vigencia del plan por defecto</span>
        <Controller
          control={control}
          name="default_plan_validity_mins"
          render={({ field }) => (
            <ValidityPicker
              value={field.value as any}
              onChange={field.onChange}
            />
          )}
        />
        {errors.default_plan_validity_mins && (
          <p className="text-xs text-red-600 mt-1">{errors.default_plan_validity_mins.message}</p>
        )}
      </div>

      <div>
        <span className={sectionLabelClass}>Intereses</span>
        <ActivityTypeChips value={activityTypes} onChange={onActivityChange} />
        {errors.activity_types && (
          <p className="text-xs text-red-600 mt-1">{errors.activity_types.message}</p>
        )}
      </div>

      <div>
        <span className={sectionLabelClass}>Tamaño de grupo</span>
        <Controller
          control={control}
          name="group_size_preference"
          render={({ field }) => {
            const valMap = {
              one_on_one: 1,
              small_group: 4,
              either: 10,
            } as const;
            const revMap = {
              1: 'one_on_one',
              4: 'small_group',
              10: 'either',
            } as const;
            const numericValue = field.value ? (valMap[field.value as keyof typeof valMap] ?? 4) : 4;
            return (
              <ParticipantPicker
                value={numericValue}
                onChange={(numVal) => field.onChange(revMap[numVal])}
              />
            );
          }}
        />
        {errors.group_size_preference && (
          <p className="text-xs text-red-600 mt-1">{errors.group_size_preference.message}</p>
        )}
      </div>

      <div>
        <span className={sectionLabelClass}>Rango de edad: {watch('age_range_min')} a {watch('age_range_max')} años</span>
        <div className="relative pt-4 pb-2 px-2">
          {/* Slider track background */}
          <div className="h-2 bg-gray-100 rounded-full w-full absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          
          {/* Active range fill track */}
          <Controller
            control={control}
            name="age_range_min"
            render={({ field: minField }) => {
              const maxVal = watch('age_range_max') ?? 99;
              const minVal = minField.value ?? 18;
              const leftPercent = ((minVal - 18) / (99 - 18)) * 100;
              const rightPercent = ((maxVal - 18) / (99 - 18)) * 100;
              
              return (
                <div
                  className="h-2 bg-brand-500 rounded-full absolute top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${rightPercent - leftPercent}%`,
                  }}
                />
              );
            }}
          />

          {/* Overlaid range inputs */}
          <div className="relative w-full h-2 flex items-center">
            <Controller
              control={control}
              name="age_range_min"
              render={({ field: minField }) => {
                const minVal = minField.value ?? 18;
                const maxVal = watch('age_range_max') ?? 99;
                const isNearMax = minVal > 90;
                return (
                  <input
                    type="range"
                    min={18}
                    max={99}
                    value={minVal}
                    onChange={(e) => {
                      const val = Math.min(Number(e.target.value), maxVal - 1);
                      minField.onChange(val);
                    }}
                    style={{ zIndex: isNearMax ? 30 : 10 }}
                    className="absolute w-full top-0 h-2 pointer-events-none appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-500 [&::-moz-range-thumb]:shadow-md"
                  />
                );
              }}
            />
            <Controller
              control={control}
              name="age_range_max"
              render={({ field: maxField }) => {
                const minVal = watch('age_range_min') ?? 18;
                const maxVal = maxField.value ?? 99;
                return (
                  <input
                    type="range"
                    min={18}
                    max={99}
                    value={maxVal}
                    onChange={(e) => {
                      const val = Math.max(Number(e.target.value), minVal + 1);
                      maxField.onChange(val);
                    }}
                    style={{ zIndex: 20 }}
                    className="absolute w-full top-0 h-2 pointer-events-none appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-500 [&::-moz-range-thumb]:shadow-md"
                  />
                );
              }}
            />
          </div>
        </div>
        {(errors.age_range_min || errors.age_range_max) && (
          <p className="text-xs text-red-600 mt-1">
            {errors.age_range_min?.message ?? errors.age_range_max?.message}
          </p>
        )}
      </div>

      <div>
        <label className={sectionLabelClass}>
          Preferencia de género
        </label>
        <Controller
          control={control}
          name="gender_preference"
          render={({ field }) => (
            <div className="grid grid-cols-4 gap-2">
              {GENDER_PREFERENCE_OPTIONS.map((o) => {
                const isSelected = field.value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => field.onChange(o.value)}
                    className={`flex items-center justify-center px-2 py-3 rounded-xl border-2 font-medium text-xs transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/50 text-brand-600'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.gender_preference && (
          <p className="text-xs text-red-600 mt-1">{errors.gender_preference.message}</p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className={sectionLabelClass}>Notificaciones</legend>

        <ToggleRow
          id="notify_new_plans"
          label="Nuevos planes"
          description="Avisos cuando se crean planes cerca tuyo."
          registration={register('notify_new_plans')}
        />
        <ToggleRow
          id="notify_messages"
          label="Mensajes"
          description="Avisos cuando recibís un mensaje nuevo."
          registration={register('notify_messages')}
        />
        <ToggleRow
          id="notify_pending_alerts"
          label="Alertas pendientes"
          description="Recordatorios de planes con actividad pendiente."
          registration={register('notify_pending_alerts')}
        />
      </fieldset>

      <Button type="submit" loading={updatePrefs.isPending || isSubmitting}>
        Guardar preferencias
      </Button>
    </form>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  // `UseFormRegisterReturn` es lo que devuelve `register()` para un campo.
  registration: ReturnType<ReturnType<typeof useForm<PreferencesFormValues>>['register']>;
}

function ToggleRow({ id, label, description, registration }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start justify-between gap-4 cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        {...registration}
      />
    </label>
  );
}
