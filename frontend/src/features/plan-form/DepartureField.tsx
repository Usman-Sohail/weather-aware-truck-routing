import { useId, useState } from 'react';

import { clockLabel, parseClock, timeSlots } from './clock';
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
  const slotsId = useId();
  const [date, time] = splitLocal(value);
  const options = dayOptions(today, days);
  // What the driver is typing, until it parses or the field is left.
  const [typing, setTyping] = useState<{ text: string; at: string } | null>(null);
  const shown = typing?.at === time ? typing.text : clockLabel(time);

  function handleTime(text: string) {
    const parsed = parseClock(text);
    setTyping({ text, at: parsed ?? time });
    if (parsed) onChange(`${date}T${parsed}`);
  }

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
        <input
          id={timeId}
          type="text"
          list={slotsId}
          autoComplete="off"
          className={styles.slot}
          value={shown}
          onChange={(event) => handleTime(event.target.value)}
          onBlur={() => setTyping(null)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
        />
        <datalist id={slotsId}>
          {timeSlots(date === today ? earliestToday : '00:00', time).map((slot) => (
            <option key={slot} value={clockLabel(slot)} />
          ))}
        </datalist>
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
