import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { Spinner } from '../../components/ui/Spinner';

/**
 * `GET /auth/me` (UserPublic) — incluye `is_admin` para que el guard pueda
 * decidir sin un endpoint aparte. Se lee defensivamente: si el campo no viene,
 * default false.
 */
interface MeForAdmin {
  is_admin?: boolean;
}

function useIsAdmin(): { isLoading: boolean; isAdmin: boolean } {
  const { status } = useAuth();
  const enabled = status === 'authenticated';
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'admin-check'],
    queryFn: () => apiGet<MeForAdmin>('/auth/me'),
    enabled,
    staleTime: 5 * 60_000, // el rol no cambia en sesión
  });
  return { isLoading: enabled && isLoading, isAdmin: Boolean(data?.is_admin) };
}

/**
 * Guard admin: requiere auth Y `is_admin === true` (vía GET /me).
 * - loading → spinner.
 * - no auth → /login.
 * - auth pero no admin → /explore (403 implícito en UI; el backend devolverá 403 en endpoints).
 */
export function RequireAdminRoute() {
  const { status } = useAuth();
  const { isLoading, isAdmin } = useIsAdmin();

  if (status === 'loading' || isLoading) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/explore" replace />;
  }

  return <Outlet />;
}
