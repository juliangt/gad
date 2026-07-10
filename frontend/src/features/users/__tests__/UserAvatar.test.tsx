import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from '../components/UserAvatar';

describe('UserAvatar', () => {
  it('muestra la imagen cuando hay url', () => {
    render(<UserAvatar url="https://cdn/a.png" name="Martín" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn/a.png');
    expect(img).toHaveAttribute('alt', 'Martín');
  });

  it('muestra la inicial cuando no hay url', () => {
    render(<UserAvatar url={null} name="Martín" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('usa la inicial mayúscula del nombre', () => {
    render(<UserAvatar url={null} name="julieta" />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('cae a "?" con nombre vacío', () => {
    render(<UserAvatar url={null} name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
