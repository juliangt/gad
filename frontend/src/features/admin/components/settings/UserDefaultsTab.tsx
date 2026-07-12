import { useEffect, useState } from 'react';
import { useUserDefaults, useUpdateUserDefaults } from '../../hooks';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Spinner } from '../../../../components/ui/Spinner';
import { ErrorState } from '../../../../components/ui/ErrorState';
import type { UserDefaultsOut } from '../../types';

const ACTIVITY_TYPES = ['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other'];

export function UserDefaultsTab() {
  const { data, isLoading, isError, refetch } = useUserDefaults();
  const update = useUpdateUserDefaults();
  const [form, setForm] = useState<UserDefaultsOut | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!form) return null;

  function toggleActivity(a: string) {
    setForm((f) => f && ({
      ...f,
      activity_types: f.activity_types.includes(a)
        ? f.activity_types.filter((x) => x !== a)
        : [...f.activity_types, a],
    }));
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Validez de plan (min)
          <Input type="number" min={1} max={1440} value={form.default_plan_validity_mins}
            onChange={(e) => setForm({ ...form, default_plan_validity_mins: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Radio de búsqueda (m)
          <Input type="number" min={100} max={50000} value={form.default_search_radius_m}
            onChange={(e) => setForm({ ...form, default_search_radius_m: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Edad mínima
          <Input type="number" min={18} max={99} value={form.age_range_min}
            onChange={(e) => setForm({ ...form, age_range_min: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          Edad máxima
          <Input type="number" min={18} max={99} value={form.age_range_max}
            onChange={(e) => setForm({ ...form, age_range_max: Number(e.target.value) })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Tamaño de grupo
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.group_size_preference}
            onChange={(e) => setForm({ ...form, group_size_preference: e.target.value })}>
            <option value="one_on_one">Uno a uno</option>
            <option value="small_group">Grupo pequeño</option>
            <option value="either">Cualquiera</option>
          </select>
        </label>
        <label className="text-sm">
          Preferencia de género
          <select className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2"
            value={form.gender_preference}
            onChange={(e) => setForm({ ...form, gender_preference: e.target.value })}>
            <option value="any">Cualquiera</option>
            <option value="same">Mismo</option>
            <option value="mixed">Mixto</option>
            <option value="specific">Específico</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm mb-2">Tipos de actividad disponibles</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((a) => (
            <label key={a} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1 text-sm">
              <input type="checkbox" checked={form.activity_types.includes(a)} onChange={() => toggleActivity(a)} />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={update.isPending}>Guardar defaults</Button>
    </form>
  );
}
