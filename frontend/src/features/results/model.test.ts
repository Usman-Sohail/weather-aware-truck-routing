import { describe, expect, it } from 'vitest';

import type {
  AssessResponse,
  CheckpointAssessment,
  PlannedCheckpoint,
  RouteAssessment,
  RoutesResponse,
  RiskKey,
} from '../../types/api';
import { buildRouteViews, mileTicks, notableMiles, riskRuns } from './model';

function planned(routeId: string, seq: number, mile: number, share: number): PlannedCheckpoint {
  return {
    id: `${routeId}-${seq}`,
    route_id: routeId,
    seq,
    mile,
    share_mi: share,
    lon: -100 + seq,
    lat: 40,
    eta_utc: `2026-10-16T${String(14 + seq).padStart(2, '0')}:00:00Z`,
    location_index: seq,
  };
}

function assessed(id: string, level: RiskKey, lead = 5): CheckpointAssessment {
  return {
    id,
    forecast_hour_utc: '2026-10-16T15:00:00Z',
    lead_hours: lead,
    weather: { gust_mph: 10, wind_mph: 5, rain_in_hr: 0, snow_in_hr: 0 },
    levels: { wind: level, rain: 'low', snow: 'low' },
    level,
    complete: level !== 'unknown',
    reasons: [],
  };
}

const PLAN = {
  routes: [
    { id: 'A', provider_index: 0, length_mi: 100, travel_time_s: 6000 },
    { id: 'B', provider_index: 1, length_mi: 120, travel_time_s: 7200 },
  ],
  checkpoints: [
    planned('A', 0, 0, 12.5),
    planned('A', 1, 25, 25),
    planned('A', 2, 50, 25),
    planned('A', 3, 75, 25),
    planned('A', 4, 100, 12.5),
    planned('B', 0, 0, 25),
    planned('B', 1, 50, 50),
    planned('B', 2, 100, 35),
    planned('B', 3, 120, 10),
  ],
} as unknown as RoutesResponse;

const ASSESSMENT = {
  checkpoints: [
    assessed('A-0', 'low', 1),
    assessed('A-1', 'high', 2),
    assessed('A-2', 'high', 3),
    assessed('A-3', 'low', 4),
    assessed('A-4', 'low', 5),
    assessed('B-0', 'low', 1),
    assessed('B-1', 'low', 3),
    assessed('B-2', 'moderate', 6),
    assessed('B-3', 'unknown', 7),
  ],
  routes: [
    { id: 'B', rank: 1, travel_minutes: 120 },
    { id: 'A', rank: 2, travel_minutes: 100 },
  ],
} as unknown as AssessResponse;

describe('buildRouteViews', () => {
  it('joins planned routes with their assessments, best first', () => {
    const views = buildRouteViews(PLAN, ASSESSMENT);

    expect(views.map((view) => [view.id, view.rank, view.lengthMi])).toEqual([
      ['B', 1, 120],
      ['A', 2, 100],
    ]);
    expect(views[1]?.checkpoints.map((checkpoint) => checkpoint.assessment.level)).toEqual([
      'low',
      'high',
      'high',
      'low',
      'low',
    ]);
    expect(views[0]?.metrics.travel_minutes).toBe(120);
  });

  it('gives each route the range of forecast lead times it relies on', () => {
    const [routeB] = buildRouteViews(PLAN, ASSESSMENT);

    expect(routeB?.leadHours).toEqual({ min: 1, max: 7 });
  });
});

describe('riskRuns', () => {
  it('merges neighbouring checkpoints with the same level into stretches of the route', () => {
    const routeA = buildRouteViews(PLAN, ASSESSMENT)[1];
    if (!routeA) throw new Error('missing route');

    expect(riskRuns(routeA)).toEqual([
      { level: 'low', startMi: 0, endMi: 12.5, checkpoints: 1 },
      { level: 'high', startMi: 12.5, endMi: 62.5, checkpoints: 2 },
      { level: 'low', startMi: 62.5, endMi: 100, checkpoints: 2 },
    ]);
  });

  it('covers the whole route, including a short final stretch', () => {
    const routeB = buildRouteViews(PLAN, ASSESSMENT)[0];
    if (!routeB) throw new Error('missing route');

    expect(riskRuns(routeB)).toEqual([
      { level: 'low', startMi: 0, endMi: 75, checkpoints: 2 },
      { level: 'moderate', startMi: 75, endMi: 110, checkpoints: 1 },
      { level: 'unknown', startMi: 110, endMi: 120, checkpoints: 1 },
    ]);
  });
});

describe('mileTicks', () => {
  it.each([
    [1007, [0, 250, 500, 750, 1000]],
    [412, [0, 100, 200, 300, 400]],
    [60, [0, 20, 40, 60]],
    [8.4, [0, 2, 4, 6, 8]],
    [0, [0]],
  ])('marks a %s mi axis at round distances', (maxMi, ticks) => {
    expect(mileTicks(maxMi)).toEqual(ticks);
  });
});

describe('notableMiles', () => {
  function metrics(miles: Record<RiskKey, number>, display: Partial<Record<RiskKey, string>> = {}) {
    const miles_display = Object.fromEntries(
      Object.entries(miles).map(([key, value]) => [key, display[key as RiskKey] ?? String(value)]),
    );
    return { miles, miles_display } as unknown as RouteAssessment;
  }

  it('lists the miles above Low, worst first, then miles without a forecast', () => {
    const route = metrics(
      { low: 900, moderate: 120, high: 0, severe: 0, no_travel: 0, unknown: 15 },
      { high: '<1' },
    );

    expect(notableMiles(route)).toEqual([
      { level: 'high', display: '<1' },
      { level: 'moderate', display: '120' },
      { level: 'unknown', display: '15' },
    ]);
  });

  it('keeps a stretch the API rounds to no miles but displays as "<1"', () => {
    const route = metrics(
      { low: 500, moderate: 0, high: 0, severe: 0, no_travel: 0, unknown: 0 },
      { no_travel: '<1' },
    );

    expect(notableMiles(route)).toEqual([{ level: 'no_travel', display: '<1' }]);
  });

  it('is empty when the whole route is Low', () => {
    const route = metrics({ low: 300, moderate: 0, high: 0, severe: 0, no_travel: 0, unknown: 0 });

    expect(notableMiles(route)).toEqual([]);
  });
});
