import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAdminUserDetail } from '../hooks';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { AdminNav } from '../components/AdminNav';
import { UserDetailSections } from '../components/UserDetailSections';

export default function UserDetailAdminPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError, refetch } = useAdminUserDetail(id ?? '');

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-2"
          >
            <ArrowLeft size={16} /> Usuarios
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Detalle de usuario</h1>
          <AdminNav />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : user ? (
          <>
            <div className="glass-panel rounded-xl p-4">
              <h2 className="font-bold text-gray-900">{user.display_name}</h2>
              <p className="text-sm text-gray-600">{user.email}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Estado</dt>
                  <dd>{user.status}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Admin</dt>
                  <dd>{user.is_admin ? 'Sí' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Reputación</dt>
                  <dd>{user.reputation_score.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Rating prom.</dt>
                  <dd>{user.avg_rating.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Planes</dt>
                  <dd>{user.plans_count}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Matches</dt>
                  <dd>{user.matches_count}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Reportes rec.</dt>
                  <dd>{user.reports_received}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Verificación</dt>
                  <dd>{user.verification_level}</dd>
                </div>
              </dl>
            </div>
            <UserDetailSections userId={user.id} />
          </>
        ) : null}
      </main>
    </div>
  );
}
