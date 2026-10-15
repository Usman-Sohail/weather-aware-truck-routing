import { describe, expect, it } from 'vitest';

import {
  formatClock,
  formatDuration,
  formatLoad,
  formatMiles,
  formatReading,
  formatWallClock,
  nextQuarterHour,
  wallClockInZone,
  zoneAbbreviation,
} from './format';

/** ``text`` with non-breaking spaces, which keep a number and its unit on one line. */
const together = (text: string) => text.replaceAll(' ', '\u00a0');

describe('formatMiles', () => {
  it('rounds to whole miles with separators, keeping a decimal for short distances', () => {
    expect(formatMiles(1005.4)).toBe(together('1,005 mi'));
    expect(formatMiles(25)).toBe(together('25 mi'));
    expect(formatMiles(6.25)).toBe(together('6.3 mi'));
    expect(formatMiles(0)).toBe(together('0 mi'));
  });
});

describe('formatDuration', () => {
  it('matches the wording used in recommendation explanations', () => {
    expect(formatDuration(834)).toBe(together('13 h 54 min'));
    expect(formatDuration(60)).toBe(together('1 h 00 min'));
    expect(formatDuration(45)).toBe(together('45 min'));
    expect(formatDuration(0)).toBe(together('0 min'));
  });
});

describe('formatClock', () => {
  it('shows the weekday, time and zone abbreviation in the given zone', () => {
    expect(formatClock('2026-10-16T14:00:00Z', 'America/Denver')).toBe('Fri, 8:00 AM MDT');
    expect(formatClock('2026-11-02T14:00:00Z', 'America/Denver')).toBe('Mon, 7:00 AM MST');
    expect(formatClock('2026-10-16T14:00:00Z', 'America/Chicago')).toBe('Fri, 9:00 AM CDT');
  });

  it('leaves the zone out when a heading already names it', () => {
    expect(formatClock('2026-10-16T14:00:00Z', 'America/Denver', false)).toBe('Fri, 8:00 AM');
  });
});

describe('formatLoad and formatReading', () => {
  it('formats cargo weight in pounds', () => {
    expect(formatLoad(42000)).toBe(together('42,000 lb'));
  });

  it('formats readings with units and says when data is missing', () => {
    expect(formatReading(47.2, 'mph')).toBe(together('47.2 mph'));
    expect(formatReading(0.031, 'in/hr')).toBe(together('0.031 in/hr'));
    expect(formatReading(null, 'mph')).toBe('No data');
  });
});

describe('units', () => {
  it('never wrap away from their numbers in a narrow column', () => {
    const texts = [
      formatMiles(1331),
      formatDuration(1151),
      formatLoad(42000),
      formatReading(0.016, 'in/hr'),
    ];
    for (const text of texts) {
      expect(text).not.toContain(' ');
    }
  });
});

describe('wallClockInZone', () => {
  it('gives the local date and time in the form the departure input uses', () => {
    const instant = new Date('2026-10-16T14:05:00Z');

    expect(wallClockInZone(instant, 'America/Denver')).toBe('2026-10-16T08:05');
    expect(wallClockInZone(instant, 'Asia/Karachi')).toBe('2026-10-16T19:05');
    expect(wallClockInZone(new Date('2026-10-17T03:30:00Z'), 'America/Los_Angeles')).toBe(
      '2026-10-16T20:30',
    );
  });
});

describe('nextQuarterHour', () => {
  it('rounds up to the next quarter hour, strictly after the given time', () => {
    expect(nextQuarterHour(new Date('2026-10-16T08:07:30Z')).toISOString()).toBe(
      '2026-10-16T08:15:00.000Z',
    );
    expect(nextQuarterHour(new Date('2026-10-16T08:00:00Z')).toISOString()).toBe(
      '2026-10-16T08:15:00.000Z',
    );
    expect(nextQuarterHour(new Date('2026-10-16T23:50:00Z')).toISOString()).toBe(
      '2026-10-17T00:00:00.000Z',
    );
  });
});

describe('zoneAbbreviation', () => {
  it('names the zone as it applies on the given date', () => {
    expect(zoneAbbreviation('America/Denver', new Date('2026-10-16T14:00:00Z'))).toBe('MDT');
    expect(zoneAbbreviation('America/Denver', new Date('2026-12-16T14:00:00Z'))).toBe('MST');
    expect(zoneAbbreviation('America/Phoenix', new Date('2026-07-16T14:00:00Z'))).toBe('MST');
  });
});

describe('formatWallClock', () => {
  it('formats the entered local time as written, whatever the browser zone', () => {
    expect(formatWallClock('2026-10-14T18:45')).toBe('Wed, 6:45 PM');
    expect(formatWallClock('2026-11-01T01:30')).toBe('Sun, 1:30 AM');
  });
});
