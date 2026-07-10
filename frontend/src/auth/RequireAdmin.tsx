import { Navigate, Outlet } from 'react-router-dom';
import type { UserPublic } from '../types/common';
import { useAuth } from './useAuth';
import { Spinner } from '../components/ui/Spinner';

/**
 * Guard admin: requiere auth + flag admin.
 * `UserPublic` del contrato actual no expone `is_admin`; lo casteamos
 * defensivamente. F7 lo reemplazará cuando el contrato exponga el rol
 * del usuario (o cuando se use GET /admin/stats como señal).
 */
export function RequireAdmin() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  // is_admin no está en UserPublic aún; default false (F7 lo ajusta).
  const isAdmin = Boolean((user as UserPublic & { is_admin?: boolean }).is_admin);
  if (!isAdmin) {
    return <Navigate to="/explore" replace />;
  }

  return <Outlet />;
}
