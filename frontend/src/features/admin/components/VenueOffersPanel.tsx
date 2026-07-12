import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Badge } from '../../../components/ui/Badge';
import {
  useCreateVenueOffer,
  useUpdateVenueOffer,
  useDeleteVenueOffer,
} from '../hooks';
import type { VenueAdminOut, VenueOfferCreateInput } from '../types';

const REDEMPTION_METHODS = ['code', 'qr', 'mention'];

interface VenueOffersPanelProps {
  open: boolean;
  onClose: () => void;
  venue: VenueAdminOut | null;
}

export function VenueOffersPanel({ open, onClose, venue }: VenueOffersPanelProps) {
  const createOffer = useCreateVenueOffer();
  const updateOffer = useUpdateVenueOffer();
  const deleteOffer = useDeleteVenueOffer();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VenueOfferCreateInput>({
    title: '', description: '', redemption_method: 'code',
    valid_from: '', valid_until: '',
  });

  function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!venue) return;
    createOffer.mutate(
      { venueId: venue.id, input: form },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({ title: '', description: '', redemption_method: 'code', valid_from: '', valid_until: '' });
        },
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ofertas — ${venue?.name ?? ''}`}>
      <div className="space-y-3">
        {venue?.offers.length === 0 && (
          <p className="text-sm text-gray-600">Sin ofertas. Creá la primera.</p>
        )}
        <ul className="space-y-2">
          {venue?.offers.map((offer) => (
            <li key={offer.id} className="rounded-xl bg-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{offer.title}</p>
                  <p className="text-xs text-gray-500">
                    {offer.redemption_method} · hasta {new Date(offer.valid_until).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={offer.active ? 'success' : 'neutral'}>
                    {offer.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <label className="text-xs">
                    <input
                      type="checkbox"
                      checked={offer.active}
                      onChange={() =>
                        venue && updateOffer.mutate({
                          venueId: venue.id, offerId: offer.id,
                          input: { active: !offer.active },
                        })
                      }
                    /> activar
                  </label>
                  <Button size="sm" variant="danger"
                    onClick={() => venue && deleteOffer.mutate({ venueId: venue.id, offerId: offer.id })}>
                    Eliminar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {!showForm ? (
          <Button variant="secondary" onClick={() => setShowForm(true)}>Nueva oferta</Button>
        ) : (
          <form onSubmit={submitOffer} className="space-y-2 rounded-xl bg-gray-50 p-3">
            <Input required placeholder="Título" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Descripción" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
              value={form.redemption_method}
              onChange={(e) => setForm({ ...form, redemption_method: e.target.value })}>
              {REDEMPTION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="datetime-local" required value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              <Input type="datetime-local" required value={form.valid_until}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={createOffer.isPending}>Crear oferta</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
