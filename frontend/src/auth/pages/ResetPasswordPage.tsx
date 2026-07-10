import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useRateLimit } from '../useRateLimit';
import { usePasswordResetConfirm } from '../hooks';
import { resetPasswordFormSchema, type ResetPasswordValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';
import { useEffect } from 'react';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirmReset = usePasswordResetConfirm();
  const rate = useRateLimit();
  const token = params.get('token') ?? '';

  // El schema exige token; lo inyectamos como valor fijo del form.
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Omit<ResetPasswordValues, 'token'>>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  // Caso de éxito: el mutate terminó OK y no lanzó.
  const succeeded = confirmReset.isSuccess;

  useEffect(() => {
    if (succeeded) {
      const t = setTimeout(() => navigate('/login', { replace: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [succeeded, navigate]);

  if (!token) {
    return (
      <AuthLayout title="Enlace inválido">
        <div className="flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-sm text-gray-600">
            Este enlace no contiene un token válido. Solicité uno nuevo.
          </p>
          <Link to="/forgot-password" className="text-brand-600 font-semibold text-sm mt-2">
            Solicitar nuevo enlace
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (succeeded) {
    return (
      <AuthLayout title="Contraseña restablecida">
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <p className="text-sm text-gray-600">
            Tu contraseña se actualizó. Iniciá sesión con la nueva.
          </p>
          <Link to="/login" className="text-brand-600 font-semibold text-sm mt-2">
            Ir a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async (values: Omit<ResetPasswordValues, 'token'>) => {
    try {
      await confirmReset.mutateAsync({ token, new_password: values.new_password });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('confirm_password', {
            message: 'Demasiados intentos. Esperá para reintentar.',
          });
        } else if (err.code === 'invalid_token') {
          setError('new_password', {
            message: 'El enlace expiró o es inválido. Solicitá uno nuevo.',
          });
        } else {
          setError('confirm_password', { message: mapErrorMessage(err.code, err.detail) });
        }
      }
    }
  };

  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elegí una contraseña nueva">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
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
            Repetí la contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Repetí la contraseña"
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
          loading={confirmReset.isPending}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Restablecer contraseña'}
        </Button>
      </form>
    </AuthLayout>
  );
}
