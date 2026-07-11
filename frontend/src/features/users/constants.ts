import type {
  ActivityType,
  Gender,
  GenderPreference,
  GroupSizePreference,
  VerificationLevel,
} from '../../types/enums';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  coffee: 'Café',
  drinks: 'Cerveza',
  food: 'Comida',
  walk: 'Caminata',
  park: 'Parque',
  event: 'Evento',
  other: 'Otro',
};

export const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = (
  Object.keys(ACTIVITY_LABELS) as ActivityType[]
).map((value) => ({ value, label: ACTIVITY_LABELS[value] }));

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'nonbinary', label: 'No binario' },
  { value: 'undisclosed', label: 'Prefiero no decirlo' },
];

export const GROUP_SIZE_OPTIONS: { value: GroupSizePreference; label: string }[] = [
  { value: 'one_on_one', label: 'Uno a uno' },
  { value: 'small_group', label: 'Grupo chico' },
  { value: 'either', label: 'Indistinto' },
];

export const GENDER_PREFERENCE_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: 'same', label: 'Hombre' },
  { value: 'mixed', label: 'Mujer' },
  { value: 'specific', label: 'No binario' },
  { value: 'any', label: 'Indistinto' },
];

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  none: 'Sin verificar',
  email: 'Email verificado',
  google: 'Google verificado',
};

export const RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 25000, label: '25 km' },
  { value: 50000, label: '50 km' },
];
