import { formatClock } from '../../lib/format';

export const SLIDER_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const NBSP = '\u00a0';

export interface HourInfo {
  k: number;
  instantUtc: string;
  offsetLabel: string;
  clock: string;
  /**
   * The hourly record's UTC label, as in `CheckpointAssessment.forecast_hour_utc`. Records
   * are labelled at the end of the hour they cover, so this is where `forecastLabel` ends.
   */
  forecastHourUtc: string;
  forecastLabel: string;
  /** The same in words, for `aria-valuetext`. */
  spokenLabel: string;
}

/**
 * The moment departure + k hours, and the forecast shown for it: the one covering the UTC
 * hour that moment falls in, the rule the backend uses for checkpoints and heatmap frames.
 */
export function hourInfo(departureUtc: string, timeZone: string, k: number): HourInfo {
  const instant = Date.parse(departureUtc) + k * HOUR_MS;
  const hourStart = Math.floor(instant / HOUR_MS) * HOUR_MS;
  const hourEnd = hourStart + HOUR_MS;
  const instantUtc = isoUtc(instant);
  const forecastHours = hourSpan(hourStart, hourEnd, timeZone);
  return {
    k,
    instantUtc,
    offsetLabel: k === 0 ? 'Departure' : `Departure +${NBSP}${k}${NBSP}h`,
    clock: formatClock(instantUtc, timeZone),
    forecastHourUtc: isoUtc(hourEnd),
    forecastLabel: `Forecast for ${forecastHours}`,
    spokenLabel: `${spokenOffset(k)}, ${spokenClock(instant, timeZone)}, forecast for ${forecastHours}`,
  };
}

/** Seconds precision with a Z, the form the API uses. */
function isoUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

function spokenOffset(k: number): string {
  if (k === 0) return 'Departure';
  return `Departure plus ${k} ${k === 1 ? 'hour' : 'hours'}`;
}

interface WallClock {
  weekday: string;
  hour: string;
  minute: string;
  dayPeriod: string;
  zone: string;
}

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();

// Read from parts, as in lib/format, so the punctuation does not depend on the ICU version.
function wallClock(ms: number, timeZone: string): WallClock {
  let format = wallClockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    wallClockFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return {
    weekday: part('weekday'),
    hour: part('hour'),
    minute: part('minute'),
    dayPeriod: part('dayPeriod'),
    zone: part('timeZoneName'),
  };
}

function spokenClock(ms: number, timeZone: string): string {
  const { weekday, hour, minute, dayPeriod, zone } = wallClock(ms, timeZone);
  return `${weekday} ${hour}:${minute} ${dayPeriod} ${zone}`;
}

/** "2 AM", with minutes only in zones whose offset is not whole hours: "11:30 AM". */
function hourText({ hour, minute, dayPeriod }: WallClock): string {
  return minute === '00' ? `${hour} ${dayPeriod}` : `${hour}:${minute} ${dayPeriod}`;
}

/** "2 AM to 3 AM"; across a clock change both zones are named, as "1 AM to 1 AM" would mislead. */
function hourSpan(startMs: number, endMs: number, timeZone: string): string {
  const start = wallClock(startMs, timeZone);
  const end = wallClock(endMs, timeZone);
  return start.zone === end.zone
    ? `${hourText(start)} to ${hourText(end)}`
    : `${hourText(start)} ${start.zone} to ${hourText(end)} ${end.zone}`;
}
