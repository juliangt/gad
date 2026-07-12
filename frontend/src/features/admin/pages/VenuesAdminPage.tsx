import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { VenueRow } from '../components/VenueRow';
import { VenueFormModal } from '../components/VenueFormModal';
import { VenueOffersPanel } from '../components/VenueOffersPanel';
import {
  useAdminVenues,
  useApproveVenue,
  usePauseVenue,
  useRevokeVenue,
} from '../hooks';
import type { VenueAdminOut } from '../types';

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'Activos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'revoked', label: 'Revocados' },
];

export default function VenuesAdminPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const query = useAdminVenues(status);
  const approve = useApproveVenue();
  const pause = usePauseVenue();
  const revoke = useRevokeVenue();
  const busy = approve.isPending || pause.isPending || revoke.isPending;

  const [formOpen, setFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueAdminOut | null>(null);
  const [offersVenue, setOffersVenue] = useState<VenueAdminOut | null>(null);

  const venues = query.data ?? [];

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Venues sponsoreados</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filtrar por estado"
            className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit overflow-x-auto"
          >
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${
                  status === f.value
                    ? 'bg-white shadow text-gray-900 font-medium'
                    : 'text-gray-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button
            onClick={() => {
              setEditingVenue(null);
              setFormOpen(true);
            }}
          >
            Nuevo venue
          </Button>
        </div>

        {query.isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}
        {query.isError && (
          <ErrorState title="No se pudieron cargar los venues" onRetry={() => query.refetch()} />
        )}
        {!query.isLoading && !query.isError && venues.length === 0 && (
          <EmptyState
            icon={<MapPin className="w-8 h-8" />}
            title="Sin venues"
            description="No hay venues en este estado."
          />
        )}

        <ul className="space-y-2">
          {venues.map((v) => (
            <VenueRow
              key={v.id}
              venue={v}
              onApprove={(id) => approve.mutate(id)}
              onPause={(id) => pause.mutate(id)}
              onRevoke={(id) => revoke.mutate(id)}
              onEdit={(venue) => {
                setEditingVenue(venue);
                setFormOpen(true);
              }}
              onManageOffers={(venue) => setOffersVenue(venue)}
              busy={busy}
            />
          ))}
        </ul>
      </main>

      <VenueFormModal open={formOpen} onClose={() => setFormOpen(false)} venue={editingVenue} />
      <VenueOffersPanel
        open={offersVenue !== null}
        onClose={() => setOffersVenue(null)}
        venue={offersVenue}
      />
    </div>
  );
}
