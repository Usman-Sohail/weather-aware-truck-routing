import { describe, expect, it, vi } from 'vitest';

import { ApiError, isAbortError, requestJson } from './api';

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
