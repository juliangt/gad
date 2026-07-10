/**
 * Tipos del dominio Notifications (contrato §Notificaciones).
 *
 * `GET /notifications` → `PaginatedOut<NotificationOut>` (paginado por cursor `before`).
 * `GET /notifications/unread/count` → `{ count: int }` (badge, polling).
 * `GET /notifications/vapid-public-key` → `{ public_key: string }` (PÚBLICO, vacío si no hay VAPID).
 * `POST /notifications/register` → `{ message }` (201).
 * `DELETE /notifications/subscription?endpoint=` → `{ deleted }`.
 */

/** Reexport del enum canónico (definido en F0 types/enums.ts). */
export type { NotificationType } from '../../types/enums';

import type { NotificationType } from '../../types/enums';

/** Notificación persistida. `payload` es JSONB libre; se renderiza contextualmente por `type`. */
export interface NotificationOut {
  id: string;
  type: NotificationType;
  /** Estructura libre según `type`. Ej: `{ plan_id, plan_title }`, `{ match_id, peer_name }`, `{ message_preview }`. */
  payload: Record<string, unknown> | null;
  read_at: string | null; // ISO 8601 UTC
  created_at: string; // ISO 8601 UTC
}

/** Respuesta de `GET /notifications/unread/count`. */
export interface UnreadCountOut {
  count: number;
}

/** Respuesta de `GET /notifications/vapid-public-key` (público). */
export interface VapidPublicKeyOut {
  public_key: string; // "" si no hay VAPID configurado
}

/** Body de `POST /notifications/register`. */
export interface PushSubscriptionIn {
  endpoint: string;
  /** Claves de cifrado Web Push. El backend espera `p256dh` y `auth`. */
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Respuesta de `POST /notifications/read-all`. */
export interface MarkedOut {
  marked: number;
}

/** Respuesta de `DELETE /notifications` y `DELETE /notifications/subscription`. */
export interface DeletedOut {
  deleted: number;
}
