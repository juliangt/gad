// frontend/src/features/reviews/components/ReviewForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { StarRating } from './StarRating';
import { reviewSchema, REVIEW_FLAG_LABELS, type ReviewValues } from '../schemas';
import { useCreateReview } from '../hooks';
import { ApiError } from '../../../api/errors';

export interface ReviewFormProps {
  matchId: string;
  revieweeId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ matchId, revieweeId, onSubmitted }: ReviewFormProps) {
  const createReview = useCreateReview();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema) as never,
    defaultValues: {
      match_id: matchId,
      reviewee_id: revieweeId,
      rating: 0,
      comment: '',
      flag: null,
    },
  });

  const rating = watch('rating');
  const flag = watch('flag');

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      match_id: values.match_id,
      reviewee_id: values.reviewee_id,
      rating: values.rating,
      comment: values.comment?.trim() ? values.comment.trim() : null,
      flag: values.flag ?? null,
    };
    try {
      await createReview.mutateAsync(payload);
      toast.success('¡Gracias por tu reseña!');
      reset();
      onSubmitted?.();
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      if (apiErr?.code === 'conflict') {
        toast.error('Ya dejaste una reseña por este encuentro.');
      } else if (apiErr?.status === 422) {
        toast.error(
          apiErr.detail ?? 'No podés reseñar este encuentro (¿finalizó hace más de 7 días?).',
        );
      } else if (apiErr?.code === 'rate_limit_exceeded' || apiErr?.status === 429) {
        toast.error('Alcanzaste el límite diario de reseñas (20/día). Probá mañana.');
      } else {
        toast.error(apiErr?.detail ?? 'No pudimos enviar la reseña.');
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" {...register('match_id')} />
      <input type="hidden" {...register('reviewee_id')} />

      {/* Rating */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          ¿Cómo fue tu experiencia?
        </label>
        <StarRating
          value={rating}
          size="lg"
          onChange={(v) => setValue('rating', v, { shouldValidate: true })}
        />
        {errors.rating && (
          <p className="text-xs text-red-500 mt-1">{errors.rating.message as string}</p>
        )}
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Comentario <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <Textarea
          rows={4}
          maxLength={1000}
          placeholder="Contá cómo te fue. Sé respetuoso."
          invalid={!!errors.comment}
          {...register('comment')}
        />
        {errors.comment && (
          <p className="text-xs text-red-500 mt-1">{errors.comment.message as string}</p>
        )}
      </div>

      {/* Flag */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Flag className="w-4 h-4 text-amber-500" /> Reportar un problema{' '}
          <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setValue('flag', null, { shouldValidate: true })}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              flag == null
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            Ninguno
          </button>
          {(Object.keys(REVIEW_FLAG_LABELS) as (keyof typeof REVIEW_FLAG_LABELS)[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setValue('flag', f, { shouldValidate: true })}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                flag === f
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              {REVIEW_FLAG_LABELS[f]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Marcar un problema lo notifica al equipo de moderación.
        </p>
      </div>

      <Button type="submit" fullWidth loading={createReview.isPending} disabled={rating === 0}>
        Enviar reseña
      </Button>
    </form>
  );
}
