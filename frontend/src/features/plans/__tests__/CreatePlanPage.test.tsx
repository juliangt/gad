import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreatePlanPage from '../pages/CreatePlanPage';

// Mock de MapPicker para evitar montar Leaflet real
vi.mock('../components/MapPicker', () => ({
  MapPicker: ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => (
    <div data-testid="map-picker" onClick={() => onMapClick(-34.6, -58.4)} />
  ),
}));

// Mock de useUserLocation
vi.mock('../useUserLocation', () => ({
  useUserLocation: () => ({
    location: [-34.59, -58.43] as [number, number],
    status: 'granted',
    request: vi.fn(),
    setManualLocation: vi.fn(),
    reset: vi.fn(),
    error: null,
  }),
}));

// Mock de useCreatePlan
vi.mock('../hooks', () => ({
  useCreatePlan: () => ({
    mutate: vi.fn((payload, opts) => opts?.onSuccess?.({ id: 'plan-1' })),
    isPending: false,
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreatePlanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreatePlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza el input de Referencia con placeholder correcto', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Palermo, plaza del barrio')).toBeInTheDocument();
  });

  it('no renderiza el input de location.label (Barrio o referencia)', () => {
    renderPage();
    expect(screen.queryByPlaceholderText(/Barrio o referencia/)).not.toBeInTheDocument();
  });

  it('al abrir Opciones Avanzadas muestra el Textarea "Más detalles" con placeholder "Opcional"', () => {
    renderPage();
    fireEvent.click(screen.getByText(/OPCIONES AVANZADAS/i));
    expect(screen.getByText('Más detalles')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Opcional')).toBeInTheDocument();
  });

  it('el hint "Tocá el mapa" se muestra inicialmente', () => {
    renderPage();
    expect(screen.getByText(/Tocá el mapa para ubicar tu plan/)).toBeInTheDocument();
  });
});
