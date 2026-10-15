import { useId } from 'react';

import styles from './DepartureField.module.css';

interface DepartureFieldProps {
  /** "YYYY-MM-DDTHH:MM", local time at the starting place. */
  value: string;
  /** Days offered, starting today at the starting place. */
  days: number;
  today: string;
  /** Earliest time still allowed today, "HH:MM". */
  earliestToday: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy: string;
}

export function DepartureField({
  value,
  days,
  today,
  earliestToday,
  onChange,
  invalid,
  describedBy,
}: DepartureFieldProps) {
  const groupName = useId();
  const timeId = useId();
  const [date, time] = splitLocal(value);
  const options = dayOptions(today, days);

  return (
    <div className={styles.field}>
      <div
        className={styles.days}
        role="radiogroup"
        aria-label="Departure day"
        aria-describedby={describedBy}
      >
        {options.map((day, index) => (
          <label key={day.date} className={styles.day}>
            <input
              type="radio"
              name={groupName}
              value={day.date}
              checked={day.date === date}
              onChange={() => onChange(`${day.date}T${time}`)}
              className="visually-hidden"
              aria-label={day.spoken}
            />
            <span className={styles.weekday}>{index === 0 ? 'Today' : day.weekday}</span>
            <span className={styles.date}>{day.dayOfMonth}</span>
          </label>
        ))}
      </div>
      <div className={styles.time}>
        <label htmlFor={timeId}>Time</label>
        <select
          id={timeId}
          className={styles.slots}
          value={time}
          onChange={(event) => onChange(`${date}T${event.target.value}`)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
        >
          {timeSlots(date === today ? earliestToday : '00:00', time).map((slot) => (
            <option key={slot} value={slot}>
              {clockLabel(slot)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function splitLocal(value: string): [date: string, time: string] {
  const [date = '', time = ''] = value.split('T');
  return [date, time.slice(0, 5)];
}

interface DayOption {
  date: string;
  weekday: string;
  dayOfMonth: string;
  spoken: string;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const SPOKEN = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * Calendar days from ``today``, counted on the date alone so a daylight-saving change
 * cannot skip or repeat one.
 */
function dayOptions(today: string, days: number): DayOption[] {
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number);
  return Array.from({ length: days }, (_, offset) => {
    const moment = new Date(Date.UTC(year, month - 1, day + offset));
    return {
      date: moment.toISOString().slice(0, 10),
      weekday: WEEKDAY.format(moment),
      dayOfMonth: String(moment.getUTCDate()),
      spoken: SPOKEN.format(moment),
    };
  });
}

const SLOT_MINUTES = 15;

/**
 * Quarter-hour departures from ``earliest`` to midnight, which is as precise as an hourly
 * forecast can answer. ``chosen`` is kept even when it has just passed, so the control
 * always shows the time the driver picked.
 */
function timeSlots(earliest: string, chosen: string): string[] {
  const first = Math.ceil(minutesOf(earliest) / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: string[] = [];
  for (let minutes = first; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    slots.push(timeOf(minutes));
  }
  if (chosen && !slots.includes(chosen)) slots.unshift(chosen);
  return slots;
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeOf(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "06:30" reads as "6:30 AM", the way the rest of the app shows times. */
function clockLabel(time: string): string {
  const minutes = minutesOf(time);
  const hours = Math.floor(minutes / 60);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}
