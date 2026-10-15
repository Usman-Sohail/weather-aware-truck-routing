// Client-side checks that mirror the API's rules, so mistakes show up next to the field
// before a request is made. The API validates again and stays the authority.

import { wallClockInZone } from '../../lib/format';
import type { IntervalMi, PlaceCandidate } from '../../types/api';

export interface TripFormValues {
  origin: PlaceCandidate | null;
  destination: PlaceCandidate | null;
  /** "YYYY-MM-DDTHH:MM", local time at the origin. */
  departureLocal: string;
  loadLb: string;
  intervalMi: IntervalMi;
}

export interface Trip {
  origin: PlaceCandidate;
  destination: PlaceCandidate;
  departureLocal: string;
  loadLb: number;
  intervalMi: IntervalMi;
}

export type TripField = 'origin' | 'destination' | 'departure' | 'load' | 'interval';
export type TripErrors = Partial<Record<TripField, string>>;

export const MAX_LOAD_LB = 80_000;
const DEPARTURE_GRACE_MS = 15 * 60 * 1000;
const MAX_DEPARTURE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const SAME_PLACE_KM = 1;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Whole pounds, allowing thousands separators; null when not a whole number. */
export function parseLoad(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  return /^-?\d+$/.test(cleaned) ? Number(cleaned) : null;
}

export function validateTrip(
  values: TripFormValues,
  now: Date,
): { trip: Trip | null; errors: TripErrors } {
  const errors: TripErrors = {};
  const { origin, destination } = values;

  if (!origin) {
    errors.origin = 'Choose a starting place from the matches.';
  }
  if (!destination) {
    errors.destination = 'Choose a destination from the matches.';
  } else if (origin && distanceKm(origin, destination) < SAME_PLACE_KM) {
    errors.destination = 'Choose a destination different from the starting place.';
  }

  const departureError = checkDeparture(values.departureLocal, origin?.time_zone, now);
  if (departureError) {
    errors.departure = departureError;
  }

  const load = parseLoad(values.loadLb);
  if (values.loadLb.trim() === '') {
    errors.load = 'Enter the cargo weight in pounds.';
  } else if (load === null) {
    errors.load = 'Enter a whole number of pounds.';
  } else if (load < 0 || load > MAX_LOAD_LB) {
    errors.load = 'Enter a weight between 0 and 80,000 lb.';
  }

  if (Object.keys(errors).length > 0 || !origin || !destination || load === null) {
    return { trip: null, errors };
  }
  return {
    trip: {
      origin,
      destination,
      departureLocal: values.departureLocal,
      loadLb: load,
      intervalMi: values.intervalMi,
    },
    errors,
  };
}

function checkDeparture(
  departureLocal: string,
  timeZone: string | undefined,
  now: Date,
): string | null {
  if (!LOCAL_DATETIME.test(departureLocal)) {
    return 'Enter a departure date and time.';
  }
  // Wall-clock strings in the same zone and format compare correctly as text.
  const zone = timeZone ?? browserTimeZone();
  const earliest = wallClockInZone(new Date(now.getTime() - DEPARTURE_GRACE_MS), zone);
  const latest = wallClockInZone(new Date(now.getTime() + MAX_DEPARTURE_AHEAD_MS), zone);
  if (departureLocal < earliest) {
    return 'Choose a departure time from now on.';
  }
  if (departureLocal > latest) {
    return 'Choose a departure within the next 7 days.';
  }
  return null;
}

function distanceKm(a: PlaceCandidate, b: PlaceCandidate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const API_FIELD_PREFIXES: [string, TripField][] = [
  ['origin', 'origin'],
  ['destination', 'destination'],
  ['departure_local', 'departure'],
  ['load_lb', 'load'],
  ['interval_mi', 'interval'],
];

/** Map the API's per-field messages (e.g. "origin.lat") onto the form's fields. */
export function fieldErrorsFromApi(fields: Readonly<Record<string, string[]>>): {
  errors: TripErrors;
  formError: string | null;
} {
  const errors: TripErrors = {};
  let formError: string | null = null;
  for (const [key, messages] of Object.entries(fields)) {
    const message = messages[0];
    if (!message) continue;
    const match = API_FIELD_PREFIXES.find(
      ([prefix]) => key === prefix || key.startsWith(`${prefix}.`),
    );
    if (match) {
      errors[match[1]] ??= message;
    } else {
      formError ??= message;
    }
  }
  return { errors, formError };
}
