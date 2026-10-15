import { describe, expect, it } from 'vitest';

import { readable } from '../../test/text';
import { hourInfo, SLIDER_HOURS } from './forecastHours';

// Wednesday 8:15 PM in Denver (MDT, UTC-6).
const DEPARTURE = '2026-10-15T02:15:00Z';

describe('hourInfo', () => {
  it('describes the departure itself at hour 0', () => {
    expect(hourInfo(DEPARTURE, 'America/Denver', 0)).toEqual({
      k: 0,
      instantUtc: '2026-10-15T02:15:00Z',
      offsetLabel: 'Departure',
      clock: 'Wed, 8:15 PM MDT',
      forecastHourUtc: '2026-10-15T03:00:00Z',
      forecastLabel: 'Forecast for 8 PM to 9 PM',
      spokenLabel: 'Departure, Wednesday 8:15 PM MDT, forecast for 8 PM to 9 PM',
    });
  });

  it('counts whole hours after departure and keeps the hour unit with its number', () => {
    const info = hourInfo(DEPARTURE, 'America/Denver', 6);

    expect(info.instantUtc).toBe('2026-10-15T08:15:00Z');
    expect(info.offsetLabel).toBe('Departure +\u00a06\u00a0h');
    expect(info.clock).toBe('Thu, 2:15 AM MDT');
    expect(info.forecastLabel).toBe('Forecast for 2 AM to 3 AM');
    expect(info.spokenLabel).toBe(
      'Departure plus 6 hours, Thursday 2:15 AM MDT, forecast for 2 AM to 3 AM',
    );
  });

  it('says hour, not hours, one hour after departure', () => {
    const info = hourInfo(DEPARTURE, 'America/Denver', 1);

    expect(readable(info.offsetLabel)).toBe('Departure + 1 h');
    expect(info.spokenLabel).toMatch(/^Departure plus 1 hour, /);
  });

  it('reaches two days after departure at the end of the slider', () => {
    const info = hourInfo(DEPARTURE, 'America/Denver', SLIDER_HOURS);

    expect(SLIDER_HOURS).toBe(48);
    expect(info.instantUtc).toBe('2026-10-17T02:15:00Z');
    expect(info.clock).toBe('Fri, 8:15 PM MDT');
  });

  it('uses the forecast for the UTC hour the moment falls in, on the hour or past it', () => {
    const onTheHour = hourInfo('2026-10-15T14:00:00Z', 'UTC', 0);
    const twentyPast = hourInfo('2026-10-15T08:20:00Z', 'UTC', 6);

    expect(twentyPast.instantUtc).toBe('2026-10-15T14:20:00Z');
    for (const info of [onTheHour, twentyPast]) {
      // Records are labelled at the end of the hour they cover, as the API labels them.
      expect(info.forecastHourUtc).toBe('2026-10-15T15:00:00Z');
      expect(info.forecastLabel).toBe('Forecast for 2 PM to 3 PM');
    }
  });

  it('shows the half-hour boundaries of the forecast hour in a half-hour zone', () => {
    // St. John's is UTC-2:30 in October; 14:20 UTC is 11:50 AM there.
    const info = hourInfo('2026-10-15T14:20:00Z', 'America/St_Johns', 0);

    expect(info.clock).toMatch(/^Thu, 11:50 AM /);
    expect(info.forecastLabel).toBe('Forecast for 11:30 AM to 12:30 PM');
    expect(info.spokenLabel).toMatch(/, forecast for 11:30 AM to 12:30 PM$/);
  });

  it('follows the clock change on a trip that crosses the end of daylight saving time', () => {
    // Saturday 10:15 PM MDT; Denver falls back to MST at 2 AM on Sunday, November 1.
    const departure = '2026-11-01T04:15:00Z';

    expect(hourInfo(departure, 'America/Denver', 0).clock).toBe('Sat, 10:15 PM MDT');
    const after = hourInfo(departure, 'America/Denver', 6);
    expect(after.clock).toBe('Sun, 3:15 AM MST');
    expect(after.forecastLabel).toBe('Forecast for 3 AM to 4 AM');
    expect(after.spokenLabel).toBe(
      'Departure plus 6 hours, Sunday 3:15 AM MST, forecast for 3 AM to 4 AM',
    );
  });

  it('names both zones when the forecast hour spans the clock change', () => {
    // 1:15 AM MDT; the hour from 1 AM MDT ends at 1 AM MST, when the clocks go back.
    const info = hourInfo('2026-11-01T04:15:00Z', 'America/Denver', 3);

    expect(info.clock).toBe('Sun, 1:15 AM MDT');
    expect(info.forecastLabel).toBe('Forecast for 1 AM MDT to 1 AM MST');
  });
});
