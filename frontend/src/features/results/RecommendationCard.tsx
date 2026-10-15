import { RouteShield } from '../../components/RouteShield';
import { formatDuration, formatLoad, formatMiles } from '../../lib/format';
import type { Recommendation } from '../../types/api';
import type { RouteView } from './model';
import styles from './RecommendationCard.module.css';

interface RecommendationCardProps {
  /** The recommended route, or null when no route can be recommended. */
  route: RouteView | null;
  recommendation: Recommendation;
  loadLb: number;
}

export function RecommendationCard({ route, recommendation, loadLb }: RecommendationCardProps) {
  const { status, explanation } = recommendation;

  if (!route || status === 'unavailable') {
    return (
      <section className={styles.card} aria-labelledby="recommendation-heading">
        <h3 id="recommendation-heading" className={styles.heading}>
          No route can be recommended
        </h3>
        <p className={styles.explanation}>{explanation}</p>
      </section>
    );
  }

  const { metrics } = route;
  return (
    <section className={styles.card} data-status={status} aria-labelledby="recommendation-heading">
      <h3 id="recommendation-heading" className={styles.heading}>
        {status !== 'no_safe_route' && <RouteShield id={route.id} size={32} decorative />}
        {headline(status, route.id)}
      </h3>
      {status === 'no_safe_route' && (
        <p className={styles.leastRisky}>The least risky option is Route {route.id}.</p>
      )}
      <p className={styles.explanation}>{explanation}</p>

      <dl className={styles.facts}>
        <div>
          <dt>Distance</dt>
          <dd>{formatMiles(route.lengthMi)}</dd>
        </div>
        <div>
          <dt>Driving time</dt>
          <dd>{formatDuration(metrics.travel_minutes)}</dd>
        </div>
        {metrics.has_no_travel && (
          <div>
            <dt>No Travel miles</dt>
            <dd>{metrics.miles_display.no_travel} mi</dd>
          </div>
        )}
        <div>
          <dt>Severe miles</dt>
          <dd>{metrics.miles_display.severe} mi</dd>
        </div>
        <div>
          <dt>High miles</dt>
          <dd>{metrics.miles_display.high} mi</dd>
        </div>
        <div>
          <dt>Average risk</dt>
          <dd>{metrics.avg_risk === null ? 'No data' : `${metrics.avg_risk} of 4`}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Assessed for a {formatLoad(loadLb)} load.{' '}
        {route.leadHours && <>{leadTimeText(route.leadHours)} </>}
        Arrival times assume continuous driving, without required rest breaks.
      </p>
    </section>
  );
}

function headline(status: Recommendation['status'], routeId: string): string {
  switch (status) {
    case 'no_safe_route':
      return 'No route avoids No Travel conditions';
    case 'provisional':
      return `Route ${routeId}, with some forecast data missing`;
    default:
      return `Take Route ${routeId}`;
  }
}

/** How far ahead the forecasts look, since longer leads are less certain. */
function leadTimeText({ min, max }: { min: number; max: number }): string {
  if (max === 0) return 'Forecasts for the coming hour.';
  if (min === max) return `Forecasts ${hours(max)} ahead.`;
  if (min === 0) return `Forecasts up to ${hours(max)} ahead.`;
  return `Forecasts from ${min} to ${hours(max)} ahead.`;
}

function hours(count: number): string {
  return count === 1 ? '1 hour' : `${count} hours`;
}
