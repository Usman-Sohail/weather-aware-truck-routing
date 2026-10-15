// A synthetic Denver to Chicago plan and assessment in the API's shape. Generated rather
// than recorded, so no provider data is stored in the repository.

import type {
  AssessResponse,
  CheckpointAssessment,
  LonLat,
  PlaceCandidate,
  PlannedCheckpoint,
  PlannedRoute,
  RiskKey,
  RouteAssessment,
  RoutesResponse,
} from '../src/types/api';

export const DENVER: PlaceCandidate = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};

export const CHICAGO: PlaceCandidate = {
  name: 'Chicago, IL, United States',
  lat: 41.88,
  lon: -87.63,
  country_code: 'US',
  time_zone: 'America/Chicago',
};

const DEPARTURE_MS = Date.parse('2026-10-16T14:00:00Z');
const HOUR_MS = 3_600_000;
const SLIDER_HOURS = 48;
const LEVELS: RiskKey[] = ['low', 'moderate', 'high', 'severe', 'no_travel'];

interface RouteShape {
  id: string;
  via: LonLat;
  lengthMi: number;
  hours: number;
  levels: (mile: number) => RiskKey;
}

const SHAPES: RouteShape[] = [
  {
    id: 'A',
    via: [-96, 41.3],
    lengthMi: 1007,
    hours: 14,
    levels: (mile) => (mile >= 300 && mile < 500 ? 'severe' : 'low'),
  },
  {
    id: 'B',
    via: [-96, 38.8],
    lengthMi: 1174,
    hours: 16.3,
    levels: (mile) => (mile >= 600 && mile < 800 ? 'moderate' : 'low'),
  },
  {
    id: 'C',
    via: [-97, 43.5],
    lengthMi: 1331,
    hours: 19,
    levels: (mile) => (mile >= 200 && mile < 500 ? 'high' : 'low'),
  },
];

function along(start: LonLat, via: LonLat, end: LonLat, share: number): LonLat {
  const [from, to, part] = share < 0.5 ? [start, via, share * 2] : [via, end, share * 2 - 1];
  return [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part];
}

