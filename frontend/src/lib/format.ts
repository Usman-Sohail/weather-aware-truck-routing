// Formatting for distances, durations, readings and times. Times are always shown in a
// named zone (usually the origin's), never in the browser's zone by accident.

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatMiles(miles: number): string {
  return `${(miles >= 10 ? wholeNumber : oneDecimal).format(miles)} mi`;
}

/** Same wording as the backend's recommendation explanations, e.g. "13 h 54 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}

export function formatLoad(pounds: number): string {
  return `${wholeNumber.format(pounds)} lb`;
}

/** A forecast reading exactly as provided, so a value never appears rounded across a threshold. */
export function formatReading(value: number | null, unit: 'mph' | 'in/hr'): string {
  return value === null ? 'No data' : `${value} ${unit}`;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * "Fri, 8:00 AM" (plus the zone name when asked), assembled from parts so the punctuation
 * does not depend on the ICU version's patterns.
 */
function formatWeekdayTime(date: Date, timeZone: string, withZone: boolean): string {
  const key = `${timeZone}|${withZone}`;
  let format = clockFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      ...(withZone ? { timeZoneName: 'short' } : {}),
    });
    clockFormats.set(key, format);
  }
  const parts = format.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const text = `${part('weekday')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
  return withZone ? `${text} ${part('timeZoneName')}` : text;
}

/** Weekday, time and zone abbreviation in ``timeZone``, e.g. "Fri, 8:00 AM MDT". */
export function formatClock(iso: string, timeZone: string): string {
  return formatWeekdayTime(new Date(iso), timeZone, true);
}

/** The wall-clock time in ``timeZone`` as "YYYY-MM-DDTHH:MM", the departure input's format. */
export function wallClockInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;

export function nextQuarterHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS + QUARTER_HOUR_MS);
}

/** The zone's short name at ``date``, e.g. "MDT" or "MST" for America/Denver. */
export function zoneAbbreviation(timeZone: string, date: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((candidate) => candidate.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** A "YYYY-MM-DDTHH:MM" wall-clock value as "Wed, 6:45 PM", without shifting zones. */
export function formatWallClock(local: string): string {
  const [date = '', time = ''] = local.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asUtc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0));
  return formatWeekdayTime(asUtc, 'UTC', false);
}
