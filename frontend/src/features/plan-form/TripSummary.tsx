import type { Ref } from 'react';

import {
  formatLoad,
  formatMiles,
  formatWallClock,
  shortPlaceName,
  zoneAbbreviation,
} from '../../lib/format';
import styles from './TripSummary.module.css';
import type { Trip } from './validation';

interface TripSummaryProps {
  trip: Trip;
  onEdit: () => void;
  now?: () => Date;
  /** Lets the page move focus here when the summary takes the form's place. */
  ref?: Ref<HTMLDivElement>;
}

/** The submitted trip in one line, so results get the room while the form is folded away. */
export function TripSummary({ trip, onEdit, now = () => new Date(), ref }: TripSummaryProps) {
  const zone = zoneAbbreviation(trip.origin.time_zone, now());
  return (
    <div ref={ref} className={styles.summary} role="group" aria-label="Trip summary" tabIndex={-1}>
      <p className={styles.places}>
        <strong>{shortPlaceName(trip.origin.name)}</strong> to{' '}
        <strong>{shortPlaceName(trip.destination.name)}</strong>
      </p>
      <p className={styles.details}>
        Departs {formatWallClock(trip.departureLocal)} {zone}. {formatLoad(trip.loadLb)} of cargo,
        weather every {formatMiles(trip.intervalMi)}.
      </p>
      <button type="button" className={styles.edit} onClick={onEdit}>
        Edit trip
      </button>
    </div>
  );
}
