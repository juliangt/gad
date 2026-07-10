// frontend/src/features/matching/components/MatchParticipantList.tsx
import { Crown, User } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { formatRelativeTime } from '../../../lib/format';
import type { MatchParticipant } from '../types';

interface Props {
  participants: MatchParticipant[];
  /** Resalta al usuario actual (si se pasa su id). */
  currentUserId?: string;
}

/** Lista de participantes de un match con avatar, rol (host/participante) y joined_at. */
export function MatchParticipantList({ participants, currentUserId }: Props) {
  // Orden: host primero.
  const sorted = [...participants].sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === 'host' ? -1 : 1;
  });

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((p) => {
        const isHost = p.role === 'host';
        const isMe = currentUserId === p.user_id;
        return (
          <li
            key={p.user_id}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50"
          >
            <Avatar name={p.display_name} src={p.avatar_url ?? undefined} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {p.display_name}
                  {isMe && <span className="text-xs text-gray-500 ml-1">(vos)</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                {isHost ? (
                  <span className="flex items-center gap-1 text-brand-600 font-medium">
                    <Crown className="w-3 h-3" /> Organizador
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> Participante
                  </span>
                )}
                <span>·</span>
                <span>Se sumó {formatRelativeTime(p.joined_at)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
