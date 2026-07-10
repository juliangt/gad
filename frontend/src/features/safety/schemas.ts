import { z } from 'zod';

/**
 * Validación de TrustedContactIn (contrato: contact_value 3..255, label 1..100).
 * contact_type es enum 'email' | 'phone'.
 */
export const trustedContactSchema = z
  .object({
    contact_type: z.enum(['email', 'phone']),
    contact_value: z
      .string()
      .trim()
      .min(3, 'Ingresá al menos 3 caracteres.')
      .max(255, 'No puede superar los 255 caracteres.'),
    label: z
      .string()
      .trim()
      .min(1, 'Ingresá una etiqueta.')
      .max(100, 'La etiqueta no puede superar los 100 caracteres.'),
  })
  .superRefine((data, ctx) => {
    if (data.contact_type === 'email') {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_value);
      if (!emailOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_value'],
          message: 'Ingresá un email válido.',
        });
      }
    } else {
      // phone: dígitos, espacios, +, -, (, ). Al menos 6 dígitos.
      const digits = data.contact_value.replace(/\D/g, '');
      if (digits.length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_value'],
          message: 'Ingresá un teléfono válido (al menos 6 dígitos).',
        });
      }
    }
  });

export type TrustedContactValues = z.infer<typeof trustedContactSchema>;

/**
 * Validación de PingIn (lat -90..90, lng -180..180).
 * Usado por ping y SOS.
 */
export const pingSchema = z.object({
  lat: z.number().min(-90, 'Latitud inválida.').max(90, 'Latitud inválida.'),
  lng: z.number().min(-180, 'Longitud inválida.').max(180, 'Longitud inválida.'),
});

export type PingValues = z.infer<typeof pingSchema>;
