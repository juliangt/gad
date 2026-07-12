import { useFeatureFlags, useUpdateFeatureFlag } from '../../hooks';
import { Spinner } from '../../../../components/ui/Spinner';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Badge } from '../../../../components/ui/Badge';

export function FeatureFlagsTab() {
  const { data, isLoading, isError, refetch } = useFeatureFlags();
  const update = useUpdateFeatureFlag();

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <ul className="space-y-2">
      {data?.map((flag) => (
        <li
          key={flag.key}
          className="glass-panel rounded-xl p-4 flex items-center justify-between"
        >
          <div>
            <p className="font-mono text-sm font-medium">{flag.key}</p>
            {flag.description && <p className="text-sm text-gray-600">{flag.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={flag.enabled ? 'success' : 'neutral'}>
              {flag.enabled ? 'Activo' : 'Inactivo'}
            </Badge>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={flag.enabled}
                disabled={update.isPending}
                onChange={() => update.mutate({ key: flag.key, enabled: !flag.enabled })}
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-brand-600 transition-colors relative">
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${flag.enabled ? 'translate-x-5' : ''}`}
                />
              </div>
            </label>
          </div>
        </li>
      ))}
    </ul>
  );
}
