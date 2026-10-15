// Types mirroring the backend API contract. Times are ISO 8601 strings in UTC unless a
// field name says `_local`; coordinates are [lon, lat]; units are in the field names.

export type LonLat = [number, number];
export type IntervalMi = 10 | 25 | 50;
export type RiskKey = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel' | 'unknown';

export interface HealthResponse {
  status: 'ok';
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    [detail: string]: unknown;
  };
}

export interface PlaceCandidate {
  name: string;
  lat: number;
  lon: number;
  country_code: string;
  time_zone: string;
}

export interface GeocodeResponse {
  candidates: PlaceCandidate[];
}

export interface PlaceInput {
  name: string;
  lat: number;
  lon: number;
}

export interface RoutesRequest {
  origin: PlaceInput;
  destination: PlaceInput;
  departure_local: string;
  interval_mi: IntervalMi;
}

export interface Departure {
  local: string;
  utc: string;
  time_zone: string;
  utc_offset: string;
  abbreviation: string;
}

export interface PlannedRoute {
  id: string;
  provider_index: number;
  geometry: LonLat[];
  length_mi: number;
  travel_time_s: number;
  arrival_utc: string;
  hourly_positions: (LonLat | null)[];
}

export interface PlannedCheckpoint {
  id: string;
  route_id: string;
  seq: number;
  mile: number;
  share_mi: number;
  lon: number;
  lat: number;
  eta_utc: string;
  location_index: number;
}

export interface Corridor {
  step_lat_deg: number;
  step_lon_deg: number;
  approx_cell_mi: number;
  /** South-west corner of each cell. */
  cells: LonLat[];
  first_location_index: number;
}

export interface WeatherRequest {
  url: string;
  body: string;
  location_count: number;
}

export interface Notice {
  code: string;
  message: string;
}

export interface RoutesResponse {
  departure: Departure;
  interval_mi: IntervalMi;
  routes: PlannedRoute[];
  checkpoints: PlannedCheckpoint[];
  corridor: Corridor;
  forecast_window: { start_utc: string; end_utc: string; hours: number };
  weather_request: WeatherRequest;
  notices: Notice[];
  plan_token: string;
}

export interface AssessRequest {
  plan_token: string;
  load_lb: number;
  /** The raw forecast response, relayed unchanged. */
  weather: unknown;
}

export interface CheckpointAssessment {
  id: string;
  forecast_hour_utc: string;
  lead_hours: number;
  weather: {
    gust_mph: number | null;
    wind_mph: number | null;
    rain_in_hr: number | null;
    snow_in_hr: number | null;
  };
  levels: { wind: RiskKey; rain: RiskKey; snow: RiskKey };
  level: RiskKey;
  complete: boolean;
  reasons: string[];
}

export interface RouteAssessment {
  id: string;
  rank: number;
  miles: Record<RiskKey, number>;
  miles_display: Record<RiskKey, string>;
  avg_risk: number | null;
  has_no_travel: boolean;
  has_unknown: boolean;
  incomplete: boolean;
  travel_minutes: number;
}

export type RecommendationStatus = 'clear' | 'provisional' | 'no_safe_route' | 'unavailable';

export interface Recommendation {
  route_id: string | null;
  status: RecommendationStatus;
  decided_by: string | null;
  tied_on: string[];
  explanation: string;
}

export interface AssessResponse {
  load_lb: number;
  checkpoints: CheckpointAssessment[];
  routes: RouteAssessment[];
  recommendation: Recommendation;
  /** frames[hour][cell]: risk level 0-4, or null where unknown. */
  heatmap: { hours: number; frames: (number | null)[][] };
}
