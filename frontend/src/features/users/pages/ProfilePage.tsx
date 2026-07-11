import { Link } from 'react-router-dom';
import { Star, ChevronRight, Ban, Pencil, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMe } from '../hooks';
import { UserAvatar } from '../components/UserAvatar';
import { VerificationBadge } from '../components/VerificationBadge';
import { ActivityTypeChips } from '../components/ActivityTypeChips';

export default function ProfilePage() {
  const { data: me, isLoading, isError, refetch } = useMe();

  if (isLoading) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center pt-safe-top">
        <Spinner className="w-6 h-6 text-brand-600" />
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center pt-safe-top px-6">
        <ErrorState
          message="No pudimos cargar tu perfil."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top overflow-y-auto">
      {/* Encabezado: avatar, nombre, reputación, verificación */}
      <div className="px-6 py-6 pb-8 border-b border-gray-100 flex flex-col items-center text-center">
        <UserAvatar url={me.avatar_url} name={me.display_name} size="xl" className="mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">{me.display_name}</h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          Reputación: {me.reputation_score.toFixed(1)}
        </p>
        <div className="mt-3">
          <VerificationBadge level={me.verification_level} />
        </div>
      </div>

      {/* Bio */}
      {me.bio && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Sobre mí
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{me.bio}</p>
        </div>
      )}

      {/* Intereses (de preferences.activity_types) */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Intereses
        </h2>
        <ActivityTypeChips
          value={me.preferences.activity_types}
          onChange={() => {}}
          readOnly
        />
      </div>

      {/* Navegación */}
      <div className="flex-1 px-6 py-6 flex flex-col gap-3">
        <NavLink to="/me/edit" icon={<Pencil className="w-5 h-5 text-gray-400" />} label="Editar perfil" />
        <NavLink to="/me/blocks" icon={<Ban className="w-5 h-5 text-gray-400" />} label="Usuarios bloqueados" />
        {/* /me/trusted-contacts se implementa en F6; se enlaza como teaser */}
        <NavLink to="/me/trusted-contacts" icon={<Users className="w-5 h-5 text-gray-400" />} label="Contactos de confianza" />
      </div>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </Link>
  );
}
