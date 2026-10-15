import { useId } from 'react';

import { RiskBadge } from '../../components/RiskBadge';
import { formatClock, formatReading } from '../../lib/format';
import type { RiskKey } from '../../types/api';
import type { CheckpointView } from '../results/model';
import styles from './CheckpointPopup.module.css';

interface CheckpointPopupProps {
  checkpoint: CheckpointView;
  routeId: string;
  timeZone: string;
}

interface Reading {
  name?: string;
  value: number | null;
  unit: 'mph' | 'in/hr';
}

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const NBSP = ' ';
const HOUR_MS = 3_600_000;

export function CheckpointPopup({ checkpoint, routeId, timeZone }: CheckpointPopupProps) {
  const headingId = useId();
  const { assessment } = checkpoint;
  const { weather, levels } = assessment;
  const hazards: { name: string; level: RiskKey; readings: Reading[] }[] = [
    {
      name: 'Wind',
      level: levels.wind,
      readings: [
        { name: 'Gust', value: weather.gust_mph, unit: 'mph' },
        { name: 'Sustained', value: weather.wind_mph, unit: 'mph' },
      ],
    },
    { name: 'Rain', level: levels.rain, readings: [{ value: weather.rain_in_hr, unit: 'in/hr' }] },
    {
      name: 'Snowfall',
      level: levels.snow,
      readings: [{ value: weather.snow_in_hr, unit: 'in/hr' }],
    },
  ];

  return (
    <section className={styles.popup} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.heading}>
          Route {routeId}, mile {wholeNumber.format(checkpoint.mile)}
        </h3>
        <p className={styles.arrival}>Arrives {formatClock(checkpoint.eta_utc, timeZone)}</p>
        <p className={styles.note}>
          {forecastText(assessment.forecast_hour_utc, assessment.lead_hours, timeZone)}
        </p>
      </div>

      <div className={styles.verdict}>
        <RiskBadge level={assessment.level} />
        {assessment.reasons.length > 0 && (
          <ul className={styles.reasons}>
            {assessment.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {!assessment.complete && <p className={styles.note}>{incompleteText(assessment.level)}</p>}
      </div>

      <dl className={styles.hazards}>
        {hazards.map(({ name, level, readings }) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd className={styles.readings}>
              {readings.map((reading) => (
                <span
                  key={reading.name ?? name}
                  className={reading.value === null ? styles.missing : undefined}
                >
                  {reading.name && `${reading.name} `}
                  {formatReading(reading.value, reading.unit)}
                </span>
              ))}
            </dd>
            <dd>
              <RiskBadge level={level} size="small" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// A forecast record is labelled with the end of the hour it covers.
function forecastText(forecastHourUtc: string, leadHours: number, timeZone: string): string {
  const end = new Date(forecastHourUtc);
  const start = new Date(end.getTime() - HOUR_MS);
  const ahead =
    leadHours === 0
      ? 'less than an hour ahead'
      : `${leadHours}${NBSP}${leadHours === 1 ? 'hour' : 'hours'} ahead`;
  return `Forecast for ${formatHour(start, timeZone)} to ${formatHour(end, timeZone)}, ${ahead}.`;
}

// Minutes appear only in zones offset by part of an hour, such as India's.
function formatHour(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const minute = part('minute');
  return `${part('hour')}${minute === '00' ? '' : `:${minute}`}${NBSP}${part('dayPeriod')}`;
}

function incompleteText(level: RiskKey): string {
  return level === 'unknown'
    ? 'The forecast is missing the readings needed to assess this checkpoint.'
    : 'Some readings are missing, so the risk may be higher than shown.';
}
