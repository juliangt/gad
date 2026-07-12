import { useEffect, useState } from 'react';
import { useOperational, useUpdateOperational } from '../../hooks';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Spinner } from '../../../../components/ui/Spinner';
import { ErrorState } from '../../../../components/ui/ErrorState';
import type { OperationalSettingsOut } from '../../types';

export function OperationalTab() {
  const { data, isLoading, isError, refetch } = useOperational();
  const update = useUpdateOperational();
  const [form, setForm] = useState<OperationalSettingsOut | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!form) return null;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}
      className="space-y-4"
    >
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.rate_limit_enabled}
          onChange={(e) => setForm({ ...form, rate_limit_enabled: e.target.checked })}
        />
        Rate limiting habilitado
      </label>
      <label className="text-sm">
        Límite default
        <Input
          type="text"
          value={form.default_rate_limit}
          onChange={(e) => setForm({ ...form, default_rate_limit: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Expiración access token (min)
          <Input
            type="number"
            min={1}
            value={form.access_token_expire_minutes}
            onChange={(e) => setForm({ ...form, access_token_expire_minutes: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Expiración refresh token (días)
          <Input
            type="number"
            min={1}
            value={form.refresh_token_expire_days}
            onChange={(e) => setForm({ ...form, refresh_token_expire_days: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Tamaño máx. avatar (bytes)
          <Input
            type="number"
            min={1024}
            value={form.max_avatar_bytes}
            onChange={(e) => setForm({ ...form, max_avatar_bytes: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Rate máx. mensajes WS
          <Input
            type="number"
            min={1}
            value={form.ws_max_message_rate}
            onChange={(e) => setForm({ ...form, ws_max_message_rate: Number(e.target.value) })}
          />
        </label>
      </div>
      <Button type="submit" loading={update.isPending}>Guardar parámetros</Button>
    </form>
  );
}
