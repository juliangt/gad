import { describe, it, expect } from 'vitest';
import { ApiError, mapErrorMessage } from '../errors';

describe('ApiError', () => {
  it('construye con code, status y detail', () => {
    const err = new ApiError('invalid_credentials', 401, 'Credenciales incorrectas');
    expect(err.code).toBe('invalid_credentials');
    expect(err.status).toBe(401);
    expect(err.detail).toBe('Credenciales incorrectas');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('acepta code null', () => {
    const err = new ApiError(null, 500, 'Algo falló');
    expect(err.code).toBeNull();
    expect(err.status).toBe(500);
  });

  it('expone message = detail', () => {
    const err = new ApiError('not_found', 404, 'No existe');
    expect(err.message).toBe('No existe');
  });
});

describe('mapErrorMessage', () => {
  it('mapea códigos conocidos a mensajes es-AR', () => {
    expect(mapErrorMessage('auth_error')).toBe('Tenés que iniciar sesión para continuar.');
    expect(mapErrorMessage('invalid_credentials')).toBe('Email o contraseña incorrectos.');
    expect(mapErrorMessage('invalid_token')).toBe('Tu sesión expiró. Iniciá sesión de nuevo.');
    expect(mapErrorMessage('forbidden')).toBe('No tenés permiso para hacer esto.');
    expect(mapErrorMessage('not_found')).toBe('No encontramos lo que buscabas.');
    expect(mapErrorMessage('conflict')).toBe('Hubo un conflicto con esta operación.');
    expect(mapErrorMessage('email_already_exists')).toBe('Ya existe una cuenta con ese email.');
    expect(mapErrorMessage('validation_error')).toBe('Algunos datos no son válidos.');
    expect(mapErrorMessage('oauth_error')).toBe('No pudimos autenticarte con Google.');
    expect(mapErrorMessage('rate_limit_exceeded')).toBe('Demasiados intentos. Esperá un momento.');
    expect(mapErrorMessage('error')).toBe('Ocurrió un error inesperado.');
  });

  it('devuelve mensaje genérico para code null', () => {
    expect(mapErrorMessage(null)).toBe('Ocurrió un error inesperado.');
  });

  it('devuelve mensaje genérico para código desconocido', () => {
    expect(mapErrorMessage('codigo_raro')).toBe('Ocurrió un error inesperado.');
  });

  it('respeta el detail del backend si se pasa como fallback', () => {
    expect(mapErrorMessage('unknown_code', 'Mensaje del backend')).toBe('Mensaje del backend');
  });
});
