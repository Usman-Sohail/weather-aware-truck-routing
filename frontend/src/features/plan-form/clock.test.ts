import { describe, expect, it } from 'vitest';

import { clockLabel, parseClock, timeSlots } from './clock';

describe('parseClock', () => {
  it.each([
    ['6:30 pm', '18:30'],
    ['6:30PM', '18:30'],
    ['630pm', '18:30'],
    ['6 pm', '18:00'],
    ['6:30 a.m.', '06:30'],
    ['12:05 am', '00:05'],
    ['12 pm', '12:00'],
    ['18:30', '18:30'],
    ['1830', '18:30'],
    ['9', '09:00'],
    ['  7:45  ', '07:45'],
  ])('reads %s as %s', (typed, expected) => {
    expect(parseClock(typed)).toBe(expected);
  });

  it.each(['', 'noon', '25:00', '6:75 pm', '13 pm', '0 pm', 'half six'])('refuses %s', (typed) => {
    expect(parseClock(typed)).toBeNull();
  });
});

describe('clockLabel', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['06:05', '6:05 AM'],
    ['12:00', '12:00 PM'],
    ['18:30', '6:30 PM'],
    ['23:45', '11:45 PM'],
  ])('shows %s as %s', (time, expected) => {
    expect(clockLabel(time)).toBe(expected);
  });
});

describe('timeSlots', () => {
  it('offers every quarter hour from the earliest to the end of the day', () => {
    const slots = timeSlots('00:00', '00:00');

    expect(slots).toHaveLength(96);
    expect(slots.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
    expect(slots.at(-1)).toBe('23:45');
  });

  it('starts at the next quarter hour still to come today', () => {
    expect(timeSlots('14:20', '14:30').slice(0, 2)).toEqual(['14:30', '14:45']);
  });

  it('keeps the chosen time even once it has passed', () => {
    expect(timeSlots('14:20', '09:00')[0]).toBe('09:00');
  });
});
