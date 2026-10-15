import { type KeyboardEvent, useId } from 'react';

import { hourInfo, SLIDER_HOURS } from './forecastHours';
import styles from './ForecastSlider.module.css';

interface ForecastSliderProps {
  /** Pass each reported hour straight back; coalesce the map's redraws, not this value. */
  hour: number;
  onChange: (hour: number) => void;
  departureUtc: string;
  timeZone: string;
  maxHour?: number;
}

const TICK_EVERY_HOURS = 12;

// The slider handles its keys itself so each steps the same in every browser (native Page
// Up and Page Down move a tenth of the range). Home and End are clamped to either end.
const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -6,
  PageUp: 6,
  Home: -Infinity,
  End: Infinity,
};

export function ForecastSlider({
  hour,
  onChange,
  departureUtc,
  timeZone,
  maxHour = SLIDER_HOURS,
}: ForecastSliderProps) {
  const inputId = useId();
  const value = clampHour(hour, maxHour);
  const info = hourInfo(departureUtc, timeZone, value);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = KEY_STEPS[event.key];
    // Leave shortcuts such as Alt+Left (back) to the browser.
    if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = clampHour(value + step, maxHour);
    if (next !== value) onChange(next);
  }

  return (
    <div className={styles.slider}>
      <div className={styles.heading}>
        <label htmlFor={inputId} className={styles.label}>
          Forecast hour
        </label>
        <span className={styles.offset}>{info.offsetLabel}</span>
      </div>
      <p className={styles.clock}>{info.clock}</p>
      <p className={styles.forecast}>{info.forecastLabel}</p>
      <input
        id={inputId}
        type="range"
        className={styles.range}
        min={0}
        max={maxHour}
        step={1}
        value={value}
        aria-valuetext={info.spokenLabel}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.scale} aria-hidden="true">
        {tickHours(maxHour).map((tick) => (
          <span
            key={tick}
            className={styles.tick}
            data-tick={tick}
            style={{ left: `${maxHour > 0 ? (tick / maxHour) * 100 : 0}%` }}
          >
            {tick}&nbsp;h
          </span>
        ))}
      </div>
    </div>
  );
}

function clampHour(hour: number, maxHour: number): number {
  return Math.min(Math.max(hour, 0), maxHour);
}

function tickHours(maxHour: number): number[] {
  return Array.from(
    { length: Math.floor(maxHour / TICK_EVERY_HOURS) + 1 },
    (_, index) => index * TICK_EVERY_HOURS,
  );
}
