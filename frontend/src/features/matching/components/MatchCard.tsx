// frontend/src/features/matching/components/MatchCard.tsx
import { ChevronRight, MessageCircle, Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { cn } from '../../../lib/utils';
import { formatRelativeTime } from '../../../lib/format';
import { MATCH_STATUS_META } from '../constants';
import type { MatchOut } from '../types';

interface Props {
  match: MatchOut;
  onClick?: (matchId: string) => void;
  /** Muestra un botón de chat rápido (solo si match activo). */
  showChatButton?: boolean;
}

/**
 * Fila de match para la lista (migrado/expandido de MatchesView App.tsx:233-256).
 * Muestra los otros participantes (excluyendo al usuario actual si se pasa currentUserId),
 * el título descriptivo armado con display_names, el estado y la hora de inicio.
 */
export function MatchCard({ match, onClick, showChatButton = false }: Props) {
  const meta = MATCH_STATUS_META[match.status];
  const names = match.participants.map((p) => p.display_name).join(' · ');
  const otherAvatars = match.participants.slice(0, 3);
  const startedLabel = formatRelativeTime(match.started_at);

  return (
    <div
      onClick={() => onClick?.(match.id)}
      className={cn(
        'glass-panel p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform',
        onClick && 'cursor-pointer',
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(match.id);
        }
      }}
    >
      {/* Avatares apilados */}
      <div className="flex -space-x-2">
        {otherAvatars.map((p) => (
          <Avatar
            key={p.user_id}
            name={p.display_name}
            src={p.avatar_url ?? undefined}
            size="lg"
            className="ring-2 ring-white"
          />
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{names}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <Users className="w-3.5 h-3.5" />
          <span>{match.participants.length} participantes</span>
          <span>·</span>
          <span>{startedLabel}</span>
        </div>
      </div>

      <Badge className={meta.badgeClass}>{meta.label}</Badge>

      {showChatButton && match.status === 'active' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(match.id);
          }}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-sm active:scale-95"
          aria-label="Abrir chat"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      ) : (
        onClick && <ChevronRight className="w-5 h-5 text-gray-400" />
      )}
    </div>
  );
}
