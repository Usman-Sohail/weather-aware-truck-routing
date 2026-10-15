import { useMemo, useState } from 'react';

import type { AssessResponse, RoutesResponse } from '../../types/api';
import { buildRouteViews } from './model';
import type { RouteView } from './model';

export interface Results {
  plan: RoutesResponse;
  assessment: AssessResponse;
  /** Best first. */
  routes: RouteView[];
  /** The route the recommendation names, if any. */
  recommended: RouteView | null;
  /** The route whose details are open: the driver's choice, or the recommended one. */
  selected: RouteView | null;
  select: (routeId: string) => void;
}

/**
 * The assessed routes and which one the driver is looking at. A choice belongs to the plan
 * it was made on: it survives a new assessment of the same plan (a cargo weight change),
 * and a new plan opens on its own recommendation.
 */
export function useResults(
  plan: RoutesResponse | null,
  assessment: AssessResponse | null,
): Results | null {
  const [choice, setChoice] = useState<{ token: string; routeId: string } | null>(null);
  const routes = useMemo(
    () => (plan && assessment ? buildRouteViews(plan, assessment) : null),
    [plan, assessment],
  );
  if (!plan || !assessment || !routes) return null;

  const recommended =
    routes.find((route) => route.id === assessment.recommendation.route_id) ?? null;
  const chosenId = choice?.token === plan.plan_token ? choice.routeId : null;
  const selected =
    routes.find((route) => route.id === chosenId) ?? recommended ?? routes[0] ?? null;

  return {
    plan,
    assessment,
    routes,
    recommended,
    selected,
    select: (routeId) => setChoice({ token: plan.plan_token, routeId }),
  };
}
