import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Ban, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { useUser, useBlock } from '../hooks';
import { UserAvatar } from '../components/UserAvatar';
import { VerificationBadge } from '../components/VerificationBadge';

export default function UserPublicPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, refetch } = useUser(userId);
  const block = useBlock();

  const onBlock = () => {
    block.mutate(userId, {
      onSuccess: () => toast.success('Usuario bloqueado'),
      onError: () => toast.error('No se pudo bloquear.'),
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-95"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Perfil</h1>
      </div>

      <div className="flex-1 px-6 py-6 flex flex-col items-center text-center">
        {isLoading && <Spinner className="w-6 h-6 text-brand-600" />}
        {isError && (
          <ErrorState message="No pudimos cargar este perfil." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && user && (
          <>
            <UserAvatar url={user.avatar_url} name={user.display_name} size="xl" className="mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">{user.display_name}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              Reputación: {user.reputation_score.toFixed(1)}
            </p>
            <div className="mt-3 mb-4">
              <VerificationBadge level={user.verification_level} />
            </div>

            {user.bio && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-w-sm">
                {user.bio}
              </p>
            )}

            {/* Reportes se implementan en F6; se enlaza al flujo futuro */}
            <div className="flex flex-col gap-2 w-full max-w-xs mt-8">
              <Button
                variant="secondary"
                onClick={onBlock}
                loading={block.isPending}
                disabled={block.isPending}
              >
                <Ban className="w-4 h-4" /> Bloquear usuario
              </Button>
              {/* /users/:userId/report — F6; ruta futura */}
              <Link
                to={`/users/${userId}/report`}
                className="inline-flex items-center justify-center gap-2 text-sm text-gray-500 py-2"
              >
                <Flag className="w-4 h-4" /> Reportar (próximamente)
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
