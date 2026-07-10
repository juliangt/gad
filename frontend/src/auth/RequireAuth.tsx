import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { Spinner } from '../components/ui/Spinner';

/**
 * Guard: si está cargando, muestra spinner; si no autenticado, redirige a /login
 * preservando la ubicación original en `state.from`.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
