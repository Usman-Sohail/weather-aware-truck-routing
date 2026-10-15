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

/** Weekday, time and zone abbreviation in ``timeZone``, e.g. "Fri, 8:00 AM MDT". */
export function formatClock(iso: string, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    });
    clockFormats.set(timeZone, format);
  }
  // Recent ICU versions put narrow no-break spaces around "AM"; plain spaces wrap better.
  return format.format(new Date(iso)).replace(/[\u202f\u00a0]/g, ' ');
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
