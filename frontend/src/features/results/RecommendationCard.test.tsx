import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Recommendation, RiskKey } from '../../types/api';
import type { RouteView } from './model';
import { RecommendationCard } from './RecommendationCard';

function route(overrides: Partial<RouteView['metrics']> = {}): RouteView {
  const miles: Record<RiskKey, number> = {
    low: 900,
    moderate: 200,
    high: 0,
    severe: 0,
    no_travel: 0,
    unknown: 0,
  };
  return {
    id: 'B',
    providerIndex: 1,
    rank: 1,
    lengthMi: 1173.2,
    travelTimeS: 59_760,
    leadHours: { min: 1, max: 17 },
    checkpoints: [],
    metrics: {
      id: 'B',
      rank: 1,
      miles,
      miles_display: {
        ...Object.fromEntries(Object.entries(miles).map(([k, v]) => [k, String(v)])),
      } as Record<RiskKey, string>,
      avg_risk: 0.2,
      has_no_travel: false,
      has_unknown: false,
      incomplete: false,
      travel_minutes: 996,
      ...overrides,
    },
  };
}

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    route_id: 'B',
    status: 'clear',
    decided_by: 'high_miles',
    tied_on: [],
    explanation: 'Route B has fewer High miles than Route A (0 vs 75).',
    ...overrides,
  };
}

describe('RecommendationCard', () => {
  it('names the route to take and why, with the figures behind it', () => {
    render(<RecommendationCard route={route()} recommendation={recommendation()} loadLb={42000} />);

    expect(screen.getByRole('heading', { name: 'Take Route B' })).toBeVisible();
    expect(screen.getByText('Route B has fewer High miles than Route A (0 vs 75).')).toBeVisible();
    const facts = Object.fromEntries(
      screen
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(facts).toEqual({
      Distance: '1,173 mi',
      'Driving time': '16 h 36 min',
      'Severe miles': '0 mi',
      'High miles': '0 mi',
      'Average risk': '0.2 of 4',
    });
  });

  it('says what the result assumes', () => {
    render(<RecommendationCard route={route()} recommendation={recommendation()} loadLb={42000} />);

    expect(screen.getByText(/Assessed for a 42,000 lb load\./)).toBeVisible();
    expect(screen.getByText(/Forecasts from 1 to 17 hours ahead\./)).toBeVisible();
    expect(
      screen.getByText(/Arrival times assume continuous driving, without required rest breaks\./),
    ).toBeVisible();
  });

  it.each([
    [{ min: 0, max: 14 }, 'Forecasts up to 14 hours ahead.'],
    [{ min: 0, max: 1 }, 'Forecasts up to 1 hour ahead.'],
    [{ min: 0, max: 0 }, 'Forecasts for the coming hour.'],
    [{ min: 3, max: 3 }, 'Forecasts 3 hours ahead.'],
  ])('describes forecast lead times of %o as "%s"', (leadHours, text) => {
    render(
      <RecommendationCard
        route={{ ...route(), leadHours }}
        recommendation={recommendation()}
        loadLb={42000}
      />,
    );

    expect(screen.getByText(new RegExp(text.replace('.', '\\.')))).toBeVisible();
  });

  it('never calls the least risky route safe when every route has No Travel', () => {
    render(
      <RecommendationCard
        route={route({ has_no_travel: true })}
        recommendation={recommendation({ status: 'no_safe_route' })}
        loadLb={42000}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No route avoids No Travel conditions' }),
    ).toBeVisible();
    expect(screen.getByText('The least risky option is Route B.')).toBeVisible();
    expect(screen.getByText('No Travel miles')).toBeVisible();
    expect(screen.queryByText(/safe\b/i)).not.toBeInTheDocument();
  });

  it('flags a provisional result', () => {
    render(
      <RecommendationCard
        route={route({ incomplete: true })}
        recommendation={recommendation({ status: 'provisional' })}
        loadLb={42000}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Route B, with some forecast data missing' }),
    ).toBeVisible();
  });

  it('explains when no route can be recommended', () => {
    render(
      <RecommendationCard
        route={null}
        recommendation={recommendation({
          route_id: null,
          status: 'unavailable',
          explanation: 'No forecast data is available for these routes, so none is recommended.',
        })}
        loadLb={42000}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No route can be recommended' })).toBeVisible();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });
});
