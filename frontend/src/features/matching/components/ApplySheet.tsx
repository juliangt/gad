// frontend/src/features/matching/components/ApplySheet.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { applicationInSchema, type ApplicationInForm } from '../schemas';
import { useApply } from '../hooks';

interface Props {
  planId: string;
  planTitle: string;
  onClose: () => void;
  onApplied?: () => void;
}

/** Bottom-sheet para postularse a un plan con mensaje opcional (max 500). */
export function ApplySheet({ planId, planTitle, onClose, onApplied }: Props) {
  const apply = useApply(planId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ApplicationInForm>({
    resolver: zodResolver(applicationInSchema),
    defaultValues: { message: null },
    mode: 'onChange',
  });

  const messageValue = watch('message');
  // messageValue puede ser undefined/null (inicial) o string; contamos length del string.
  const charCount = (typeof messageValue === 'string' ? messageValue : '').length;
  const MAX = 500;

  const onSubmit = (values: ApplicationInForm) => {
    apply.mutate(
      // El schema ya normaliza: undefined/null/whitespace → null.
      { message: values.message ?? null },
      {
        onSuccess: () => {
          onApplied?.();
          onClose();
        },
      },
    );
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[80vh] overflow-y-auto hide-scrollbar">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Postularme</h2>
            <p className="text-sm text-gray-500 mt-0.5">{planTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 flex-shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Mensaje al organizador (opcional)
            </label>
            <Textarea
              rows={4}
              maxLength={MAX}
              placeholder="Contale algo al organizador: por qué te sumás, disponibilidad, etc."
              invalid={!!errors.message}
              {...register('message')}
            />
            {errors.message && (
              <p className="text-xs text-red-500 mt-1">
                {errors.message.message as string}
              </p>
            )}
            <div className="flex justify-end text-xs text-gray-400">
              {charCount}/{MAX}
            </div>
          </div>

          <Button type="submit" disabled={apply.isPending}>
            {apply.isPending ? 'Enviando...' : 'Postularme'}
          </Button>
        </form>
      </div>
    </div>
  );
}
