// Route views for component tests, with checkpoints spread evenly along each route.

import type { CheckpointAssessment, RiskKey } from '../../types/api';
import type { CheckpointView, RouteView } from './model';

const NO_MILES: Record<RiskKey, number> = {
  low: 0,
  moderate: 0,
  high: 0,
  severe: 0,
  no_travel: 0,
  unknown: 0,
};

export function testCheckpoint(
  routeId: string,
  seq: number,
  mile: number,
  level: RiskKey,
  overrides: Partial<CheckpointAssessment> = {},
): CheckpointView {
  return {
    id: `${routeId}-${seq}`,
    route_id: routeId,
    seq,
    mile,
    share_mi: 0,
    lon: -100,
    lat: 40,
    eta_utc: new Date(Date.UTC(2026, 9, 15, 1, 15) + seq * 3_600_000).toISOString(),
    location_index: seq,
    assessment: {
      id: `${routeId}-${seq}`,
      forecast_hour_utc: '2026-10-15T02:00:00Z',
      lead_hours: seq,
      weather: { gust_mph: 12, wind_mph: 6, rain_in_hr: 0, snow_in_hr: 0 },
      levels: { wind: level, rain: 'low', snow: 'low' },
      level,
      complete: level !== 'unknown',
      reasons: [],
      ...overrides,
    },
  };
}

/** A route whose checkpoints sit every ``lengthMi / (levels.length - 1)`` miles. */
export function testRoute(
  id: string,
  rank: number,
  lengthMi: number,
  levels: RiskKey[],
  miles: Partial<Record<RiskKey, number>> = {},
): RouteView {
  const spacing = lengthMi / Math.max(levels.length - 1, 1);
  const allMiles = { ...NO_MILES, ...miles };
  return {
    id,
    providerIndex: rank - 1,
    rank,
    lengthMi,
    travelTimeS: lengthMi * 50,
    leadHours: { min: 0, max: levels.length - 1 },
    checkpoints: levels.map((level, seq) => testCheckpoint(id, seq, seq * spacing, level)),
    metrics: {
      id,
      rank,
      miles: allMiles,
      miles_display: Object.fromEntries(
        Object.entries(allMiles).map(([key, value]) => [
          key,
          value > 0 && value < 1 ? '<1' : String(value),
        ]),
      ) as Record<RiskKey, string>,
      avg_risk: 0.1,
      has_no_travel: allMiles.no_travel > 0,
      has_unknown: allMiles.unknown > 0,
      incomplete: false,
      travel_minutes: Math.round((lengthMi * 50) / 60),
    },
  };
}
