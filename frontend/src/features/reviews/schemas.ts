import { z } from 'zod';

/**
 * Validación de ReviewIn (contrato: rating 1..5, comment ..1000, flag enum).
 * match_id y reviewee_id son UUIDs pasados desde el contexto (ocultos en el form).
 */
export const reviewSchema = z.object({
  match_id: z.string().min(1, 'Falta el encuentro.'),
  reviewee_id: z.string().min(1, 'Falta la persona a reseñar.'),
  rating: z
    .number({ invalid_type_error: 'Seleccioná una calificación.' })
    .int()
    .min(1, 'Seleccioná al menos 1 estrella.')
    .max(5, 'Máximo 5 estrellas.'),
  comment: z
    .string()
    .trim()
    .max(1000, 'El comentario no puede superar los 1000 caracteres.')
    .optional()
    .or(z.literal('')),
  flag: z
    .union([z.literal(''), z.enum(['no_show', 'inappropriate', 'false_info'])])
    .nullish()
    .transform((v) => (v === '' ? null : v)),
});

export type ReviewValues = z.infer<typeof reviewSchema>;

/** Labels es-AR para los flags. */
export const REVIEW_FLAG_LABELS: Record<NonNullable<z.infer<typeof reviewSchema>['flag']>, string> = {
  no_show: 'No se presentó',
  inappropriate: 'Comportamiento inapropiado',
  false_info: 'Información falsa',
};
