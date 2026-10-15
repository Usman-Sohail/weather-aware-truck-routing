import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, assessTrip, fetchForecast, isAbortError, planRoutes } from '../../lib/api';
import type { AssessResponse, RoutesRequest, RoutesResponse } from '../../types/api';
import type { Trip } from '../plan-form/validation';

export type PlanStep = 'routing' | 'forecast' | 'assessing';

export interface PlanState {
  status: 'idle' | 'working' | 'done' | 'failed';
  step: PlanStep | null;
  trip: Trip | null;
  plan: RoutesResponse | null;
  assessment: AssessResponse | null;
  error: ApiError | null;
}

export interface PlanApi {
  planRoutes: typeof planRoutes;
  fetchForecast: typeof fetchForecast;
  assessTrip: typeof assessTrip;
}

interface PlannedTrip {
  trip: Trip;
  plan: RoutesResponse;
  weather: unknown;
}

const DEFAULT_API: PlanApi = { planRoutes, fetchForecast, assessTrip };

const IDLE: PlanState = {
  status: 'idle',
  step: null,
  trip: null,
  plan: null,
  assessment: null,
  error: null,
};

/**
 * Runs a plan in three steps: routes from the API, the forecast fetched by the browser,
 * then the assessment by the API. When only the cargo weight changes, the routes and
 * forecast already in hand are assessed again, with no new routing or weather requests.
 * A newer submission cancels an older one, so stale results never reach the screen.
 */
export function usePlanTrip(api: PlanApi = DEFAULT_API) {
  const [state, setState] = useState<PlanState>(IDLE);
  const running = useRef<AbortController | null>(null);
  const lastPlanned = useRef<PlannedTrip | null>(null);

  useEffect(() => () => running.current?.abort(), []);

  const submit = useCallback(
    async (trip: Trip): Promise<void> => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      const { signal } = controller;
      const isCurrent = () => running.current === controller;

      async function planAndFetch(): Promise<PlannedTrip | null> {
        setState({ ...IDLE, status: 'working', step: 'routing', trip });
        const plan = await api.planRoutes(toRoutesRequest(trip), signal);
        if (!isCurrent()) return null;
        setState((previous) => ({ ...previous, step: 'forecast', plan }));
        const weather = await api.fetchForecast(plan.weather_request, signal);
        if (!isCurrent()) return null;
        setState((previous) => ({ ...previous, step: 'assessing' }));
        return { trip, plan, weather };
      }

      function assess(planned: PlannedTrip): Promise<AssessResponse> {
        return api.assessTrip(
          { plan_token: planned.plan.plan_token, load_lb: trip.loadLb, weather: planned.weather },
          signal,
        );
      }

      try {
        const reusable =
          lastPlanned.current && sameRoute(lastPlanned.current.trip, trip)
            ? lastPlanned.current
            : null;
        let planned: PlannedTrip | null;
        let assessment: AssessResponse;

        if (reusable) {
          setState((previous) => ({
            ...previous,
            status: 'working',
            step: 'assessing',
            trip,
            error: null,
          }));
          planned = reusable;
          try {
            assessment = await assess(planned);
          } catch (caught) {
            if (!(caught instanceof ApiError && caught.code === 'CONTEXT_EXPIRED')) throw caught;
            // The saved plan expired; plan the same trip again from the start.
            planned = await planAndFetch();
            if (!planned) return;
            assessment = await assess(planned);
          }
        } else {
          planned = await planAndFetch();
          if (!planned) return;
          assessment = await assess(planned);
        }

        if (!isCurrent()) return;
        lastPlanned.current = { ...planned, trip };
        setState({
          status: 'done',
          step: null,
          trip,
          plan: planned.plan,
          assessment,
          error: null,
        });
      } catch (caught) {
        if (!isCurrent() || isAbortError(caught)) return;
        setState((previous) => ({
          ...previous,
          status: 'failed',
          step: null,
          error: toApiError(caught),
        }));
      }
    },
    [api],
  );

  return { state, submit };
}

/** Same trip apart from the cargo weight, so the routes and forecast still apply. */
function sameRoute(a: Trip, b: Trip): boolean {
  return (
    a.origin.lat === b.origin.lat &&
    a.origin.lon === b.origin.lon &&
    a.destination.lat === b.destination.lat &&
    a.destination.lon === b.destination.lon &&
    a.departureLocal === b.departureLocal &&
    a.intervalMi === b.intervalMi
  );
}

function toRoutesRequest(trip: Trip): RoutesRequest {
  const place = ({ name, lat, lon }: Trip['origin']) => ({ name, lat, lon });
  return {
    origin: place(trip.origin),
    destination: place(trip.destination),
    departure_local: trip.departureLocal,
    interval_mi: trip.intervalMi,
  };
}

function toApiError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, 'UNEXPECTED', 'Something went wrong. Please try again.');
}
