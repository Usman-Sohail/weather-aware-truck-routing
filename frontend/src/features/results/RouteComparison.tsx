import { useId, useState } from 'react';

import { RiskBadge } from '../../components/RiskBadge';
import { RouteShield } from '../../components/RouteShield';
import { formatDuration, formatMiles } from '../../lib/format';
import { RISK_LEVELS, riskInfo, UNKNOWN_RISK } from '../../lib/risk';
import type { Recommendation } from '../../types/api';
import { mileTicks, notableMiles, riskRuns } from './model';
import type { RiskRun, RouteView } from './model';
import styles from './RouteComparison.module.css';

interface RouteComparisonProps {
  /** Best first, as ranked by the assessment. */
  routes: RouteView[];
  recommendation: Recommendation;
  selectedId: string | null;
  onSelect: (routeId: string) => void;
}

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Each route as a strip of its risk from start to finish, all on one mile scale, so the
 * driver sees how long each route is and where its trouble lies before opening any detail.
 */
export function RouteComparison({
  routes,
  recommendation,
  selectedId,
  onSelect,
}: RouteComparisonProps) {
  const groupName = useId();
  const [hovered, setHovered] = useState<{ routeId: string; run: RiskRun } | null>(null);
  const longest = Math.max(...routes.map((route) => route.lengthMi));
  const tag = recommendationTag(recommendation);

  return (
    <section className={styles.comparison} aria-labelledby="comparison-heading">
      <h3 id="comparison-heading" className={styles.heading}>
        Route comparison
      </h3>
      <p className={styles.hint}>Best first. Select a route to see its checkpoints.</p>

      <div className={styles.routes} role="radiogroup" aria-labelledby="comparison-heading">
        {routes.map((route) => {
          const facts = `${formatMiles(route.lengthMi)} in ${formatDuration(route.metrics.travel_minutes)}`;
          const risk = riskSummary(route);
          const routeTag = route.id === recommendation.route_id ? tag : null;
          return (
            <label key={route.id} className={styles.route}>
              <input
                type="radio"
                name={groupName}
                value={route.id}
                checked={route.id === selectedId}
                onChange={() => onSelect(route.id)}
                className="visually-hidden"
                aria-label={`Route ${route.id}: ${facts}.${routeTag ? ` ${routeTag}.` : ''} ${risk}.`}
              />
              <span className={styles.head}>
                <RouteShield id={route.id} size={26} decorative />
                <span className={styles.facts}>{facts}</span>
                {routeTag && <span className={styles.tag}>{routeTag}</span>}
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.ribbon}
                  data-ribbon={route.id}
                  style={{ width: `${(route.lengthMi / longest) * 100}%` }}
                  onMouseLeave={() => setHovered(null)}
                >
                  {riskRuns(route).map((run) => {
                    const level = riskInfo(run.level);
                    return (
                      <span
                        key={run.startMi}
                        className={styles.run}
                        style={{ flexGrow: run.endMi - run.startMi, backgroundColor: level.color }}
                        onMouseEnter={() => setHovered({ routeId: route.id, run })}
                      />
                    );
                  })}
                </span>
                {hovered?.routeId === route.id && (
                  <StretchTooltip run={hovered.run} longest={longest} />
                )}
              </span>
              <span className={styles.summary}>{risk}</span>
            </label>
          );
        })}
      </div>

      <div className={styles.axis} aria-hidden="true">
        {mileTicks(longest).map((tick, index) => (
          <span key={tick} className={styles.tick} style={{ left: `${(tick / longest) * 100}%` }}>
            {index === 0 ? '0 mi' : wholeNumber.format(tick)}
          </span>
        ))}
      </div>

      <ul className={styles.legend} aria-label="Risk levels">
        {[...RISK_LEVELS, UNKNOWN_RISK].map((level) => (
          <li key={level.key}>
            <RiskBadge level={level.key} size="small" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The stretch under the pointer, centred over it but kept inside the strip near its ends.
 * Pointer-only detail: the route's summary and the checkpoint table carry the same facts.
 */
function StretchTooltip({ run, longest }: { run: RiskRun; longest: number }) {
  const middle = ((run.startMi + run.endMi) / 2 / longest) * 100;
  const align = middle < 20 ? 'start' : middle > 80 ? 'end' : 'center';
  return (
    <span
      role="tooltip"
      className={styles.tooltip}
      data-align={align}
      style={{ left: `${middle}%` }}
    >
      <RiskBadge level={run.level} size="small" />
      <span>
        Miles {wholeNumber.format(run.startMi)} to {wholeNumber.format(run.endMi)}
      </span>
    </span>
  );
}

/** Only a route that avoids No Travel is called recommended; the card explains the rest. */
function recommendationTag({ status }: Recommendation): string | null {
  if (status === 'no_safe_route') return 'Least risky';
  return status === 'unavailable' ? null : 'Recommended';
}

/** "300 mi High, 25 mi Moderate", or a plain statement when the whole route is Low. */
function riskSummary(route: RouteView): string {
  const notable = notableMiles(route.metrics);
  if (notable.length === 0) return 'Low risk the whole way';
  return notable
    .map(({ level, display }) =>
      level === 'unknown'
        ? `${display} mi without a forecast`
        : `${display} mi ${riskInfo(level).label}`,
    )
    .join(', ');
}
