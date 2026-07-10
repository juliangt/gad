import { Link } from 'react-router-dom';
import { ArrowLeft, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useBlocks, useUnblock } from '../hooks';

export default function BlockedUsersPage() {
  const { data: blocks, isLoading, isError, refetch } = useBlocks();
  const unblock = useUnblock();

  const onUnblock = (userId: string) => {
    unblock.mutate(userId, {
      onSuccess: () => toast.success('Usuario desbloqueado'),
      onError: () => toast.error('No se pudo desbloquear.'),
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <Link
          to="/me"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Usuarios bloqueados</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner className="w-6 h-6 text-brand-600" />
          </div>
        )}

        {isError && (
          <ErrorState message="No pudimos cargar tus bloqueos." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && (blocks?.length ?? 0) === 0 && (
          <EmptyState
            icon={<Ban className="w-8 h-8 text-gray-300" />}
            title="No tenés usuarios bloqueados"
            description="Cuando bloquees a alguien, aparecerá acá."
          />
        )}

        {!isLoading && !isError && (blocks?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-3">
            {blocks!.map((b) => (
              <li
                key={b.blocked_id}
                className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm flex items-center justify-between gap-3"
              >
                <Link to={`/users/${b.blocked_id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    Usuario {b.blocked_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Bloqueado el {new Date(b.created_at).toLocaleDateString('es-AR')}
                  </p>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={unblock.isPending && unblock.variables === b.blocked_id}
                  onClick={() => onUnblock(b.blocked_id)}
                >
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
