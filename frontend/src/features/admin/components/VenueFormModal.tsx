import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useCreateVenue, useUpdateVenue } from '../hooks';
import type { VenueAdminOut, VenueCreateInput } from '../types';

const CATEGORIES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'];

interface VenueFormModalProps {
  open: boolean;
  onClose: () => void;
  venue?: VenueAdminOut | null;
}

export function VenueFormModal({ open, onClose, venue }: VenueFormModalProps) {
  const create = useCreateVenue();
  const update = useUpdateVenue();
  const isEdit = Boolean(venue);

  const [form, setForm] = useState<VenueCreateInput>({
    name: venue?.name ?? '',
    category: venue?.category ?? 'coffee',
    address: venue?.address ?? '',
    lat: venue?.lat ?? 0,
    lng: venue?.lng ?? 0,
    owner_name: venue?.owner_name ?? '',
    owner_email: venue?.owner_email ?? '',
    owner_phone: venue?.owner_phone ?? null,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && venue) {
      update.mutate({ venueId: venue.id, input: form }, { onSuccess: onClose });
    } else {
      create.mutate(form, { onSuccess: onClose });
    }
  }

  const loading = create.isPending || update.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar venue' : 'Nuevo venue'}>
      <form onSubmit={submit} className="space-y-3">
        <label className="text-sm">
          Nombre
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm">
          Categoría
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Dirección
          <Input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Latitud
            <Input type="number" step="any" required value={form.lat}
              onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} />
          </label>
          <label className="text-sm">
            Longitud
            <Input type="number" step="any" required value={form.lng}
              onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} />
          </label>
        </div>
        <label className="text-sm">
          Nombre del responsable
          <Input required value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
        </label>
        <label className="text-sm">
          Email del responsable
          <Input type="email" required value={form.owner_email}
            onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
        </label>
        <label className="text-sm">
          Teléfono (opcional)
          <Input value={form.owner_phone ?? ''}
            onChange={(e) => setForm({ ...form, owner_phone: e.target.value || null })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  );
}
