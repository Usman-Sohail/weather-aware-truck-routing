import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PlannedRoute } from '../../types/api';
import { testRoute } from '../results/testRoutes';
import type { Results } from '../results/useResults';
import { MapPanel } from './MapPanel';
import type { TripMapProps } from './TripMap';

vi.mock('./TripMap', () => ({
  TripMap: ({ routes, planKey, selectedRouteId, onSelectRoute }: TripMapProps) => (
    <figure aria-label={planKey ? `Map of ${planKey}` : 'Map without a plan'}>
      {routes.map((route) => (
        <button
          key={route.id}
          type="button"
          aria-pressed={route.id === selectedRouteId}
          onClick={() => onSelectRoute(route.id)}
        >
          Route {route.id}
        </button>
      ))}
    </figure>
  ),
}));

const NOTE = 'Routes appear here once a trip is planned.';

function plannedRoute(id: string): PlannedRoute {
  return {
    id,
    provider_index: 0,
    geometry: [
      [-104.99, 39.74],
      [-87.63, 41.88],
    ],
    length_mi: 1000,
    travel_time_s: 54_000,
    arrival_utc: '2026-10-16T05:00:00Z',
    hourly_positions: [],
  };
}

function resultsFor(selectedId: string, select: (routeId: string) => void = vi.fn()): Results {
  return {
    plan: { routes: [plannedRoute('A'), plannedRoute('B')], plan_token: 'plan-1' },
    selected: testRoute(selectedId, 1, 1000, ['low', 'low']),
    select,
  } as unknown as Results;
}

describe('MapPanel', () => {
  it('shows a quiet note on the map until a trip is planned', () => {
    render(<MapPanel results={null} />);

    expect(screen.getByText(NOTE)).toBeVisible();
    expect(screen.getByRole('figure', { name: 'Map without a plan' })).toBeEmptyDOMElement();
  });

  it('draws the planned routes with the selected one marked', () => {
    render(<MapPanel results={resultsFor('B')} />);

    expect(screen.getByRole('figure', { name: 'Map of plan-1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Route A', pressed: false })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Route B', pressed: true })).toBeVisible();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('selects the route picked on the map', async () => {
    const select = vi.fn();
    const user = userEvent.setup();
    render(<MapPanel results={resultsFor('B', select)} />);

    await user.click(screen.getByRole('button', { name: 'Route A' }));

    expect(select).toHaveBeenCalledWith('A');
  });
});
