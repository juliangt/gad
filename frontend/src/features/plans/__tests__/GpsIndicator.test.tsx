// frontend/src/features/plans/__tests__/GpsIndicator.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsIndicator } from '../components/GpsIndicator';

describe('GpsIndicator', () => {
  it('muestra "Buscando señal..." en searching', () => {
    render(<GpsIndicator status="searching" />);
    expect(screen.getByText(/Buscando señal/i)).toBeInTheDocument();
  });

  it('muestra "Ubicación precisa" en fixed', () => {
    render(<GpsIndicator status="fixed" />);
    expect(screen.getByText(/Ubicación precisa/i)).toBeInTheDocument();
  });

  it('muestra "Sin ubicación" en denied', () => {
    render(<GpsIndicator status="denied" />);
    expect(screen.getByText(/Sin ubicación/i)).toBeInTheDocument();
  });
});
