import { describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  assessTrip,
  fetchForecast,
  geocode,
  isAbortError,
  planRoutes,
  requestJson,
} from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestJson', () => {
  it('returns the parsed body and sends JSON when a body is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJson<{ ok: boolean }>('/api/thing', {
      method: 'POST',
      body: { load_lb: 1000 },
    });

    expect(result).toEqual({ ok: true });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/thing');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"load_lb":1000}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('turns the error envelope into an ApiError with fields and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'INTERVAL_TOO_FINE',
              message: 'Choose a larger interval.',
              fields: { interval_mi: ['Too fine for this trip.'] },
              suggested_interval_mi: 25,
            },
          },
          422,
        ),
      ),
    );

    const error = await requestJson('/api/routes').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'INTERVAL_TOO_FINE',
      message: 'Choose a larger interval.',
      fields: { interval_mi: ['Too fine for this trip.'] },
      details: { suggested_interval_mi: 25 },
    });
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(requestJson('/api/health')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('reports a non-JSON error page as BAD_RESPONSE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })),
    );

    await expect(requestJson('/api/health')).rejects.toMatchObject({
      status: 502,
      code: 'BAD_RESPONSE',
    });
  });

  it('rethrows aborts unchanged so callers can ignore them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')),
    );

    const error = await requestJson('/api/health').catch((caught: unknown) => caught);

    expect(isAbortError(error)).toBe(true);
  });
});

describe('planning endpoints', () => {
  it('geocodes with an encoded query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ candidates: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await geocode("St. John's, NL");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/geocode?q=St.%20John's%2C%20NL");
  });

  it('posts trips and assessments as JSON', async () => {
    // A response body can be read only once, so each call gets a fresh response.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchMock);

    await planRoutes({
      origin: { name: 'Denver', lat: 39.74, lon: -104.99 },
      destination: { name: 'Chicago', lat: 41.88, lon: -87.63 },
      departure_local: '2026-10-16T08:00',
      interval_mi: 25,
    });
    await assessTrip({ plan_token: 'token', load_lb: 42000, weather: [] });

    const [routesPath, routesInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [assessPath, assessInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(routesPath).toBe('/api/routes');
    expect(routesInit.method).toBe('POST');
    expect(assessPath).toBe('/api/assess');
    expect(JSON.parse(assessInit.body as string)).toEqual({
      plan_token: 'token',
      load_lb: 42000,
      weather: [],
    });
  });
});

describe('fetchForecast', () => {
  const request = {
    url: 'https://api.open-meteo.com/v1/forecast',
    body: 'latitude=1',
    location_count: 1,
  };

  it('sends the prepared body as a form-encoded POST and returns the raw JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ hourly: {} }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchForecast(request);

    expect(result).toEqual([{ hourly: {} }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(request.url);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('latitude=1');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
  });

  it('reports the forecast service rate limit with its reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: true, reason: 'Minutely API request limit exceeded.' }, 429),
        ),
    );

    await expect(fetchForecast(request)).rejects.toMatchObject({
      status: 429,
      code: 'WEATHER_RATE_LIMITED',
      message:
        'The weather service is limiting requests from your network (Minutely API request limit exceeded.). Try again in a minute.',
    });
  });

  it('reports other forecast failures and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 502 })));
    await expect(fetchForecast(request)).rejects.toMatchObject({ code: 'WEATHER_UNAVAILABLE' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchForecast(request)).rejects.toMatchObject({
      code: 'WEATHER_UNAVAILABLE',
      status: 0,
    });
  });
});
