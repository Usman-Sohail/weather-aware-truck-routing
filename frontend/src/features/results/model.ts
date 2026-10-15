// Joins the planned routes with their assessment into what the results views display.

import type {
  AssessResponse,
  CheckpointAssessment,
  PlannedCheckpoint,
  RiskKey,
  RouteAssessment,
  RoutesResponse,
} from '../../types/api';

export interface CheckpointView extends PlannedCheckpoint {
  assessment: CheckpointAssessment;
}

export interface RouteView {
  id: string;
  providerIndex: number;
  rank: number;
  lengthMi: number;
  travelTimeS: number;
  metrics: RouteAssessment;
  checkpoints: CheckpointView[];
  /** Range of forecast lead times behind this route's checkpoints. */
  leadHours: { min: number; max: number } | null;
}

/** A stretch of route where consecutive checkpoints share one risk level. */
export interface RiskRun {
  level: RiskKey;
  startMi: number;
  endMi: number;
  checkpoints: number;
}

export function buildRouteViews(plan: RoutesResponse, assessment: AssessResponse): RouteView[] {
  const assessmentById = new Map(assessment.checkpoints.map((item) => [item.id, item]));
  const metricsById = new Map(assessment.routes.map((item) => [item.id, item]));

  const views = plan.routes.flatMap((route): RouteView[] => {
    const metrics = metricsById.get(route.id);
    if (!metrics) return [];
    const checkpoints = plan.checkpoints
      .filter((checkpoint) => checkpoint.route_id === route.id)
      .sort((a, b) => a.seq - b.seq)
      .flatMap((checkpoint): CheckpointView[] => {
        const result = assessmentById.get(checkpoint.id);
        return result ? [{ ...checkpoint, assessment: result }] : [];
      });
    const leads = checkpoints.map((checkpoint) => checkpoint.assessment.lead_hours);
    return [
      {
        id: route.id,
        providerIndex: route.provider_index,
        rank: metrics.rank,
        lengthMi: route.length_mi,
        travelTimeS: route.travel_time_s,
        metrics,
        checkpoints,
        leadHours: leads.length > 0 ? { min: Math.min(...leads), max: Math.max(...leads) } : null,
      },
    ];
  });
  return views.sort((a, b) => a.rank - b.rank);
}

/**
 * Each checkpoint represents the route halfway to its neighbours (the same rule the
 * backend uses for mile counts), so the runs tile the route from mile 0 to its end.
 */
export function riskRuns(route: RouteView): RiskRun[] {
  const runs: RiskRun[] = [];
  const { checkpoints } = route;
  checkpoints.forEach((checkpoint, index) => {
    const previous = checkpoints[index - 1];
    const next = checkpoints[index + 1];
    const startMi = previous ? (previous.mile + checkpoint.mile) / 2 : 0;
    const endMi = next ? (checkpoint.mile + next.mile) / 2 : route.lengthMi;
    const level = checkpoint.assessment.level;
    const last = runs.at(-1);
    if (last && last.level === level) {
      last.endMi = endMi;
      last.checkpoints += 1;
    } else {
      runs.push({ level, startMi, endMi, checkpoints: 1 });
    }
  });
  return runs;
}

export function mileTicks(maxMi: number, maxIntervals = 4): number[] {
  if (maxMi <= 0) return [0];
  const magnitude = 10 ** Math.floor(Math.log10(maxMi / maxIntervals));
  const step =
    [1, 2, 2.5, 5]
      .map((multiple) => multiple * magnitude)
      .find((candidate) => Math.floor(maxMi / candidate) <= maxIntervals) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let index = 0; index * step <= maxMi; index += 1) {
    ticks.push(index * step);
  }
  return ticks;
}

const NOTABLE_LEVELS: readonly RiskKey[] = ['no_travel', 'severe', 'high', 'moderate', 'unknown'];

/** Miles above Low, worst first, then miles without a forecast, as the API displays them. */
export function notableMiles(metrics: RouteAssessment): { level: RiskKey; display: string }[] {
  return NOTABLE_LEVELS.filter((level) => metrics.miles[level] > 0).map((level) => ({
    level,
    display: metrics.miles_display[level],
  }));
}