function iso(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

const start: LonLat = [DENVER.lon, DENVER.lat];
const end: LonLat = [CHICAGO.lon, CHICAGO.lat];

const routes: PlannedRoute[] = SHAPES.map((shape, index) => {
  const travelMs = shape.hours * HOUR_MS;
  return {
    id: shape.id,
    provider_index: index,
    geometry: Array.from({ length: 41 }, (_, step) => along(start, shape.via, end, step / 40)),
    length_mi: shape.lengthMi,
    travel_time_s: shape.hours * 3600,
    arrival_utc: iso(DEPARTURE_MS + travelMs),
    hourly_positions: Array.from({ length: SLIDER_HOURS + 1 }, (_, hour) =>
      hour * HOUR_MS > travelMs ? null : along(start, shape.via, end, (hour * HOUR_MS) / travelMs),
    ),
  };
});

const planned: PlannedCheckpoint[] = [];
const assessed: CheckpointAssessment[] = [];

for (const shape of SHAPES) {
  const miles = [
    ...Array.from({ length: Math.ceil(shape.lengthMi / 100) }, (_, i) => i * 100),
    shape.lengthMi,
  ];
  miles.forEach((mile, seq) => {
    const share = mile / shape.lengthMi;
    const [lon, lat] = along(start, shape.via, end, share);
    const etaMs = DEPARTURE_MS + share * shape.hours * HOUR_MS;
    const id = `${shape.id}-${seq}`;
    const level = shape.levels(mile);
    const gust = { low: 14, moderate: 28, high: 38, severe: 47, no_travel: 58, unknown: 0 }[level];
    planned.push({
      id,
      route_id: shape.id,
      seq,
      mile,
      share_mi: 100,
      lon,
      lat,
      eta_utc: iso(etaMs),
      location_index: planned.length,
    });
    assessed.push({
      id,
      forecast_hour_utc: iso(Math.floor(etaMs / HOUR_MS) * HOUR_MS + HOUR_MS),
      lead_hours: Math.floor((etaMs - DEPARTURE_MS) / HOUR_MS),
      weather: { gust_mph: gust, wind_mph: Math.round(gust / 2), rain_in_hr: 0, snow_in_hr: 0 },
      levels: { wind: level, rain: 'low', snow: 'low' },
      level,
      complete: true,
      reasons:
        level === 'low' ? [] : [`Gust ${gust} mph → ${level[0]?.toUpperCase()}${level.slice(1)}`],
    });
  });
}

const STEP_LAT = 0.5;
const STEP_LON = 0.65;
const COLUMNS = 28;
const cells: LonLat[] = Array.from({ length: COLUMNS * 12 }, (_, index) => [
  -105.5 + (index % COLUMNS) * STEP_LON,
  38 + Math.floor(index / COLUMNS) * STEP_LAT,
]);

// A band of weather that drifts east by a column each hour, so every hour looks different.
const frames = Array.from({ length: SLIDER_HOURS + 1 }, (_, hour) =>
  cells.map((_, index) => {
    const column = index % COLUMNS;
    const distance = Math.abs(column - (hour % COLUMNS));
    if (index % 37 === 0) return null;
    return distance < 2 ? 3 : distance < 4 ? 1 : 0;
  }),
);

function metrics(shape: RouteShape, rank: number): RouteAssessment {
  const counts = Object.fromEntries([...LEVELS, 'unknown'].map((level) => [level, 0])) as Record<
    RiskKey,
    number
  >;
  for (let mile = 0; mile < shape.lengthMi; mile += 100)
    counts[shape.levels(mile)] += Math.min(100, shape.lengthMi - mile);
  return {
    id: shape.id,
    rank,
    miles: counts,
    miles_display: Object.fromEntries(
      Object.entries(counts).map(([level, miles]) => [level, String(miles)]),
    ) as Record<RiskKey, string>,
    avg_risk: 0.4,
    has_no_travel: false,
    has_unknown: false,
    incomplete: false,
    travel_minutes: Math.round(shape.hours * 60),
  };
}

export const PLAN: RoutesResponse = {
  departure: {
    local: '2026-10-16T08:00',
    utc: iso(DEPARTURE_MS),
    time_zone: 'America/Denver',
    utc_offset: '-06:00',
    abbreviation: 'MDT',
  },
  interval_mi: 25,
  routes,
  checkpoints: planned,
  corridor: {
    step_lat_deg: STEP_LAT,
    step_lon_deg: STEP_LON,
    approx_cell_mi: 34,
    cells,
    first_location_index: planned.length,
  },
  forecast_window: {
    start_utc: iso(DEPARTURE_MS + HOUR_MS),
    end_utc: iso(DEPARTURE_MS + 49 * HOUR_MS),
    hours: 49,
  },
  weather_request: {
    url: 'https://api.open-meteo.com/v1/forecast',
    body: 'latitude=39.74',
    location_count: planned.length + cells.length,
  },
  notices: [],
  plan_token: 'e2e-plan',
};

const [shapeA, shapeB, shapeC] = SHAPES as [RouteShape, RouteShape, RouteShape];

export const ASSESSMENT: AssessResponse = {
  load_lb: 42000,
  checkpoints: assessed,
  routes: [metrics(shapeB, 1), metrics(shapeA, 2), metrics(shapeC, 3)],
  recommendation: {
    route_id: 'B',
    status: 'clear',
    decided_by: 'severe_miles',
    tied_on: [],
    explanation: 'Route B has fewer Severe miles than Route A (0 vs 200).',
  },
  heatmap: { hours: 49, frames },
};

// The smallest style MapLibre accepts, so tests never fetch real basemap tiles.
export const BASEMAP = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#f2f0eb' } }],
};
