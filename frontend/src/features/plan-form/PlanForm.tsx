import { type FormEvent, useRef, useState } from 'react';

import type { ApiError } from '../../lib/api';
import { nextQuarterHour, wallClockInZone, zoneAbbreviation } from '../../lib/format';
import type { IntervalMi, PlaceCandidate } from '../../types/api';
import { DepartureField } from './DepartureField';
import { PlaceField, type PlaceFieldHandle, type PlaceSearch } from './PlaceField';
import styles from './PlanForm.module.css';
import {
  type Trip,
  type TripErrors,
  type TripField,
  type TripFormValues,
  browserTimeZone,
  fieldErrorsFromApi,
  validateTrip,
} from './validation';

const INTERVALS: IntervalMi[] = [10, 25, 50];
const FIELD_ORDER: TripField[] = ['origin', 'destination', 'departure', 'load', 'interval'];
const FOCUS_TARGET: Record<TripField, string> = {
  origin: 'origin',
  destination: 'destination',
  departure: 'departure',
  load: 'load',
  interval: 'interval-25',
};
// Today plus the seven days the API accepts.
const DEPARTURE_DAYS = 8;
// The API accepts a departure from 15 minutes ago.
const GRACE_MS = 15 * 60 * 1000;

interface PlanFormProps {
  onSubmit: (trip: Trip) => void;
  apiError: ApiError | null;
  now?: () => Date;
  search?: PlaceSearch;
}

export function PlanForm({ onSubmit, apiError, now = () => new Date(), search }: PlanFormProps) {
  const [values, setValues] = useState<TripFormValues>(() => ({
    origin: null,
    destination: null,
    departureLocal: wallClockInZone(nextQuarterHour(now()), browserTimeZone()),
    loadLb: '',
    intervalMi: 25,
  }));
  const originField = useRef<PlaceFieldHandle>(null);
  const destinationField = useRef<PlaceFieldHandle>(null);
  const [departureEdited, setDepartureEdited] = useState(false);
  const [clientErrors, setClientErrors] = useState<TripErrors>({});

  // API field messages stay until their field is edited or a newer error replaces them.
  const [apiErrorShown, setApiErrorShown] = useState(apiError);
  const [dismissed, setDismissed] = useState<ReadonlySet<TripField>>(new Set());
  if (apiError !== apiErrorShown) {
    setApiErrorShown(apiError);
    setDismissed(new Set());
  }
  const fromApi = apiError ? fieldErrorsFromApi(apiError.fields) : null;

  function errorFor(field: TripField): string | undefined {
    return clientErrors[field] ?? (dismissed.has(field) ? undefined : fromApi?.errors[field]);
  }

  function markEdited(field: TripField) {
    setClientErrors((previous) => ({ ...previous, [field]: undefined }));
    setDismissed((previous) => new Set(previous).add(field));
  }

  function setOrigin(place: PlaceCandidate | null) {
    markEdited('origin');
    setValues((previous) => ({
      ...previous,
      origin: place,
      // Until the driver picks a time, keep the default in the starting place's zone.
      departureLocal:
        place && !departureEdited
          ? wallClockInZone(nextQuarterHour(now()), place.time_zone)
          : previous.departureLocal,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A place typed but never looked up is resolved first, so the click is not wasted.
    const [origin, destination] = await Promise.all([
      originField.current?.resolve(),
      destinationField.current?.resolve(),
    ]);
    const submitted = {
      ...values,
      origin: origin ?? values.origin,
      destination: destination ?? values.destination,
    };
    const { trip, errors } = validateTrip(submitted, now());
    setClientErrors(errors);
    if (!trip) {
      const first = FIELD_ORDER.find((field) => errors[field]);
      if (first) document.getElementById(FOCUS_TARGET[first])?.focus();
      return;
    }
    onSubmit(trip);
  }

  const zone = values.origin?.time_zone ?? browserTimeZone();
  const departureHint = values.origin
    ? `Local time in ${values.origin.name.split(',')[0]} (${zoneAbbreviation(zone, now())}). Forecasts reach 7 days ahead.`
    : 'Local time at the starting place. Forecasts reach 7 days ahead.';
  const departureError = errorFor('departure');
  const loadError = errorFor('load');
  const intervalError = errorFor('interval');

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Trip">
      {fromApi?.formError && (
        <p role="alert" className={styles.formError}>
          {fromApi.formError}
        </p>
      )}

      <PlaceField
        ref={originField}
        id="origin"
        label="Starting place"
        value={values.origin}
        onChange={setOrigin}
        error={errorFor('origin')}
        search={search}
      />
      <PlaceField
        ref={destinationField}
        id="destination"
        label="Destination"
        value={values.destination}
        onChange={(place) => {
          markEdited('destination');
          setValues((previous) => ({ ...previous, destination: place }));
        }}
        error={errorFor('destination')}
        search={search}
      />

      <fieldset className={styles.field}>
        <legend className={styles.label}>Departure</legend>
        <p id="departure-hint" className={styles.hint}>
          {departureHint}
        </p>
        <DepartureField
          value={values.departureLocal}
          days={DEPARTURE_DAYS}
          today={wallClockInZone(now(), zone).slice(0, 10)}
          earliestToday={wallClockInZone(new Date(now().getTime() - GRACE_MS), zone).slice(11, 16)}
          onChange={(departureLocal) => {
            markEdited('departure');
            setDepartureEdited(true);
            setValues((previous) => ({ ...previous, departureLocal }));
          }}
          invalid={departureError !== undefined}
          describedBy={departureError ? 'departure-hint departure-error' : 'departure-hint'}
        />
        {departureError && (
          <p id="departure-error" className={styles.error}>
            {departureError}
          </p>
        )}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor="load" className={styles.label}>
          Cargo weight
        </label>
        <p id="load-hint" className={styles.hint}>
          Pounds of freight, up to 80,000
        </p>
        <div className={styles.suffixed}>
          <input
            id="load"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={styles.input}
            value={values.loadLb}
            onChange={(event) => {
              markEdited('load');
              const loadLb = event.target.value.replace(/[^\d,]/g, '');
              setValues((previous) => ({ ...previous, loadLb }));
            }}
            aria-invalid={loadError ? true : undefined}
            aria-describedby={loadError ? 'load-hint load-error' : 'load-hint'}
          />
          <span className={styles.suffix} aria-hidden="true">
            lb
          </span>
        </div>
        {loadError && (
          <p id="load-error" className={styles.error}>
            {loadError}
          </p>
        )}
      </div>

      <fieldset
        className={styles.intervals}
        aria-describedby={intervalError ? 'interval-error' : undefined}
      >
        <legend className={styles.label}>Check the weather every</legend>
        <div className={styles.segments}>
          {INTERVALS.map((interval) => (
            <label key={interval} className={styles.segment}>
              <input
                id={`interval-${interval}`}
                type="radio"
                name="interval"
                checked={values.intervalMi === interval}
                onChange={() => {
                  markEdited('interval');
                  setValues((previous) => ({ ...previous, intervalMi: interval }));
                }}
              />
              <span>{interval} mi</span>
            </label>
          ))}
        </div>
        {intervalError && (
          <p id="interval-error" className={styles.error}>
            {intervalError}
          </p>
        )}
      </fieldset>

      <button type="submit" className={styles.submit}>
        Compare routes
      </button>
    </form>
  );
}
