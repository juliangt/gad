import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useRateLimit } from '../useRateLimit';
import { usePasswordResetRequest } from '../hooks';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';
import { ApiError } from '../../api/errors';

export function ForgotPasswordPage() {
  const requestReset = usePasswordResetRequest();
  const rate = useRateLimit();
  const [sent, setSent] = useState(false);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    try {
      await requestReset.mutateAsync(values.email);
      // El backend siempre 202; no revelamos si el email existe.
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rate_limit_exceeded') {
        rate.start(err.retryAfter ?? 60);
        setError('email', { message: 'Demasiados pedidos. Esperá para reintentar.' });
      } else {
        // Incluso ante errores inesperados, no filtramos existencia del email:
        // mostramos el mismo estado de éxito.
        setSent(true);
      }
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Revisá tu email">
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <p className="text-sm text-gray-600">
            Si el email existe, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 font-semibold mt-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviamos un enlace para restablecerla"
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-brand-600 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a iniciar sesión
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="vos@email.com"
              invalid={Boolean(errors.email)}
              className="pl-9"
              {...field('email')}
            />
          </div>
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados pedidos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button
          type="submit"
          loading={requestReset.isPending}
          disabled={rate.blocked}
          fullWidth
        >
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Enviar enlace'}
        </Button>
      </form>
    </AuthLayout>
  );
}
