/** String-backed enums del backend (contrato §5). Enviar/recibir los valores literales. */

export type ActivityType =
  | 'coffee'
  | 'drinks'
  | 'food'
  | 'walk'
  | 'park'
  | 'event'
  | 'other';

export type PlanMode = 'now' | 'scheduled';

export type PlanStatus =
  | 'open'
  | 'matched'
  | 'closed'
  | 'cancelled'
  | 'expired';

export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export type MatchStatus = 'active' | 'completed' | 'cancelled';

export type MatchRole = 'host' | 'participant';

export type Gender =
  | 'male'
  | 'female'
  | 'nonbinary'
  | 'undisclosed';

export type VerificationLevel = 'none' | 'email' | 'google';

export type GroupSizePreference =
  | 'one_on_one'
  | 'small_group'
  | 'either';

export type GenderPreference = 'any' | 'same' | 'mixed' | 'specific';

export type ContactType = 'email' | 'phone';

export type NotificationType =
  | 'new_application'
  | 'match'
  | 'new_message'
  | 'safety'
  | 'review'
  | 'plan_alert';

export type ReviewFlag = 'no_show' | 'inappropriate' | 'false_info';

export type UserStatus = 'active' | 'suspended' | 'deleted';
