import { useId } from 'react';

import { timeSlots } from './clock';
import styles from './DepartureField.module.css';
import { TimeField } from './TimeField';

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
  const [date, time] = splitLocal(value);
  const options = dayOptions(today, days);

  return (
    <div className={styles.field}>
      <div role="radiogroup" aria-label="Departure day" aria-describedby={describedBy}>
        {byMonth(options).map((group) => (
          <div key={group.label} className={styles.month}>
            <p className={styles.monthName}>{group.label}</p>
            <div className={styles.days}>
              {group.days.map((day) => (
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
                  <span className={styles.weekday}>
                    {day.date === options[0]?.date ? 'Today' : day.weekday}
                  </span>
                  <span className={styles.date}>{day.dayOfMonth}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <TimeField
        value={time}
        slots={timeSlots(date === today ? earliestToday : '00:00', time)}
        onChange={(slot) => onChange(`${date}T${slot}`)}
        invalid={invalid}
        describedBy={describedBy}
      />
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
  /** "October 2026". */
  monthLabel: string;
  spoken: string;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
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
      monthLabel: `${MONTH.format(moment)} ${moment.getUTCFullYear()}`,
      spoken: SPOKEN.format(moment),
    };
  });
}

/** The days in runs of one month, so a window spanning two never reads as one. */
function byMonth(days: DayOption[]): { label: string; days: DayOption[] }[] {
  const groups: { label: string; days: DayOption[] }[] = [];
  for (const day of days) {
    const current = groups.at(-1);
    if (current?.label === day.monthLabel) current.days.push(day);
    else groups.push({ label: day.monthLabel, days: [day] });
  }
  return groups;
}
