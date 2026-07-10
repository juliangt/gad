import type { NotificationType } from '../../types/enums';

export type NotificationTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface NotificationMeta {
  /** Nombre del icono lucide-react a usar (resuelto por el componente). */
  icon: string;
  /** Etiqueta corta es-AR del tipo. */
  label: string;
  /** Tono de color para el icono/badge. */
  tone: NotificationTone;
}

const ALL_TYPES: NotificationType[] = [
  'new_application',
  'match',
  'new_message',
  'safety',
  'review',
  'plan_alert',
];

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  new_application: {
    icon: 'UserPlus',
    label: 'Nueva postulación',
    tone: 'info',
  },
  match: {
    icon: 'Handshake',
    label: '¡Match!',
    tone: 'success',
  },
  new_message: {
    icon: 'MessageCircle',
    label: 'Nuevo mensaje',
    tone: 'brand',
  },
  safety: {
    icon: 'ShieldAlert',
    label: 'Seguridad',
    tone: 'danger',
  },
  review: {
    icon: 'Star',
    label: 'Reseña',
    tone: 'warning',
  },
  plan_alert: {
    icon: 'CalendarClock',
    label: 'Alerta de plan',
    tone: 'info',
  },
};

const FALLBACK_META: NotificationMeta = {
  icon: 'Bell',
  label: 'Notificación',
  tone: 'brand',
};

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (ALL_TYPES as string[]).includes(value);
}

export function getNotificationMeta(type: NotificationType | string): NotificationMeta {
  if (isNotificationType(type)) {
    return NOTIFICATION_META[type];
  }
  return FALLBACK_META;
}
