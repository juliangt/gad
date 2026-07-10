/**
 * Tipos del dominio Safety (contrato §Seguridad).
 *
 * Endpoints cubiertos:
 *  - GET/POST/DELETE /me/trusted-contacts
 *  - POST /safety/{match_id}/ping
 *  - GET  /safety/{match_id}/peer
 *  - POST/DELETE /safety/{match_id}/share-link
 *  - POST /safety/{match_id}/sos
 *  - GET  /s/{token}  (PÚBLICO, sin auth)
 */

import type { ContactType } from '../../types/enums';

// —— Trusted contacts ——

export type { ContactType };

export interface TrustedContactOut {
  id: string;
  contact_type: ContactType;
  contact_value: string;
  label: string;
  created_at: string; // ISO 8601
}

export interface TrustedContactIn {
  contact_type: ContactType;
  /** 3..255 caracteres (email válido o teléfono). */
  contact_value: string;
  /** 1..100 caracteres. */
  label: string;
}

// —— Pings de ubicación ——

export interface PingIn {
  lat: number; // -90..90
  lng: number; // -180..180
}

// —— Ubicación del par ——

export interface PeerLocationOut {
  lat: number | null;
  lng: number | null;
  last_ping_at: string | null; // ISO 8601
}

// —— Share-link ——

export interface ShareLinkOut {
  token: string;
  /** Path relativo de la app: "/s/<token>". */
  url: string;
}

// —— SOS ——

export interface SosOut {
  event_id: string;
  message: string;
}

// —— Vista pública /s/:token ——

export interface PublicLocationOut {
  match_id: string;
  user_display_name: string;
  lat: number | null;
  lng: number | null;
  last_ping_at: string | null; // ISO 8601
  /** true si el link/match expiró (aún devuelve data histórica). */
  expired: boolean;
}
