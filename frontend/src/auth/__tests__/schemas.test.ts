import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas';

describe('loginSchema', () => {
  it('acepta email + password no vacío', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '1234' });
    expect(r.success).toBe(true);
  });

  it('rechaza email inválido', () => {
    const r = loginSchema.safeParse({ email: 'no-email', password: '1234' });
    expect(r.success).toBe(false);
  });

  it('rechaza password vacío', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('acepta datos válidos', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza password menor a 8', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: '1234567',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza password mayor a 128', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'martin@example.com',
      password: 'a'.repeat(129),
    });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name vacío', () => {
    const r = registerSchema.safeParse({
      display_name: '',
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza display_name mayor a 100', () => {
    const r = registerSchema.safeParse({
      display_name: 'x'.repeat(101),
      email: 'martin@example.com',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza email inválido', () => {
    const r = registerSchema.safeParse({
      display_name: 'Martín',
      email: 'mal',
      password: 'passwordSeguro123',
    });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('acepta email válido', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'a@b.com' });
    expect(r.success).toBe(true);
  });
  it('rechaza email inválido', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'x' });
    expect(r.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('acepta token + new_password válidos + confirmación igual', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: 'nuevaClave123',
      confirm_password: 'nuevaClave123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza si confirm no coincide', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: 'nuevaClave123',
      confirm_password: 'otra',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza new_password < 8', () => {
    const r = resetPasswordSchema.safeParse({
      token: 'abc',
      new_password: '1234567',
      confirm_password: '1234567',
    });
    expect(r.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('acepta old distinto de new con confirmación igual', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'viejaClave123',
      new_password: 'nuevaClave123',
      confirm_password: 'nuevaClave123',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza si new == old', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'mismaClave123',
      new_password: 'mismaClave123',
      confirm_password: 'mismaClave123',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza si confirm no coincide', () => {
    const r = changePasswordSchema.safeParse({
      old_password: 'viejaClave123',
      new_password: 'nuevaClave123',
      confirm_password: 'distinta12345',
    });
    expect(r.success).toBe(false);
  });
});
