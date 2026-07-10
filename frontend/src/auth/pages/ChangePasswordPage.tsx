import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { changePasswordSchema, type ChangePasswordValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

export function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const rate = useRateLimit();

  const {
    register: field,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
    try {
      await changePassword(values.old_password, values.new_password);
      // El AuthProvider.changePassword ya limpió sesión (access invalidado por el backend).
      // RequireAuth nos va a redirigir a /login. Avisamos al usuario.
      toast.success('Contraseña actualizada. Iniciá sesión con la nueva.');
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('confirm_password', {
            message: 'Demasiados intentos. Esperá para reintentar.',
          });
        } else if (err.code === 'invalid_credentials') {
          setError('old_password', { message: 'La contraseña actual es incorrecta.' });
        } else {
          setError('confirm_password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos cambiar tu contraseña. Probá de nuevo.');
      }
    }
  };

  return (
    <AuthLayout title="Cambiar contraseña" subtitle="Vas a tener que iniciar sesión de nuevo">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Por seguridad, al cambiar la contraseña cerramos tu sesión en todos los dispositivos.
        </div>

        <div>
          <label htmlFor="old_password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña actual
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="old_password"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña actual"
              invalid={Boolean(errors.old_password)}
              className="pl-9"
              {...field('old_password')}
            />
          </div>
          {errors.old_password && (
            <p className="text-xs text-red-600 mt-1">{errors.old_password.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              invalid={Boolean(errors.new_password)}
              className="pl-9"
              {...field('new_password')}
            />
          </div>
          {errors.new_password && (
            <p className="text-xs text-red-600 mt-1">{errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Repetí la nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Repetí la nueva contraseña"
              invalid={Boolean(errors.confirm_password)}
              className="pl-9"
              {...field('confirm_password')}
            />
          </div>
          {errors.confirm_password && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
          )}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Cambiar contraseña'}
        </Button>
      </form>
    </AuthLayout>
  );
}
