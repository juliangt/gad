import { useEffect, useState } from 'react';
import { useMaintenance, useUpdateMaintenance } from '../../hooks';
import { Button } from '../../../../components/ui/Button';
import { Textarea } from '../../../../components/ui/Textarea';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Spinner } from '../../../../components/ui/Spinner';
import { Badge } from '../../../../components/ui/Badge';
import type { MaintenanceOut } from '../../types';

export function MaintenanceTab() {
  const { data, isLoading } = useMaintenance();
  const update = useUpdateMaintenance();
  const [form, setForm] = useState<MaintenanceOut | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Corrección del self-review: useEffect (NO useState con callback),
  // que era incorrecto en el plan original.
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !data) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  const current = form ?? data;

  function submit(nextEnabled: boolean) {
    update.mutate({
      enabled: nextEnabled,
      message: current.message,
      banner_active: current.banner_active,
      banner_message: current.banner_message,
      banner_level: current.banner_level,
    });
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Modo mantenimiento</p>
          <p className="text-sm text-gray-600">Bloquea el acceso a usuarios no-admin (devuelve 503).</p>
        </div>
        <Badge variant={current.enabled ? 'danger' : 'neutral'}>
          {current.enabled ? 'ACTIVO' : 'Inactivo'}
        </Badge>
      </div>

      <label className="text-sm">
        Mensaje de mantenimiento
        <Textarea
          value={current.message}
          onChange={(e) => setForm({ ...current, message: e.target.value })}
        />
      </label>

      <div className="border-t pt-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={current.banner_active}
            onChange={(e) => setForm({ ...current, banner_active: e.target.checked })}
          />
          Banner global activo
        </label>
      </div>
      <label className="text-sm">
        Mensaje del banner
        <Textarea
          value={current.banner_message}
          onChange={(e) => setForm({ ...current, banner_message: e.target.value })}
        />
      </label>
      <label className="text-sm">
        Nivel del banner
        <select
          className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
          value={current.banner_level}
          onChange={(e) => setForm({ ...current, banner_level: e.target.value as 'info' | 'warning' })}
        >
          <option value="info">Info</option>
          <option value="warning">Advertencia</option>
        </select>
      </label>

      <Button
        variant={current.enabled ? 'danger' : 'primary'}
        loading={update.isPending}
        onClick={() => {
          if (!current.enabled) {
            setConfirmOpen(true);
          } else {
            submit(false);
          }
        }}
      >
        {current.enabled ? 'Desactivar mantenimiento' : 'Activar mantenimiento'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Activar modo mantenimiento"
        message="Esto bloqueará el acceso a TODOS los usuarios no-admin. ¿Confirmás que querés activarlo?"
        confirmLabel="Sí, activar"
        loading={update.isPending}
        onConfirm={() => { setConfirmOpen(false); submit(true); }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
