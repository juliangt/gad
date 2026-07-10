// frontend/src/features/matching/__tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { applicationInSchema } from '../schemas';

describe('applicationInSchema', () => {
  it('acepta un body vacío (message opcional)', () => {
    expect(applicationInSchema.parse({})).toEqual({});
  });

  it('acepta message null', () => {
    expect(applicationInSchema.parse({ message: null })).toEqual({ message: null });
  });

  it('acepta message con texto válido', () => {
    expect(applicationInSchema.parse({ message: 'Hola, me gustaría sumarme' })).toEqual({
      message: 'Hola, me gustaría sumarme',
    });
  });

  it('acepta message de exactamente 500 caracteres', () => {
    const msg = 'a'.repeat(500);
    expect(applicationInSchema.parse({ message: msg })).toEqual({ message: msg });
  });

  it('rechaza message de 501 caracteres', () => {
    expect(() => applicationInSchema.parse({ message: 'a'.repeat(501) })).toThrow();
  });

  it('rechaza message vacío (string "") — el backend espera null o texto', () => {
    // String vacío no es válido: o se omite o se envía null.
    expect(() => applicationInSchema.parse({ message: '' })).toThrow();
  });

  it('rechaza message que no es string ni null', () => {
    expect(() => applicationInSchema.parse({ message: 123 })).toThrow();
    expect(() => applicationInSchema.parse({ message: [] })).toThrow();
  });

  it('normaliza whitespace solo → null (no enviamos mensaje vacío)', () => {
    expect(applicationInSchema.parse({ message: '   ' })).toEqual({ message: null });
  });

  it('recorta mensaje con espacios alrededor', () => {
    expect(applicationInSchema.parse({ message: '  hola  ' })).toEqual({ message: 'hola' });
  });
});
