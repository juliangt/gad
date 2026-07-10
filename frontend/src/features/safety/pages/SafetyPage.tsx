// frontend/src/features/safety/pages/SafetyPage.tsx
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { LiveTracker } from '../components/LiveTracker';
import { PeerLocation } from '../components/PeerLocation';
import { SosButton } from '../components/SosButton';
import { ShareLinkCard } from '../components/ShareLinkCard';
import { useMatch } from '../../matching/hooks';
import { ApiError } from '../../../api/errors';

export default function SafetyPage() {
  const { matchId = '' } = useParams<{ matchId: string }>();
  const { data: match, isLoading, isError, error, refetch } = useMatch(matchId);

  const isActive = match?.status === 'active';

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to={`/matches/${matchId}`}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Volver al match"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-600" /> Seguridad del encuentro
          </h1>
          {match && (
            <Badge variant={isActive ? 'success' : 'neutral'} className="ml-auto">
              {isActive ? 'Activo' : match.status === 'completed' ? 'Finalizado' : 'Cancelado'}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-5">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {isError && (() => {
          const apiErr = error instanceof ApiError ? error : null;
          return (
            <ErrorState
              title="No encontramos el encuentro"
              message={apiErr?.detail}
              onRetry={() => refetch()}
            />
          );
        })()}

        {!isLoading && !isError && match && (
          <>
            {!isActive && (
              <section className="glass-panel rounded-2xl p-5 text-sm text-gray-600">
                Este encuentro {match.status === 'completed' ? 'finalizó' : 'fue cancelado'}. El
                seguimiento en vivo y el SOS están disponibles solo durante un match activo.
              </section>
            )}

            {isActive && (
              <>
                <LiveTracker matchId={matchId} />
                <PeerLocation matchId={matchId} enabled={isActive} />
                <ShareLinkCard matchId={matchId} />
                <section>
                  <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500" /> Emergencia
                  </h2>
                  <SosButton matchId={matchId} />
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
