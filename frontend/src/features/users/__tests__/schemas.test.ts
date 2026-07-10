import { describe, it, expect } from 'vitest';
import {
  userUpdateSchema,
  preferencesSchema,
  ACTIVITY_VALUES,
  GENDER_VALUES,
} from '../schemas';

describe('userUpdateSchema', () => {
  it('acepta un payload válido mínimo', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'Martín' });
    expect(r.success).toBe(true);
  });

  it('rechaza display_name vacío (min 1)', () => {
    const r = userUpdateSchema.safeParse({ display_name: '' });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name > 100', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('rechaza bio > 500', () => {
    const r = userUpdateSchema.safeParse({ bio: 'y'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('acepta bio de 500', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'Martín', bio: 'y'.repeat(500) });
    expect(r.success).toBe(true);
  });

  it('acepta gender null', () => {
    const r = userUpdateSchema.safeParse({ display_name: 'Martín', gender: null });
    expect(r.success).toBe(true);
  });

  it('rechaza gender inválido', () => {
    const r = userUpdateSchema.safeParse({ gender: 'helicopter' });
    expect(r.success).toBe(false);
  });
});

describe('preferencesSchema', () => {
  const valid = {
    default_search_radius_m: 2000,
    activity_types: ['coffee', 'walk'],
    group_size_preference: 'either',
    age_range_min: 18,
    age_range_max: 99,
    gender_preference: 'any',
    notify_new_plans: true,
    notify_messages: true,
    notify_pending_alerts: true,
  };

  it('acepta un payload válido', () => {
    expect(preferencesSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza radio < 100', () => {
    expect(preferencesSchema.safeParse({ ...valid, default_search_radius_m: 50 }).success).toBe(false);
  });

  it('rechaza radio > 50000', () => {
    expect(preferencesSchema.safeParse({ ...valid, default_search_radius_m: 60000 }).success).toBe(false);
  });

  it('rechaza edad min < 18', () => {
    expect(preferencesSchema.safeParse({ ...valid, age_range_min: 17 }).success).toBe(false);
  });

  it('rechaza edad max > 99', () => {
    expect(preferencesSchema.safeParse({ ...valid, age_range_max: 100 }).success).toBe(false);
  });

  it('rechaza age_min > age_max', () => {
    const r = preferencesSchema.safeParse({ ...valid, age_range_min: 40, age_range_max: 30 });
    expect(r.success).toBe(false);
  });

  it('acepta activity_type válido del enum', () => {
    expect(
      preferencesSchema.safeParse({ ...valid, activity_types: [...ACTIVITY_VALUES] }).success,
    ).toBe(true);
  });

  it('rechaza activity_type fuera del enum', () => {
    expect(preferencesSchema.safeParse({ ...valid, activity_types: ['skydiving'] }).success).toBe(false);
  });

  it('expone los 4 valores de gender', () => {
    expect(GENDER_VALUES).toEqual(['male', 'female', 'nonbinary', 'undisclosed']);
  });
});
