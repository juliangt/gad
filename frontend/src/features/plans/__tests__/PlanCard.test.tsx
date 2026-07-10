// frontend/src/features/plans/__tests__/PlanCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanCard } from '../components/PlanCard';
import type { PlanListItem } from '../types';

vi.mock('../../../lib/geo', () => ({ haversine: () => 350 }));
vi.mock('../../../lib/format', () => ({ formatDistance: (m: number) => `${m}m` }));

const plan: PlanListItem = {
  id: 'p1',
  activity_type: 'coffee',
  mode: 'now',
  scheduled_at: null,
  window_minutes: 120,
  max_participants: 2,
  current_participants: 1,
  title: 'Café de especialidad',
  description: 'desc',
  location_label: 'Palermo',
  location_lat: -34.588,
  location_lng: -58.431,
  search_radius_m: 2000,
  status: 'open',
  expires_at: '2026-07-10T18:00:00Z',
  host: { id: 'u1', display_name: 'Sofía', avatar_url: null, reputation_score: 4.9, verification_level: 'email' },
  created_at: '2026-07-09T17:00:00Z',
};

describe('PlanCard', () => {
  it('renderiza título y participantes current/max', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText('Café de especialidad')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('muestra distancia calculada desde haversine', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText(/A 350m de ti/i)).toBeInTheDocument();
  });

  it('muestra "Ahora" si mode=now', () => {
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} />);
    expect(screen.getByText('Ahora')).toBeInTheDocument();
  });

  it('muestra hora formateada si mode=scheduled', () => {
    render(<PlanCard plan={{ ...plan, mode: 'scheduled', scheduled_at: '2026-07-09T18:30:00Z' }} userLocation={[-34.59, -58.43]} />);
    // Badge "Agendar" o la hora; aquí validamos que NO dice "Ahora"
    expect(screen.queryByText('Ahora')).not.toBeInTheDocument();
  });

  it('dispara onClick al clickear', () => {
    const onClick = vi.fn();
    render(<PlanCard plan={plan} userLocation={[-34.59, -58.43]} onClick={onClick} />);
    screen.getByText('Café de especialidad').closest('div')!.click();
    expect(onClick).toHaveBeenCalledWith('p1');
  });

  it('sin userLocation muestra distancia como "—" (no rompe)', () => {
    render(<PlanCard plan={plan} userLocation={null} />);
    expect(screen.getByText(/A — de ti/i)).toBeInTheDocument();
  });
});
