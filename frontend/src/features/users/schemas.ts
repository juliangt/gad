import { z } from 'zod';

// --- Enums espejo del contrato (zod requiere literales) ---
export const ACTIVITY_VALUES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'] as const;
export const GENDER_VALUES = ['male', 'female', 'nonbinary', 'undisclosed'] as const;
export const GROUP_SIZE_VALUES = ['one_on_one', 'small_group', 'either'] as const;
export const GENDER_PREFERENCE_VALUES = ['any', 'same', 'mixed', 'specific'] as const;

export const activityTypeSchema = z.enum(ACTIVITY_VALUES);
export const genderSchema = z.enum(GENDER_VALUES);
export const groupSizeSchema = z.enum(GROUP_SIZE_VALUES);
export const genderPreferenceSchema = z.enum(GENDER_PREFERENCE_VALUES);

// --- PATCH /me ---
export const userUpdateSchema = z.object({
  display_name: z.string().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  bio: z.string().max(500, 'Máximo 500 caracteres').nullable().optional(),
  birth_date: z.string().nullable().optional(), // yyyy-mm-dd vía <input type="date">
  gender: genderSchema.nullable().optional(),
  locale: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});
export type UserUpdateFormValues = z.infer<typeof userUpdateSchema>;

// --- PUT /me/preferences ---
export const preferencesSchema = z
  .object({
    default_search_radius_m: z
      .number({ message: 'Ingresá un número' })
      .int('Debe ser entero')
      .min(100, 'Mínimo 100 m')
      .max(50000, 'Máximo 50000 m'),
    activity_types: z.array(activityTypeSchema),
    group_size_preference: groupSizeSchema,
    age_range_min: z.number().int().min(18, 'Mínimo 18').max(99, 'Máximo 99'),
    age_range_max: z.number().int().min(18, 'Mínimo 18').max(99, 'Máximo 99'),
    gender_preference: genderPreferenceSchema,
    notify_new_plans: z.boolean(),
    notify_messages: z.boolean(),
    notify_pending_alerts: z.boolean(),
  })
  .refine((d) => d.age_range_min <= d.age_range_max, {
    path: ['age_range_max'],
    message: 'La edad máxima no puede ser menor que la mínima',
  });
export type PreferencesFormValues = z.infer<typeof preferencesSchema>;
