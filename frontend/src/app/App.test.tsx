import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TripMapProps } from '../features/map/TripMap';
import { App } from './App';

vi.mock('../features/map/TripMap', () => ({
  TripMap: ({ routes, selectedRouteId, onSelectRoute }: TripMapProps) => (
    <div>
      {routes.map((route) => (
        <button
          key={route.id}
          type="button"
          aria-pressed={route.id === selectedRouteId}
          onClick={() => onSelectRoute(route.id)}
        >
          Route {route.id} on the map
        </button>
      ))}
    </div>
  ),
}));

const DENVER = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};
const CHICAGO = {
  name: 'Chicago, IL, United States',
  lat: 41.88,
  lon: -87.63,
  country_code: 'US',
  time_zone: 'America/Chicago',
};

function checkpoint(routeId: string, seq: number, mile: number, share: number) {
  return {
    id: `${routeId}-${seq}`,
    route_id: routeId,
    seq,
    mile,
    share_mi: share,
    lon: -100,
    lat: 40,
    eta_utc: '2026-10-16T15:00:00Z',
    location_index: 0,
  };
}

const PLAN = {
  departure: {
    local: '2026-10-16T08:00',
    utc: '2026-10-16T14:00:00Z',
    time_zone: 'America/Denver',
    utc_offset: '-06:00',
    abbreviation: 'MDT',
  },
  interval_mi: 25,
  routes: [
    {
      id: 'A',
      provider_index: 0,
      geometry: [],
      length_mi: 50,
      travel_time_s: 3000,
      arrival_utc: '',
      hourly_positions: [],
    },
    {
      id: 'B',
      provider_index: 1,
      geometry: [],
      length_mi: 60,
      travel_time_s: 3600,
      arrival_utc: '',
      hourly_positions: [],
    },
  ],
  checkpoints: [
    checkpoint('A', 0, 0, 25),
    checkpoint('A', 1, 50, 25),
    checkpoint('B', 0, 0, 30),
    checkpoint('B', 1, 60, 30),
  ],
  corridor: {
    step_lat_deg: 0.1,
    step_lon_deg: 0.13,
    approx_cell_mi: 7,
    cells: [],
    first_location_index: 1,
  },
  forecast_window: {
    start_utc: '2026-10-16T15:00:00Z',
    end_utc: '2026-10-18T15:00:00Z',
    hours: 49,
  },
  weather_request: {
    url: 'https://api.open-meteo.com/v1/forecast',
    body: 'latitude=40',
    location_count: 1,
  },
  notices: [],
  plan_token: 'signed-plan',
};

function assessed(id: string, level: string) {
  return {
    id,
    forecast_hour_utc: '2026-10-16T15:00:00Z',
    lead_hours: 3,
    weather: { gust_mph: 10, wind_mph: 5, rain_in_hr: 0, snow_in_hr: 0 },
    levels: { wind: level, rain: 'low', snow: 'low' },
    level,
    complete: true,
    reasons: [],
  };
}

function metrics(id: string, rank: number, high: number) {
  const miles = { low: 60 - high, moderate: 0, high, severe: 0, no_travel: 0, unknown: 0 };
  return {
    id,
    rank,
    miles,
    miles_display: Object.fromEntries(
      Object.entries(miles).map(([key, value]) => [key, String(value)]),
    ),
    avg_risk: high > 0 ? 1 : 0,
    has_no_travel: false,
    has_unknown: false,
    incomplete: false,
    travel_minutes: id === 'A' ? 50 : 60,
  };
}

const ASSESSMENT = {
  load_lb: 42000,
  checkpoints: [
    assessed('A-0', 'high'),
    assessed('A-1', 'high'),
    assessed('B-0', 'low'),
    assessed('B-1', 'low'),
  ],
  routes: [metrics('B', 1, 0), metrics('A', 2, 50)],
  recommendation: {
    route_id: 'B',
    status: 'clear',
    decided_by: 'high_miles',
    tied_on: [],
    explanation: 'Route B has fewer High miles than Route A (0 vs 50).',
  },
  heatmap: { hours: 49, frames: [] },
};

