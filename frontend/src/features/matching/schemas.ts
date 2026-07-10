// frontend/src/features/matching/schemas.ts
import { z } from 'zod';

/**
 * Schema de ApplicationIn (POST /plans/{id}/applications).
 * El contrato dice: `message?: string | null` con máximo 500.
 *
 * Reglas de UI:
 * - Si el usuario deja el textarea vacío o solo espacios → enviamos `message: null`
 *   (no un string vacío). El backend lo persiste como null.
 * - Recortamos whitespace alrededor para no contar padding en el límite de 500.
 * - Un string vacío (`""`) crudo NO es válido: o se omite la clave o se envía `null`.
 *   Se diferencia de un string solo-whitespace (`"   "`), que se normaliza a `null`.
 */
export const applicationInSchema = z.object({
  message: z
    .preprocess((v) => {
      // undefined (clave ausente) → se omite en el resultado final.
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v !== 'string') return v; // que la union rechace tipos no válidos
      // String vacío crudo (length 0) pasa intacto → z.string().min(1) lo rechaza.
      if (v.length === 0) return v;
      const trimmed = v.trim();
      // Solo-whitespace (length > 0) → null. Texto real → recortado.
      return trimmed.length === 0 ? null : trimmed;
    }, z.union([z.string().min(1).max(500), z.null()]).optional())
    .refine(
      (v) => v === undefined || v === null || v.length <= 500,
      { message: 'El mensaje no puede superar los 500 caracteres' },
    ),
});

export type ApplicationInForm = z.infer<typeof applicationInSchema>;
