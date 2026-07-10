// frontend/src/features/matching/pages/MatchesPage.tsx
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { MatchCard } from '../components/MatchCard';
import { useMatches } from '../hooks';
import type { ApiError } from '../../../api/errors';

export default function MatchesPage() {
  const navigate = useNavigate();
  const query = useMatches();

  const matches = query.data?.pages.flatMap((p) => p.items) ?? [];
  const apiErr = query.error as ApiError | null;

  // Separamos activos del resto para UX.
  const active = matches.filter((m) => m.status === 'active');
  const past = matches.filter((m) => m.status !== 'active');

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col pt-safe-top">
      {/* Header (migrado de MatchesView App.tsx:235-239) */}
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
        <p className="text-sm text-gray-500 mt-1">Tus salidas confirmadas</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {query.isLoading && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Spinner />
            <p className="text-sm text-gray-500">Cargando tus matches...</p>
          </div>
        )}

        {!query.isLoading && query.isError && (
          <ErrorState
            message={apiErr?.detail ?? 'No se pudieron cargar tus matches.'}
            onRetry={() => void query.refetch()}
          />
        )}

        {!query.isLoading && !query.isError && matches.length === 0 && (
          <EmptyState
            title="No tenés matches todavía"
            description="Cuando un organizador acepte tu postulación —o aceptes una al plan que creaste— aparecerá acá."
            icon={<MessageCircle className="w-8 h-8 text-gray-300" />}
            action={
              <Button variant="secondary" size="sm" onClick={() => navigate('/explore')}>
                Explorar planes
              </Button>
            }
          />
        )}

        {/* Activos */}
        {active.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Activos</h2>
            {active.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={(id) => navigate(`/matches/${id}`)}
                showChatButton
              />
            ))}
          </section>
        )}

        {/* Historial (completados/cancelados) */}
        {past.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-700 px-1">Historial</h2>
            {past.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={(id) => navigate(`/matches/${id}`)}
              />
            ))}
          </section>
        )}

        {query.hasNextPage && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
