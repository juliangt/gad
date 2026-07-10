import { describe, it, expect } from 'vitest';
import { reviewSchema } from '../schemas';

describe('reviewSchema', () => {
  const valid = {
    match_id: 'm1',
    reviewee_id: 'u2',
    rating: 5,
    comment: 'Genial',
  };

  it('acepta reseña válida sin flag', () => {
    expect(reviewSchema.safeParse(valid).success).toBe(true);
  });

  it('acepta reseña con flag', () => {
    expect(reviewSchema.safeParse({ ...valid, flag: 'no_show' }).success).toBe(true);
  });

  it('rechaza rating < 1', () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it('rechaza rating > 5', () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
  });

  it('rechaza comment > 1000', () => {
    expect(reviewSchema.safeParse({ ...valid, comment: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rechaza flag fuera del enum', () => {
    expect(reviewSchema.safeParse({ ...valid, flag: 'spam' }).success).toBe(false);
  });

  it('acepta comment vacío (opcional)', () => {
    expect(reviewSchema.safeParse({ ...valid, comment: '' }).success).toBe(true);
  });

  it('requiere match_id', () => {
    expect(reviewSchema.safeParse({ ...valid, match_id: '' }).success).toBe(false);
  });
});
