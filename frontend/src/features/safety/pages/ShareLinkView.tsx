// frontend/src/features/safety/pages/ShareLinkView.tsx
//
// RUTA PÚBLICA: NO requiere auth. Se registra FUERA de RequireAuth en router.tsx.
// El hook usePublicLocation marca el GET /s/{token} con publicEndpoint:true.
//
import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { AlertTriangle, Clock, MapPin, ShieldOff, Eye } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { Badge } from '../../../components/ui/Badge';
import { usePublicLocation } from '../hooks';
import { ApiError } from '../../../api/errors';
import { formatRelativeTime, formatDateTime } from '../../../lib/format';

export default function ShareLinkView() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, isError, error, refetch } = usePublicLocation(token);

  // Refetch suave cada 15s (staleTime=15s del hook); lo fuerza al volver el foco.
  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900">Ubicación compartida</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Eye className="w-3 h-3" /> Vista pública · GAD
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner />
            <p className="text-sm text-gray-500">Cargando ubicación…</p>
          </div>
        )}

        {isError && (() => {
          const apiErr = error instanceof ApiError ? error : null;
          const invalidToken = apiErr?.code === 'invalid_token' || apiErr?.status === 401;
          if (invalidToken) {
            return (
              <div className="flex flex-col items-center justify-center text-center py-16">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <ShieldOff className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Link inválido o expirado</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-xs">
                  Este link de seguimiento no es válido, fue revocado o caducó. Pedile a la persona
                  que genere uno nuevo.
                </p>
              </div>
            );
          }
          return (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">No encontramos esta ubicación</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">
                {apiErr?.detail ?? 'El link no existe o fue removido.'}
              </p>
            </div>
          );
        })()}

        {!isLoading && !isError && data && (
          <>
            {data.expired && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Encuentro finalizado</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Este link ya no se actualiza en vivo. La última ubicación conocida queda visible
                    como referencia.
                  </p>
                </div>
              </div>
            )}

            <section className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold text-lg">
                  {(data.user_display_name?.charAt(0) ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 truncate">{data.user_display_name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {data.last_ping_at ? (
                      <Badge variant="neutral">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(data.last_ping_at)}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Sin ubicación todavía</Badge>
                    )}
                  </div>
                </div>
              </div>

              {data.lat === null || data.lng === null ? (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-8 text-center">
                  <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    La persona todavía no compartió su ubicación.
                  </p>
                </div>
              ) : (
                <div className="relative h-64 rounded-xl overflow-hidden border border-gray-100">
                  <MapBackground
                    userLocation={[data.lat, data.lng]}
                    plans={[{ id: 'shared', lat: data.lat, lng: data.lng }]}
                  />
                </div>
              )}

              {data.last_ping_at && (
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Última actualización: {formatDateTime(data.last_ping_at)}
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
