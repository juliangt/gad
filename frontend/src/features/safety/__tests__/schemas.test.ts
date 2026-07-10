import { describe, it, expect } from 'vitest';
import { trustedContactSchema, pingSchema } from '../schemas';

describe('trustedContactSchema', () => {
  it('acepta email válido', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza email mal formado', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'no-es-email',
      label: 'Amigo',
    });
    expect(r.success).toBe(false);
  });

  it('acepta teléfono con + y espacios', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'phone',
      contact_value: '+54 11 1234-5678',
      label: 'Mamá',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza teléfono con muy pocos dígitos', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'phone',
      contact_value: '12',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contact_value < 3 chars', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'ab',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza label vacío', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'email',
      contact_value: 'a@b.com',
      label: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contact_type fuera del enum', () => {
    const r = trustedContactSchema.safeParse({
      contact_type: 'fax' as never,
      contact_value: 'a@b.com',
      label: 'X',
    });
    expect(r.success).toBe(false);
  });
});

describe('pingSchema', () => {
  it('acepta coords válidas', () => {
    expect(pingSchema.safeParse({ lat: -34.6, lng: -58.4 }).success).toBe(true);
  });
  it('rechaza lat > 90', () => {
    expect(pingSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });
  it('rechaza lng < -180', () => {
    expect(pingSchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });
});
