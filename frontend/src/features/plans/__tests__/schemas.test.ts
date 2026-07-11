// frontend/src/features/plans/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { planInSchema, planUpdateInSchema } from '../schemas';

describe('planInSchema', () => {
  const validBase = {
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 1,
    title: 'Café de especialidad',
    title_suffix: '',
    description: 'Charlar un rato',
    location: { lat: -34.588, lng: -58.431, label: 'Palermo' },
    search_radius_m: 2000,
  } as const;

  it('acepta un plan now válido', () => {
    expect(planInSchema.parse(validBase)).toEqual(validBase);
  });

  it('acepta un plan scheduled con ISO válido', () => {
    const ok = { ...validBase, mode: 'scheduled', scheduled_at: '2026-07-10T18:30:00Z' };
    expect(planInSchema.parse(ok)).toEqual(ok);
  });

  it('rechaza plan scheduled sin scheduled_at (422 backend)', () => {
    const bad = { ...validBase, mode: 'scheduled', scheduled_at: null };
    expect(() => planInSchema.parse(bad)).toThrow();
  });

  it('rechaza title vacío', () => {
    expect(() => planInSchema.parse({ ...validBase, title: '' })).toThrow();
  });

  it('rechaza title > 200', () => {
    expect(() => planInSchema.parse({ ...validBase, title: 'x'.repeat(201) })).toThrow();
  });

  it('rechaza description > 2000', () => {
    expect(() => planInSchema.parse({ ...validBase, description: 'x'.repeat(2001) })).toThrow();
  });

  it('rechaza activity_type inválido', () => {
    expect(() => planInSchema.parse({ ...validBase, activity_type: 'party' })).toThrow();
  });

  it('rechaza mode inválido', () => {
    expect(() => planInSchema.parse({ ...validBase, mode: 'later' })).toThrow();
  });

  it('window_minutes fuera de rango 15..1440 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, window_minutes: 10 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, window_minutes: 1500 })).toThrow();
  });

  it('max_participants fuera de 1..10 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, max_participants: 0 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, max_participants: 11 })).toThrow();
  });

  it('search_radius_m fuera de 100..50000 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, search_radius_m: 50 })).toThrow();
    expect(() => planInSchema.parse({ ...validBase, search_radius_m: 60000 })).toThrow();
  });

  it('lat fuera de -90..90 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 91, lng: 0, label: 'x' } })).toThrow();
  });

  it('lng fuera de -180..180 → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 0, lng: 181, label: 'x' } })).toThrow();
  });

  it('location.label vacío → error', () => {
    expect(() => planInSchema.parse({ ...validBase, location: { lat: 0, lng: 0, label: '' } })).toThrow();
  });

  it('scheduled_at inválido (no ISO) → error', () => {
    expect(() => planInSchema.parse({ ...validBase, mode: 'scheduled', scheduled_at: 'mañana' })).toThrow();
  });
});

describe('planUpdateInSchema', () => {
  it('acepta objeto vacío (todo opcional)', () => {
    expect(planUpdateInSchema.parse({})).toEqual({});
  });

  it('acepta title + description', () => {
    expect(planUpdateInSchema.parse({ title: 'Nuevo', description: 'desc' })).toEqual({ title: 'Nuevo', description: 'desc' });
  });

  it('acepta description null', () => {
    expect(planUpdateInSchema.parse({ description: null })).toEqual({ description: null });
  });

  it('rechaza title > 200', () => {
    expect(() => planUpdateInSchema.parse({ title: 'x'.repeat(201) })).toThrow();
  });

  it('rechaza title vacío si viene', () => {
    expect(() => planUpdateInSchema.parse({ title: '' })).toThrow();
  });

  it('rechaza description > 2000', () => {
    expect(() => planUpdateInSchema.parse({ description: 'x'.repeat(2001) })).toThrow();
  });

  it('rechaza scheduled_at inválido', () => {
    expect(() => planUpdateInSchema.parse({ scheduled_at: 'no-iso' })).toThrow();
  });
});

describe('planInSchema — title_suffix', () => {
  const validBase = {
    activity_type: 'coffee',
    mode: 'now',
    scheduled_at: null,
    window_minutes: 120,
    max_participants: 1,
    title: 'Café',
    description: null,
    location: { lat: -34.59, lng: -58.43, label: 'Palermo' },
    search_radius_m: 1000,
  };

  it('acepta title_suffix vacío con default ""', () => {
    const parsed = planInSchema.parse({ ...validBase });
    expect(parsed.title_suffix).toBe('');
  });

  it('acepta title_suffix de hasta 32 caracteres', () => {
    const parsed = planInSchema.parse({ ...validBase, title_suffix: 'a'.repeat(32) });
    expect(parsed.title_suffix).toHaveLength(32);
  });

  it('rechaza title_suffix de más de 32 caracteres', () => {
    const result = planInSchema.safeParse({ ...validBase, title_suffix: 'a'.repeat(33) });
    expect(result.success).toBe(false);
  });
});
