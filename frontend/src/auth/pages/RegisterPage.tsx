import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, Lock, User } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton, isGoogleAuthEnabled } from '../components/GoogleButton';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../useAuth';
import { useRateLimit } from '../useRateLimit';
import { registerSchema, type RegisterValues } from '../schemas';
import { ApiError, mapErrorMessage } from '../../api/errors';

export function RegisterPage() {
  const { register: registerUser, status } = useAuth();
  const navigate = useNavigate();
  const rate = useRateLimit();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/explore" replace />;
  }

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { display_name: '', email: '', password: '' },
  });

  const onSubmit = async (values: RegisterValues) => {
    setSubmitting(true);
    try {
      await registerUser(values.email, values.password, values.display_name);
      toast.success('¡Cuenta creada! Bienvenido a GAD.');
      navigate('/explore', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'rate_limit_exceeded') {
          rate.start(err.retryAfter ?? 60);
          setError('password', { message: 'Demasiados intentos. Esperá para reintentar.' });
        } else if (err.code === 'email_already_exists') {
          setError('email', { message: 'Ya existe una cuenta con ese email.' });
        } else {
          setError('password', { message: mapErrorMessage(err.code, err.detail) });
        }
      } else {
        toast.error('No pudimos crear tu cuenta. Probá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || rate.blocked;

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Empezá a hacer planes cerca tuyo"
      footer={
        <span>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-brand-600 font-semibold">
            Iniciar sesión
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="display_name"
              autoComplete="nickname"
              placeholder="Cómo te llaman"
              invalid={Boolean(errors.display_name)}
              className="pl-9"
              {...field('display_name')}
            />
          </div>
          {errors.display_name && (
            <p className="text-xs text-red-600 mt-1">{errors.display_name.message}</p>
          )}
        </div>

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
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              invalid={Boolean(errors.password)}
              className="pl-9"
              {...field('password')}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          )}
        </div>

        {rate.blocked && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Demasiados intentos. Volvé a probar en {rate.seconds}s.
          </p>
        )}

        <Button type="submit" loading={submitting} disabled={disabled} fullWidth>
          {rate.blocked ? `Esperá ${rate.seconds}s` : 'Crear cuenta'}
        </Button>
      </form>

      {isGoogleAuthEnabled() && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton onSuccess={() => navigate('/explore', { replace: true })} />
        </>
      )}
    </AuthLayout>
  );
}
