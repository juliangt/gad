// frontend/src/features/plans/schemas.ts
import { z } from 'zod';
import { ACTIVITY_TYPES, PLAN_MODES } from './constants';

const activityEnum = z.enum(
  ACTIVITY_TYPES.map((a) => a.id) as [string, ...string[]],
);
const modeEnum = z.enum(PLAN_MODES.map((m) => m.id) as [string, ...string[]]);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1).max(200),
});

/**
 * Schema de PlanIn. La regla de negocio clave es:
 * si mode === 'scheduled', scheduled_at es obligatorio y debe ser ISO válido.
 */
export const planInSchema = z
  .object({
    activity_type: activityEnum,
    mode: modeEnum,
    scheduled_at: z.union([z.string().datetime(), z.null()]).default(null),
    window_minutes: z.number().int().min(15).max(1440).default(120),
    max_participants: z.number().int().min(1).max(10).default(1),
    title: z.string().min(1).max(200),
    description: z.union([z.string().max(1000), z.null()]).default(null),
    location: locationSchema,
    search_radius_m: z.number().int().min(100).max(50000).default(2000),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'scheduled' && !val.scheduled_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduled_at'],
        message: 'Elegí cuándo querés que suceda el plan',
      });
    }
  });

export type PlanInForm = z.infer<typeof planInSchema>;

/** PlanUpdateIn: todos los campos opcionales. */
export const planUpdateInSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.union([z.string().max(1000), z.null()]).optional(),
    scheduled_at: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .strict();

export type PlanUpdateForm = z.infer<typeof planUpdateInSchema>;
