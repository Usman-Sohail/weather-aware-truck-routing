import { describe, expect, it } from 'vitest';

import type { PlaceCandidate } from '../../types/api';
import { type TripFormValues, fieldErrorsFromApi, parseLoad, validateTrip } from './validation';

const DENVER: PlaceCandidate = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};
const CHICAGO: PlaceCandidate = {
  name: 'Chicago, IL, United States',
  lat: 41.88,
  lon: -87.63,
  country_code: 'US',
  time_zone: 'America/Chicago',
};
// 2026-10-15 12:00 in Denver (UTC-6).
const NOW = new Date('2026-10-15T18:00:00Z');

function values(overrides: Partial<TripFormValues> = {}): TripFormValues {
  return {
    origin: DENVER,
    destination: CHICAGO,
    departureLocal: '2026-10-16T08:00',
    loadLb: '42000',
    intervalMi: 25,
    ...overrides,
  };
}

describe('validateTrip', () => {
  it('accepts a complete trip and normalises it', () => {
    const result = validateTrip(values({ loadLb: ' 42,000 ' }), NOW);

    expect(result.errors).toEqual({});
    expect(result.trip).toEqual({
      origin: DENVER,
      destination: CHICAGO,
      departureLocal: '2026-10-16T08:00',
      loadLb: 42000,
      intervalMi: 25,
    });
  });

  it('requires both places to be chosen from the matches', () => {
    const result = validateTrip(values({ origin: null, destination: null }), NOW);

    expect(result.trip).toBeNull();
    expect(result.errors.origin).toBe('Choose a starting place from the matches.');
    expect(result.errors.destination).toBe('Choose a destination from the matches.');
  });

  it('rejects a destination at the starting place', () => {
    // About 0.7 km from the starting place.
    const nearby = { ...DENVER, name: 'Civic Center, Denver', lat: 39.745, lon: -104.995 };

    expect(validateTrip(values({ destination: nearby }), NOW).errors.destination).toBe(
      'Choose a destination different from the starting place.',
    );
  });

  it.each([
    ['', 'Enter a departure date and time.'],
    ['2026-10-15T11:44', 'Choose a departure time from now on.'],
    ['2026-10-22T12:01', 'Choose a departure within the next 7 days.'],
  ])('rejects departure %s', (departureLocal, message) => {
    expect(validateTrip(values({ departureLocal }), NOW).errors.departure).toBe(message);
  });

  it.each(['2026-10-15T11:46', '2026-10-22T12:00'])(
    'accepts departure %s at the edges of the window, read in the origin time zone',
    (departureLocal) => {
      expect(validateTrip(values({ departureLocal }), NOW).errors.departure).toBeUndefined();
    },
  );

  it.each([
    ['', 'Enter the cargo weight in pounds.'],
    ['4.5', 'Enter a whole number of pounds.'],
    ['heavy', 'Enter a whole number of pounds.'],
    ['-1', 'Enter a weight between 0 and 80,000 lb.'],
    ['80001', 'Enter a weight between 0 and 80,000 lb.'],
  ])('rejects load %s', (loadLb, message) => {
    expect(validateTrip(values({ loadLb }), NOW).errors.load).toBe(message);
  });

  it.each(['0', '80000', '30,000'])('accepts load %s', (loadLb) => {
    expect(validateTrip(values({ loadLb }), NOW).errors.load).toBeUndefined();
  });
});

describe('parseLoad', () => {
  it('reads whole pounds with optional thousands separators', () => {
    expect(parseLoad('42,000')).toBe(42000);
    expect(parseLoad(' 0 ')).toBe(0);
    expect(parseLoad('1e3')).toBeNull();
    expect(parseLoad('')).toBeNull();
  });
});

describe('fieldErrorsFromApi', () => {
  it('puts API field errors next to the matching form fields', () => {
    expect(
      fieldErrorsFromApi({
        'origin.non_field_errors': ['Choose a place in the United States or Canada.'],
        'destination.lat': ['Ensure this value is less than or equal to 90.'],
        departure_local: ['The departure must be within the next 7 days.'],
        load_lb: ['Ensure this value is less than or equal to 80000.'],
        interval_mi: ['"30" is not a valid choice.'],
        non_field_errors: ['Origin and destination must be different places.'],
      }),
    ).toEqual({
      errors: {
        origin: 'Choose a place in the United States or Canada.',
        destination: 'Ensure this value is less than or equal to 90.',
        departure: 'The departure must be within the next 7 days.',
        load: 'Ensure this value is less than or equal to 80000.',
        interval: '"30" is not a valid choice.',
      },
      formError: 'Origin and destination must be different places.',
    });
  });

  it('returns nothing for an empty error list', () => {
    expect(fieldErrorsFromApi({})).toEqual({ errors: {}, formError: null });
  });
});