/** Answers each request the way the backend and the forecast service would. */
function mockServices(routes: () => Response = () => Response.json(PLAN)) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => Promise.resolve(Response.json(body));
    if (url === '/api/health') return json({ status: 'ok' });
    if (url.startsWith('/api/geocode')) {
      return json({ candidates: [url.includes('Denver') ? DENVER : CHICAGO] });
    }
    if (url === '/api/routes') return Promise.resolve(routes());
    if (url.startsWith('https://api.open-meteo.com')) return json([{ hourly: {} }]);
    if (url === '/api/assess') {
      const body = JSON.parse(String(init?.body)) as { plan_token: string };
      expect(body.plan_token).toBe('signed-plan');
      return json(ASSESSMENT);
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function planDenverToChicago(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
  await screen.findByDisplayValue(DENVER.name);
  await user.type(screen.getByLabelText('Destination'), 'Chicago{Enter}');
  await screen.findByDisplayValue(CHICAGO.name);
  await user.type(screen.getByLabelText('Cargo weight'), '42000');
  await user.click(screen.getByRole('button', { name: 'Compare routes' }));
}

describe('App', () => {
  it('shows the service as online when the health check succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Weather-Aware Truck Routing' })).toBeVisible();
    expect(await screen.findByText('Service online')).toBeVisible();
  });

  it('shows the service as unavailable when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('Service unavailable')).toBeVisible();
  });

  it('credits the weather and routing data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));

    render(<App />);

    expect(await screen.findByText('Service online')).toBeVisible();
    expect(screen.getByRole('link', { name: /^Open-Meteo\.com/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /^TomTom/ })).toBeVisible();
  });

  it('plans a trip from the form to a recommendation, then lets the driver edit it', async () => {
    const fetchMock = mockServices();
    const user = userEvent.setup();
    render(<App />);

    await planDenverToChicago(user);

    expect(await screen.findByRole('heading', { name: 'Take Route B' })).toBeVisible();
    expect(screen.getByText('Route B has fewer High miles than Route A (0 vs 50).')).toBeVisible();
    expect(screen.getByLabelText('Starting place')).not.toBeVisible();
    expect(screen.getByRole('group', { name: 'Trip summary' })).toHaveFocus();
    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calledUrls).toEqual(
      expect.arrayContaining([
        '/api/routes',
        'https://api.open-meteo.com/v1/forecast',
        '/api/assess',
      ]),
    );

    expect(screen.getByRole('radio', { name: /^Route B:/ })).toBeChecked();
    expect(screen.getByRole('table', { name: 'Checkpoints on Route B' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show mile 60 on the map' }));

    await user.click(screen.getByRole('radio', { name: /^Route A:/ }));

    expect(screen.getByRole('table', { name: 'Checkpoints on Route A' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit trip' }));

    expect(screen.getByLabelText('Starting place')).toBeVisible();
    expect(screen.getByLabelText('Starting place')).toHaveFocus();
    expect(screen.getByLabelText('Cargo weight')).toHaveValue('42000');
  });

  it('keeps the map and the route comparison on the same route', async () => {
    mockServices();
    const user = userEvent.setup();
    render(<App />);
    const map = screen.getByRole('region', { name: 'Route map' });

    expect(within(map).getByText('Routes appear here once a trip is planned.')).toBeVisible();

    await planDenverToChicago(user);

    expect(
      await within(map).findByRole('button', { name: 'Route B on the map', pressed: true }),
    ).toBeVisible();
    expect(within(map).queryByText('Routes appear here once a trip is planned.')).toBeNull();

    await user.click(within(map).getByRole('button', { name: 'Route A on the map' }));

    expect(screen.getByRole('radio', { name: /^Route A:/ })).toBeChecked();
    expect(screen.getByRole('table', { name: 'Checkpoints on Route A' })).toBeVisible();

    await user.click(screen.getByRole('radio', { name: /^Route B:/ }));

    expect(
      within(map).getByRole('button', { name: 'Route B on the map', pressed: true }),
    ).toBeVisible();
  });

  it('brings the form back with the reason when planning fails', async () => {
    mockServices(() =>
      Response.json(
        { error: { code: 'NO_ROUTE', message: 'No truck route was found between these places.' } },
        { status: 422 },
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await planDenverToChicago(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No truck route was found between these places.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Starting place')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Trip summary' })).not.toBeInTheDocument();
  });
});
