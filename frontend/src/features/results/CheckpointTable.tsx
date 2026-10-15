import { useId, useState } from 'react';

import { RiskBadge } from '../../components/RiskBadge';
import { formatClock, formatReading, zoneAbbreviation } from '../../lib/format';
import type { CheckpointView, RouteView } from './model';
import styles from './CheckpointTable.module.css';

interface CheckpointTableProps {
  route: RouteView;
  /** Zone the arrival times are shown in, normally the trip's departure zone. */
  timeZone: string;
  onShowOnMap?: (checkpointId: string, trigger: HTMLElement) => void;
}

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Where and when the truck meets each forecast on one route, the risk there and why. */
export function CheckpointTable({ route, timeZone, onShowOnMap }: CheckpointTableProps) {
  const [hideLow, setHideLow] = useState(false);
  const headingId = useId();
  const { checkpoints } = route;
  const first = checkpoints[0];
  const zone = first ? zoneAbbreviation(timeZone, new Date(first.eta_utc)) : timeZone;
  const shown = hideLow
    ? checkpoints.filter((checkpoint) => checkpoint.assessment.level !== 'low')
    : checkpoints;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.heading}>
          Checkpoints on Route {route.id}
        </h3>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={hideLow}
            onChange={(event) => setHideLow(event.target.checked)}
          />
          Hide Low risk
        </label>
      </div>
      <p className={styles.count}>{countText(checkpoints)}</p>

      <table className={styles.table} aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col" className={styles.mile}>
              Mile
            </th>
            <th scope="col" className={styles.time}>
              Arrives ({zone})
            </th>
            <th scope="col" className={styles.risk}>
              Risk
            </th>
            <th scope="col">Conditions</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((checkpoint) => {
            const rowZone = zoneAbbreviation(timeZone, new Date(checkpoint.eta_utc));
            return (
              <tr key={checkpoint.id}>
                <td className={styles.mile}>
                  {onShowOnMap ? (
                    <button
                      type="button"
                      className={styles.show}
                      aria-label={`Show mile ${wholeNumber.format(checkpoint.mile)} on the map`}
                      onClick={(event) => onShowOnMap(checkpoint.id, event.currentTarget)}
                    >
                      {wholeNumber.format(checkpoint.mile)}
                    </button>
                  ) : (
                    wholeNumber.format(checkpoint.mile)
                  )}
                </td>
                {/* The zone is repeated only after a clock change during the trip. */}
                <td>{formatClock(checkpoint.eta_utc, timeZone, rowZone !== zone)}</td>
                <td>
                  <RiskBadge level={checkpoint.assessment.level} size="small" />
                </td>
                <td className={styles.conditions}>
                  {conditions(checkpoint).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={4} className={styles.empty}>
                Every checkpoint on Route {route.id} is Low risk.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function countText(checkpoints: CheckpointView[]): string {
  const levels = checkpoints.map((checkpoint) => checkpoint.assessment.level);
  const aboveLow = levels.filter((level) => level !== 'low' && level !== 'unknown').length;
  const noForecast = levels.filter((level) => level === 'unknown').length;
  const missing = noForecast > 0 ? `, ${noForecast} without a forecast` : '';
  return `${checkpoints.length} checkpoints, ${aboveLow} above Low${missing}.`;
}

/**
 * The assessment's reasons when a hazard raised the level or data is missing; otherwise
 * the readings behind a Low checkpoint.
 */
function conditions({ assessment }: CheckpointView): string[] {
  if (assessment.reasons.length > 0) return assessment.reasons;
  const { gust_mph, rain_in_hr, snow_in_hr } = assessment.weather;
  const lines = [`Gust ${formatReading(gust_mph, 'mph')}`];
  if (rain_in_hr) lines.push(`Rain ${formatReading(rain_in_hr, 'in/hr')}`);
  if (snow_in_hr) lines.push(`Snowfall ${formatReading(snow_in_hr, 'in/hr')}`);
  if (lines.length === 1) lines.push('No rain or snow');
  return lines;
}
