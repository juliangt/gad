import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMe, useUpdatePreferences } from '../hooks';
import { preferencesSchema, type PreferencesFormValues } from '../schemas';
import { ActivityTypeChips } from './ActivityTypeChips';
import { GENDER_PREFERENCE_OPTIONS } from '../constants';
import type { ActivityType } from '@/types/enums';
import { ParticipantPicker } from '../../plans/components/ParticipantPicker';
import { RadiusPicker } from '../../plans/components/RadiusPicker';
import { ValidityPicker } from '../../plans/components/ValidityPicker';

const selectClass =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';
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
        <span className={sectionLabelClass}>Rango de edad</span>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label htmlFor="age_range_min" className="sr-only">
              Edad mínima
            </label>
            <Input
              id="age_range_min"
              type="number"
              min={18}
              max={99}
              invalid={Boolean(errors.age_range_min)}
              {...register('age_range_min', { valueAsNumber: true })}
            />
          </div>
          <span className="text-gray-400">–</span>
          <div className="flex-1">
            <label htmlFor="age_range_max" className="sr-only">
              Edad máxima
            </label>
            <Input
              id="age_range_max"
              type="number"
              min={18}
              max={99}
              invalid={Boolean(errors.age_range_max)}
              {...register('age_range_max', { valueAsNumber: true })}
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
        <label htmlFor="gender_preference" className={sectionLabelClass}>
          Preferencia de género
        </label>
        <select id="gender_preference" className={selectClass} {...register('gender_preference')}>
          {GENDER_PREFERENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
