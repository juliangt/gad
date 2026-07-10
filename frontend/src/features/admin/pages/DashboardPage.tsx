import { Users, CalendarDays, Handshake, Flag } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { AdminStatCard } from '../components/AdminStatCard';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useAdminStats } from '../hooks';

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useAdminStats();

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Panel de administración</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
        {isError && <ErrorState title="No se pudieron cargar las métricas" onRetry={() => refetch()} />}
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <AdminStatCard label="Usuarios" value={data.total_users} icon={Users} tone="brand" />
            <AdminStatCard label="Planes" value={data.total_plans} icon={CalendarDays} tone="info" />
            <AdminStatCard label="Matches" value={data.total_matches} icon={Handshake} tone="success" />
            <AdminStatCard label="Reportes abiertos" value={data.open_reports} icon={Flag} tone={data.open_reports > 0 ? 'danger' : 'brand'} />
          </div>
        )}
      </main>
    </div>
  );
}
