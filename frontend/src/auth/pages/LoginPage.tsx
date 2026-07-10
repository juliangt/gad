import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton, isGoogleAuthEnabled } from '../components/GoogleButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { loginSchema, type LoginValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const rate = useRateLimit();
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/explore';

  // Si ya hay sesión, salir de /login hacia la ruta intención.
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      toast.success('¡Bienvenido de nuevo!');
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('password', { message: 'Demasiados intentos. Esperá para reintentar.' });
        } else if (err.code === 'invalid_credentials') {
          setError('password', { message: 'Email o contraseña incorrectos.' });
        } else {
          setError('password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos iniciar sesión. Probá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || rate.blocked;

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Conectá con gente cerca para salir a hacer planes"
      footer={
        <span>
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="text-brand-600 font-semibold">
            Crear cuenta
          </Link>
        </span>
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              invalid={Boolean(errors.password)}
              className="pl-9"
              {...field('password')}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          )}
          <Link
            to="/forgot-password"
            className="block text-xs text-brand-600 font-medium mt-1.5 text-right"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button type="submit" loading={submitting} disabled={disabled} fullWidth>
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Iniciar sesión'}
        </Button>
      </form>

      {isGoogleAuthEnabled() && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton
            onSuccess={() => navigate(from, { replace: true })}
          />
        </>
      )}
    </AuthLayout>
  );
}
