import { z } from 'zod';

/**
 * Regla de contraseña del backend: 8..128 caracteres.
 * Reutilizada en registro, reseteo y cambio de contraseña.
 */
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede tener más de 128 caracteres');

/** Login: solo requiere email válido + password no vacío (longitud la valida el backend). */
export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

/** Registro: email + password 8..128 + display_name 1..100. */
export const registerSchema = z.object({
  display_name: z
    .string()
    .min(1, 'Ingresá tu nombre')
    .max(100, 'El nombre no puede tener más de 100 caracteres'),
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
  password: passwordSchema,
});

/** Solicitar reseteo: solo email. */
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
});

/** Confirmar reseteo: el token llega por query param (?token=); el form pide new + confirm. */
const resetPasswordFields = z.object({
  token: z.string().min(1, 'Falta el token de reseteo'),
  new_password: passwordSchema,
  confirm_password: passwordSchema,
});

export const resetPasswordSchema = resetPasswordFields.refine(
  (data) => data.new_password === data.confirm_password,
  {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  },
);

/** Versión del schema de reseteo sin el campo `token` (el token llega por query param,
 *  no por el form). Se usa en ResetPasswordPage para validar solo new + confirm. */
export const resetPasswordFormSchema = resetPasswordFields
  .omit({ token: true })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  });

/** Cambio de contraseña: new debe diferir de old y coincidir con confirm. */
export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Ingresá tu contraseña actual'),
    new_password: passwordSchema,
    confirm_password: passwordSchema,
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  })
  .refine((data) => data.old_password !== data.new_password, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['new_password'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
