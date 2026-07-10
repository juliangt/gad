import { formatRelativeTime } from '../../../lib/format';
import {
  Bell,
  CalendarClock,
  Handshake,
  MessageCircle,
  Star,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { NotificationOut } from '../types';
import { getNotificationMeta, type NotificationTone } from '../notificationMeta';

const ICONS: Record<string, LucideIcon> = {
  Bell,
  CalendarClock,
  Handshake,
  MessageCircle,
  Star,
  ShieldAlert,
  UserPlus,
};

// `info` no existe en `Badge.variant`, pero aquí lo usamos solo como clase
// tailwind para el fondo del icono (no pasamos tone a Badge).
const TONE_CLASS: Record<NotificationTone, string> = {
  brand: 'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
};

export interface NotificationItemProps {
  notification: NotificationOut;
  onMarkRead?: (id: string) => void;
}

/** Extrae un resumen legible del payload según el type. */
function describePayload(
  type: NotificationOut['type'],
  payload: Record<string, unknown> | null,
): string {
  if (!payload) return '';
  const get = (k: string): string | undefined =>
    payload[k] != null ? String(payload[k]) : undefined;

  switch (type) {
    case 'new_application': {
      const name = get('applicant_name') ?? get('user_name') ?? 'alguien';
      const title = get('plan_title') ?? 'tu plan';
      return `${name} se postuló a "${title}".`;
    }
    case 'match': {
      const peer = get('peer_name') ?? 'tu par';
      const title = get('plan_title');
      return title ? `Hicieron match en "${title}" con ${peer}.` : `¡Tienes un match con ${peer}!`;
    }
    case 'new_message': {
      const from = get('sender_name') ?? 'alguien';
      const preview = get('preview') ?? get('message') ?? '';
      return preview ? `${from}: ${preview}` : `Tienes un nuevo mensaje de ${from}.`;
    }
    case 'safety': {
      return get('message') ?? 'Se disparó una alerta de seguridad en uno de tus matches.';
    }
    case 'review': {
      const rating = get('rating');
      return rating ? `Recibiste una reseña de ${rating} estrellas.` : 'Recibiste una nueva reseña.';
    }
    case 'plan_alert': {
      const title = get('plan_title') ?? 'un plan';
      return get('message') ?? `Novedades en "${title}".`;
    }
    default:
      return get('message') ?? '';
  }
}

/** URL de destino al clic (deep link según type). */
function targetUrl(type: NotificationOut['type'], payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const get = (k: string): string | undefined =>
    payload[k] != null ? String(payload[k]) : undefined;
  if (type === 'new_application' || type === 'plan_alert') {
    const planId = get('plan_id');
    return planId ? `/plans/${planId}/applications` : null;
  }
  if (type === 'match' || type === 'new_message' || type === 'safety') {
    const matchId = get('match_id');
    return matchId ? `/matches/${matchId}` : null;
  }
  return null;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const meta = getNotificationMeta(notification.type);
  const Icon = ICONS[meta.icon] ?? Bell;
  const description = describePayload(notification.type, notification.payload);
  const href = targetUrl(notification.type, notification.payload);
  const unread = notification.read_at === null;

  const content = (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-xl transition-colors',
        unread ? 'bg-brand-50/60' : 'bg-white/40',
        href && 'hover:bg-white/80 cursor-pointer',
      )}
    >
      <div className={cn('flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center', TONE_CLASS[meta.tone])}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
          {unread && (
            <span
              className="w-2 h-2 rounded-full bg-brand-600"
              aria-label="No leída"
            />
          )}
        </div>
        {description && <p className="text-sm text-gray-700 mt-0.5 break-words">{description}</p>}
        <p className="text-xs text-gray-500 mt-1" title={notification.created_at}>
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
      {unread && onMarkRead && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
          className="flex-shrink-0 text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline self-center"
          aria-label={`Marcar como leída: ${meta.label}`}
        >
          Marcar leída
        </button>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl">
        {content}
      </a>
    );
  }
  return content;
}
