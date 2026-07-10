import type {
  ActivityType,
  Gender,
  GenderPreference,
  GroupSizePreference,
  VerificationLevel,
} from '../../types/enums';

/** GET /me → perfil completo del usuario autenticado. */
export interface UserPreferences {
  default_search_radius_m: number;
  activity_types: ActivityType[];
  group_size_preference: GroupSizePreference;
  age_range_min: number;
  age_range_max: number;
  gender_preference: GenderPreference;
  notify_new_plans: boolean;
  notify_messages: boolean;
  notify_pending_alerts: boolean;
}

export interface UserDetail {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birth_date: string | null; // yyyy-mm-dd
  gender: Gender;
  reputation_score: number;
  verification_level: VerificationLevel;
  preferences: UserPreferences;
}

/** Alias legible (UserDetail.preferences usa esta forma). */
export type PreferencesOut = UserPreferences;

/** PUT /me/preferences body. Todos los campos opcionales según contrato. */
export interface PreferencesIn {
  default_search_radius_m?: number;
  activity_types?: ActivityType[];
  group_size_preference?: GroupSizePreference;
  age_range_min?: number;
  age_range_max?: number;
  gender_preference?: GenderPreference;
  notify_new_plans?: boolean;
  notify_messages?: boolean;
  notify_pending_alerts?: boolean;
}

/** PATCH /me body. Todos opcionales. */
export interface UserUpdateIn {
  display_name?: string;
  bio?: string | null;
  birth_date?: string | null;
  gender?: Gender | null;
  locale?: string | null;
  timezone?: string | null;
}

/** GET /users/{id} → perfil público. */
export interface UserPublicProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  reputation_score: number;
  verification_level: VerificationLevel;
}

/** POST /users/{id}/block y GET /me/blocks item. */
export interface BlockOut {
  blocked_id: string;
  created_at: string; // ISO 8601
}
