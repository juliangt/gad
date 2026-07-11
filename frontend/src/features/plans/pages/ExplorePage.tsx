// frontend/src/features/plans/pages/ExplorePage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, Plus, SlidersHorizontal } from 'lucide-react';
import { MapBackground } from '../../../components/MapBackground';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { cn } from '../../../lib/utils';
import { GpsIndicator } from '../components/GpsIndicator';
import { PlanCard } from '../components/PlanCard';
import { PlanFilters } from '../components/PlanFilters';
import { AvailabilityToggle } from '../../availability/components/AvailabilityToggle';
import { usePlans } from '../hooks';
import { useUserLocation } from '../useUserLocation';
import type { PlansQuery, PlanFiltersState } from '../types';

/** Mapea status del hook → status del GpsIndicator. */
function toIndicator(
  s: 'idle' | 'requesting' | 'granted' | 'denied',
): 'searching' | 'fixed' | 'denied' {
  if (s === 'granted') return 'fixed';
  if (s === 'denied') return 'denied';
  return 'searching';
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const gps = useUserLocation();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<PlanFiltersState>({ activity: 'all', mode: 'all' });
  const [recenterToken, setRecenterToken] = useState(0);

  // Pedir ubicación al montar.
  useEffect(() => {
    void gps.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plansQuery: PlansQuery | null = gps.location
    ? {
        lat: gps.location[0],
        lng: gps.location[1],
        radius: 5000,
        activity: filters.activity === 'all' ? undefined : filters.activity,
        mode: filters.mode === 'all' ? undefined : filters.mode,
      }
    : null;

  const { data: plans, isLoading, isError, error, refetch } = usePlans(plansQuery);

  const planMarkers = useMemo(
    () =>
      (plans ?? []).map((p) => ({
        id: p.id,
        lat: p.location_lat,
        lng: p.location_lng,
      })),
    [plans],
  );

  return (
    <div className="absolute inset-0">
      <MapBackground
        userLocation={gps.location}
        plans={planMarkers}
        onPlanClick={(id) => navigate(`/plans/${id}`)}
        // recenterToken se consume vía key para forzar re-mount del updater si MapBackground
        // no expone un método público. (Alternativa: pasar prop extra. Aquí usamos key.)
        key={`map-${recenterToken}`}
      />

      {/* Top floating area */}
      <div className="absolute top-0 w-full z-40 p-4 pt-safe-top flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-3xl font-bold tracking-tighter text-gray-900 drop-shadow-md">
            GAD
          </h1>
        </div>
        <div className="pointer-events-auto">
          <GpsIndicator status={toIndicator(gps.status)} />
        </div>
      </div>

      {/* Re-center + Filtros */}
      <div className="absolute bottom-44 right-4 z-40 flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            if (gps.location) setRecenterToken((t) => t + 1);
            else void gps.request();
          }}
          className="glass-button w-12 h-12 rounded-full flex items-center justify-center text-gray-700 shadow-lg"
          aria-label="Centrar mapa en mi ubicación"
        >
          <LocateFixed className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'glass-button w-12 h-12 rounded-full flex items-center justify-center shadow-lg',
            showFilters ? 'text-brand-600' : 'text-gray-700',
          )}
          aria-label="Mostrar filtros"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Filtros (toggle) */}
      {showFilters && (
        <div className="absolute top-16 left-0 w-full z-40 px-4 pointer-events-auto">
          <div className="glass-panel rounded-2xl p-3">
            <PlanFilters value={filters} onChange={setFilters} />
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <div className="absolute bottom-20 w-full z-40 flex flex-col pointer-events-none">
        <div className="h-8 bg-gradient-to-t from-white/10 to-transparent w-full" />
        <div className="px-4 pb-6 flex flex-col gap-3 pointer-events-auto max-h-[40vh] overflow-y-auto hide-scrollbar">
          {gps.location && (
            <AvailabilityToggle location={gps.location} radiusM={5000} />
          )}
          <div className={cn(
            'flex flex-col gap-3',
            gps.location && !isLoading && !isError && (plans?.length ?? 0) === 0 && 'bg-white rounded-3xl p-5 shadow-lg border border-gray-100/80 pointer-events-auto',
          )}>
            <div className="flex items-center justify-between mb-1 px-1">
              <h2 className="text-sm font-semibold text-gray-800 drop-shadow-sm">
                Cerca de ti
              </h2>
              <span className="text-xs font-medium text-brand-600 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full shadow-sm border border-gray-100">
                {plans?.length ?? 0} planes
              </span>
            </div>

            {gps.status === 'denied' && (
              <div className="glass-panel rounded-2xl p-4 text-sm text-gray-700 flex flex-col gap-2 bg-white">
                <p>
                  Necesitamos tu ubicación para buscar planes cerca. Habilitá el permiso o
                  ingresá un barrio.
                </p>
                <button
                  type="button"
                  onClick={() => void gps.request()}
                  className="self-start text-brand-600 font-medium underline"
                >
                  Reintentar GPS
                </button>
              </div>
            )}

            {gps.location && isLoading && (
              <div className="flex flex-col items-center gap-2 py-6">
                <Spinner />
                <p className="text-sm text-gray-500">Buscando planes...</p>
              </div>
            )}
            {gps.location && isError && (
              <ErrorState
                message={(error as { detail?: string })?.detail ?? 'No se pudieron cargar los planes'}
                onRetry={() => void refetch()}
              />
            )}
            {gps.location && !isLoading && !isError && (plans?.length ?? 0) === 0 && (
              <EmptyState
                title="No hay planes cerca"
                description="Sé el primero en crear uno con el botón +"
              />
            )}

            {(plans ?? []).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                userLocation={gps.location}
                onClick={(id) => navigate(`/plans/${id}`)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <button
          type="button"
          onClick={() => navigate('/plans/new')}
          className="bg-gray-900 text-white shadow-xl shadow-gray-900/20 w-14 h-14 rounded-full flex items-center justify-center transform transition-transform active:scale-95 border border-gray-800"
          aria-label="Crear plan"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
