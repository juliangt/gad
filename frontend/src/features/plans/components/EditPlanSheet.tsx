// frontend/src/features/plans/components/EditPlanSheet.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { ParticipantPicker } from './ParticipantPicker';
import { RadiusPicker } from './RadiusPicker';
import { SchedulePicker } from './SchedulePicker';
import { planUpdateInSchema, type PlanUpdateForm } from '../schemas';
import { useUpdatePlan } from '../hooks';
import type { PlanOut } from '../types';

interface Props {
  plan: PlanOut;
  onClose: () => void;
  onSaved?: (plan: PlanOut) => void;
}

export function EditPlanSheet({ plan, onClose, onSaved }: Props) {
  const updatePlan = useUpdatePlan(plan.id);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanUpdateForm>({
    resolver: zodResolver(planUpdateInSchema),
    defaultValues: {
      title: plan.title,
      description: plan.description,
      scheduled_at: plan.scheduled_at,
      max_participants: plan.max_participants,
      search_radius_m: plan.search_radius_m,
    },
    mode: 'onTouched',
  });

  const onSubmit = (values: PlanUpdateForm) => {
    const payload = {
      title: values.title,
      description: values.description ?? null,
      scheduled_at: values.scheduled_at ?? null,
      max_participants: values.max_participants,
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
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Editar plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Título
            </label>
            <Input {...register('title')} invalid={!!errors.title} />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title.message as string}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Descripción
            </label>
            <Textarea
              rows={4}
              {...register('description')}
              invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-xs text-red-500 mt-1">{errors.description.message as string}</p>
            )}
          </div>

          {/* Fecha/hora — solo si el plan es agendado */}
          {plan.mode === 'scheduled' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Fecha y hora
              </label>
              <SchedulePicker
                value={watch('scheduled_at') ?? null}
                onChange={(iso) => setValue('scheduled_at', iso, { shouldValidate: true })}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cuánta gente busco
            </label>
            <ParticipantPicker
              value={watch('max_participants') ?? plan.max_participants}
              onChange={(v) => setValue('max_participants', v, { shouldValidate: true })}
            />
            {plan.current_participants > 0 && (
              <p className="text-xs text-gray-400">
                Hay {plan.current_participants} participante
                {plan.current_participants === 1 ? '' : 's'} aceptado
                {plan.current_participants === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Radio de búsqueda
            </label>
            <RadiusPicker
              value={watch('search_radius_m') ?? plan.search_radius_m}
              onChange={(v) => setValue('search_radius_m', v, { shouldValidate: true })}
            />
          </div>

          <Button type="submit" disabled={updatePlan.isPending}>
            {updatePlan.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </div>
    </div>
  );
}
