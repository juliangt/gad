// frontend/src/features/plans/components/EditPlanSheet.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
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
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[80vh] overflow-y-auto hide-scrollbar">
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

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Fecha y hora (solo si es agendado)
            </label>
            <Input
              type="datetime-local"
              invalid={!!errors.scheduled_at}
              defaultValue={
                plan.scheduled_at
                  ? new Date(plan.scheduled_at).toISOString().slice(0, 16)
                  : undefined
              }
              onChange={(e) => {
                const v = e.target.value;
                setValue('scheduled_at', v ? new Date(v).toISOString() : null, {
                  shouldValidate: true,
                });
              }}
            />
            {errors.scheduled_at && (
              <p className="text-xs text-red-500 mt-1">{errors.scheduled_at.message as string}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cupo máximo (1–10)
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              {...register('max_participants', { valueAsNumber: true })}
              invalid={!!errors.max_participants}
            />
            {errors.max_participants && (
              <p className="text-xs text-red-500 mt-1">
                {errors.max_participants.message as string}
              </p>
            )}
            <p className="text-xs text-gray-400">
              No puede ser menor a los ya aceptados ({plan.current_participants}).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Radio de búsqueda (metros, 100–50000)
            </label>
            <Input
              type="number"
              min={100}
              max={50000}
              step={100}
              {...register('search_radius_m', { valueAsNumber: true })}
              invalid={!!errors.search_radius_m}
            />
            {errors.search_radius_m && (
              <p className="text-xs text-red-500 mt-1">
                {errors.search_radius_m.message as string}
              </p>
            )}
          </div>

          <Button type="submit" disabled={updatePlan.isPending}>
            {updatePlan.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </div>
    </div>
  );
}
