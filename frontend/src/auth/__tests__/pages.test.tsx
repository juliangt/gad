import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { AuthContextValue } from '../AuthProvider';
import { renderWithProviders } from '../../test/test-utils';
import { ApiError } from '../../api/errors';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';

// Mock top-level del api client: intercepta las llamadas que hacen los hooks
// (usePasswordResetRequest/Confirm). Login/Register usan authValue mock y no
// tocan el api client, así que no hay conflicto.
const apiPostMock = vi.fn();
vi.mock('../../api/client', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
  setApplyAuth: vi.fn(),
}));

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    status: 'unauthenticated',
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza email, password y botón', () => {
    renderWithProviders(<LoginPage />, { authValue: makeAuthValue() });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('muestra error de validación con email inválido', async () => {
    renderWithProviders(<LoginPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'no-email' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/ingresá un email válido/i)).toBeInTheDocument();
    });
  });

  it('llama login con email y password válidos', async () => {
    const authValue = makeAuthValue();
    renderWithProviders(<LoginPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(authValue.login).toHaveBeenCalledWith('a@b.com', 'secreto123');
    });
  });

  it('muestra error de credenciales cuando login lanza invalid_credentials', async () => {
    const apiError = new ApiError('invalid_credentials', 401, 'bad');
    const authValue = makeAuthValue({
      login: vi.fn().mockRejectedValue(apiError),
    });
    renderWithProviders(<LoginPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/email o contraseña incorrectos/i)).toBeInTheDocument();
    });
  });
});

describe('RegisterPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra error si la contraseña es muy corta', async () => {
    renderWithProviders(<RegisterPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument();
    });
  });

  it('llama register con los valores válidos', async () => {
    const authValue = makeAuthValue();
    renderWithProviders(<RegisterPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(authValue.register).toHaveBeenCalledWith('a@b.com', 'secreto123', 'Ana');
    });
  });

  it('muestra error de email_already_exists', async () => {
    const apiError = new ApiError('email_already_exists', 409, 'dup');
    const authValue = makeAuthValue({
      register: vi.fn().mockRejectedValue(apiError),
    });
    renderWithProviders(<RegisterPage />, { authValue });
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto123' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/ya existe una cuenta con ese email/i)).toBeInTheDocument();
    });
  });
});

describe('ForgotPasswordPage', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('muestra mensaje de éxito genérico tras enviar', async () => {
    apiPostMock.mockResolvedValue({ message: 'ok' });
    renderWithProviders(<ForgotPasswordPage />, { authValue: makeAuthValue() });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/si el email existe, recibirás un enlace/i),
      ).toBeInTheDocument();
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/request',
      { email: 'a@b.com' },
      { publicEndpoint: true },
    );
  });
});

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin ?token= muestra estado de enlace inválido', () => {
    renderWithProviders(<ResetPasswordPage />, {
      authValue: makeAuthValue(),
      initialEntries: ['/reset-password'],
    });
    expect(screen.getByText(/este enlace no contiene un token válido/i)).toBeInTheDocument();
  });

  it('con ?token= muestra el formulario de nueva contraseña', () => {
    renderWithProviders(<ResetPasswordPage />, {
      authValue: makeAuthValue(),
      initialEntries: ['/reset-password?token=abc'],
    });
    expect(screen.getByLabelText(/nueva contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repetí la contraseña/i)).toBeInTheDocument();
  });
});
