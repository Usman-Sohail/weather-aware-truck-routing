import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { AssessResponse, PlaceCandidate, RoutesResponse } from '../../types/api';
import type { Trip } from '../plan-form/validation';
import { type PlanApi, usePlanTrip } from './usePlanTrip';

const DENVER: PlaceCandidate = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};
const CHICAGO: PlaceCandidate = {
  name: 'Chicago, IL, United States',
  lat: 41.88,
  lon: -87.63,
  country_code: 'US',
  time_zone: 'America/Chicago',
};
const TRIP: Trip = {
  origin: DENVER,
  destination: CHICAGO,
  departureLocal: '2026-10-16T08:00',
  loadLb: 42000,
  intervalMi: 25,
};
const WEATHER = [{ hourly: {} }];

function plan(token = 'token-1'): RoutesResponse {
  return {
    plan_token: token,
    weather_request: { url: 'https://forecast.example/v1', body: 'latitude=1', location_count: 1 },
  } as RoutesResponse;
}

function assessment(load: number): AssessResponse {
  return { load_lb: load } as AssessResponse;
}

function fakeApi(overrides: Partial<PlanApi> = {}): PlanApi {
  return {
    planRoutes: vi.fn().mockResolvedValue(plan()),
    fetchForecast: vi.fn().mockResolvedValue(WEATHER),
    assessTrip: vi
      .fn()
      .mockImplementation((request: { load_lb: number }) =>
        Promise.resolve(assessment(request.load_lb)),
      ),
    ...overrides,
  };
}

describe('usePlanTrip', () => {
  it('plans routes, relays the forecast and assesses the trip', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));

    expect(api.planRoutes).toHaveBeenCalledWith(
      {
        origin: { name: DENVER.name, lat: DENVER.lat, lon: DENVER.lon },
        destination: { name: CHICAGO.name, lat: CHICAGO.lat, lon: CHICAGO.lon },
        departure_local: '2026-10-16T08:00',
        interval_mi: 25,
      },
      expect.any(AbortSignal),
    );
    expect(api.fetchForecast).toHaveBeenCalledWith(plan().weather_request, expect.any(AbortSignal));
    expect(api.assessTrip).toHaveBeenCalledWith(
      { plan_token: 'token-1', load_lb: 42000, weather: WEATHER },
      expect.any(AbortSignal),
    );
    expect(result.current.state).toMatchObject({
      status: 'done',
      plan: plan(),
      assessment: assessment(42000),
      error: null,
    });
  });

  it('reports each step while it runs', async () => {
    let finishForecast: (weather: unknown) => void = () => {};
    const api = fakeApi({
      fetchForecast: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finishForecast = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => usePlanTrip(api));

    act(() => {
      void result.current.submit(TRIP);
    });
    await waitFor(() => expect(result.current.state.step).toBe('forecast'));
    expect(result.current.state.plan).toEqual(plan());

    await act(async () => finishForecast(WEATHER));
    await waitFor(() => expect(result.current.state.status).toBe('done'));
  });

  it('re-assesses a load change without new routing or weather requests', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));
    await act(() => result.current.submit({ ...TRIP, loadLb: 30000 }));

    expect(api.planRoutes).toHaveBeenCalledTimes(1);
    expect(api.fetchForecast).toHaveBeenCalledTimes(1);
    expect(api.assessTrip).toHaveBeenLastCalledWith(
      { plan_token: 'token-1', load_lb: 30000, weather: WEATHER },
      expect.any(AbortSignal),
    );
    expect(result.current.state.assessment).toEqual(assessment(30000));
  });

  it('plans again when anything but the load changes', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));
    await act(() => result.current.submit({ ...TRIP, intervalMi: 10 }));

    expect(api.planRoutes).toHaveBeenCalledTimes(2);
  });

  it('plans again when the saved plan has expired', async () => {
    const expired = new ApiError(410, 'CONTEXT_EXPIRED', 'This plan has expired.');
    const api = fakeApi({
      planRoutes: vi
        .fn()
        .mockResolvedValueOnce(plan('token-1'))
        .mockResolvedValueOnce(plan('token-2')),
      assessTrip: vi
        .fn()
        .mockResolvedValueOnce(assessment(42000))
        .mockRejectedValueOnce(expired)
        .mockResolvedValueOnce(assessment(30000)),
    });
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));
    await act(() => result.current.submit({ ...TRIP, loadLb: 30000 }));

    expect(api.planRoutes).toHaveBeenCalledTimes(2);
    expect(api.assessTrip).toHaveBeenLastCalledWith(
      expect.objectContaining({ plan_token: 'token-2', load_lb: 30000 }),
      expect.any(AbortSignal),
    );
    expect(result.current.state.status).toBe('done');
  });

  it('keeps the error of a failed step', async () => {
    const limited = new ApiError(
      429,
      'WEATHER_RATE_LIMITED',
      'The weather service is limiting requests.',
    );
    const api = fakeApi({ fetchForecast: vi.fn().mockRejectedValue(limited) });
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));

    expect(result.current.state).toMatchObject({ status: 'failed', error: limited, step: null });
    expect(result.current.state.plan).toEqual(plan());
  });

  it('turns unexpected failures into a readable error', async () => {
    const api = fakeApi({ planRoutes: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderHook(() => usePlanTrip(api));

    await act(() => result.current.submit(TRIP));

    expect(result.current.state.error).toBeInstanceOf(ApiError);
    expect(result.current.state.error?.message).toBe('Something went wrong. Please try again.');
  });

  it('ignores the result of a run that a newer submission replaced', async () => {
    let finishFirst: (value: RoutesResponse) => void = () => {};
    const api = fakeApi({
      planRoutes: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishFirst = resolve;
            }),
        )
        .mockResolvedValueOnce(plan('token-2')),
    });
    const { result } = renderHook(() => usePlanTrip(api));

    act(() => {
      void result.current.submit(TRIP);
    });
    await act(() => result.current.submit({ ...TRIP, intervalMi: 50 }));
    await act(async () => finishFirst(plan('stale')));

    expect(result.current.state.plan?.plan_token).toBe('token-2');
    expect(api.fetchForecast).toHaveBeenCalledTimes(1);
  });
});
