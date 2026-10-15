import type {
  ApiErrorBody,
  AssessRequest,
  AssessResponse,
  GeocodeResponse,
  HealthResponse,
  RoutesRequest,
  RoutesResponse,
  WeatherRequest,
} from '../types/api';

/** A failed API call, carrying the backend's error code and any per-field messages. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Readonly<Record<string, string[]>>;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string[]> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const BAD_RESPONSE_MESSAGE = 'The server returned an unexpected response. Please try again.';

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function requestJson<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok && payload !== undefined) {
    return payload as T;
  }
  if (isErrorBody(payload)) {
    const { code, message, fields, ...details } = payload.error;
    throw new ApiError(response.status, code, message, fields, details);
  }
  throw new ApiError(response.status, 'BAD_RESPONSE', BAD_RESPONSE_MESSAGE);
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health', { signal });
}

export function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResponse> {
  return requestJson<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
}

export function planRoutes(request: RoutesRequest, signal?: AbortSignal): Promise<RoutesResponse> {
  return requestJson<RoutesResponse>('/api/routes', { method: 'POST', body: request, signal });
}

export function assessTrip(request: AssessRequest, signal?: AbortSignal): Promise<AssessResponse> {
  return requestJson<AssessResponse>('/api/assess', { method: 'POST', body: request, signal });
}

const WEATHER_UNAVAILABLE_MESSAGE =
  'The weather service could not be reached. Check your connection and try again.';

/**
 * Sends the forecast request prepared by the backend straight to the weather service, so
 * that it counts against this viewer's own rate limit, and returns the raw response for
 * the backend to validate. The body is form-encoded, which keeps it a CORS simple request.
 */
export async function fetchForecast(
  request: WeatherRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: request.body,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError(0, 'WEATHER_UNAVAILABLE', WEATHER_UNAVAILABLE_MESSAGE);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok && payload !== undefined) {
    return payload;
  }
  if (response.status === 429) {
    const reason = forecastErrorReason(payload);
    throw new ApiError(
      429,
      'WEATHER_RATE_LIMITED',
      `The weather service is limiting requests from your network${reason ? ` (${reason})` : ''}. Try again in a minute.`,
    );
  }
  throw new ApiError(response.status, 'WEATHER_UNAVAILABLE', WEATHER_UNAVAILABLE_MESSAGE);
}

function forecastErrorReason(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null && 'reason' in payload) {
    return typeof payload.reason === 'string' ? payload.reason : undefined;
  }
  return undefined;
}
