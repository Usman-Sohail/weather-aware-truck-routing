import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { clockLabel, parseClock } from './clock';
import styles from './TimeField.module.css';

interface TimeFieldProps {
  /** "HH:MM" in the trip's zone. */
  value: string;
  slots: string[];
  onChange: (time: string) => void;
  invalid: boolean;
  describedBy: string;
}

export function TimeField({ value, slots, onChange, invalid, describedBy }: TimeFieldProps) {
  const fieldId = useId();
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState<{ text: string; at: string } | null>(null);
  const [active, setActive] = useState(0);
  const shown = typing?.at === value ? typing.text : clockLabel(value);

  // Keeps the highlighted time in view, whether the list just opened or a key moved it.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function openList() {
    setActive(Math.max(slots.indexOf(value), 0));
    setOpen(true);
  }

  function choose(slot: string) {
    setTyping(null);
    setOpen(false);
    onChange(slot);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const slot = slots[active];
      if (slot) choose(slot);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!open) {
      openList();
      return;
    }
    const next = active + (event.key === 'ArrowDown' ? 1 : -1);
    setActive(Math.min(Math.max(next, 0), slots.length - 1));
  }

  return (
    <div
      className={styles.field}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setTyping(null);
          setOpen(false);
        }
      }}
    >
      <label htmlFor={fieldId}>Time</label>
      <div className={styles.control}>
        <input
          id={fieldId}
          type="text"
          role="combobox"
          autoComplete="off"
          className={styles.input}
          value={shown}
          onChange={(event) => {
            const parsed = parseClock(event.target.value);
            setTyping({ text: event.target.value, at: parsed ?? value });
            if (parsed) onChange(parsed);
          }}
          onClick={openList}
          onKeyDown={handleKeyDown}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className={styles.toggle}
          tabIndex={-1}
          aria-label="Show departure times"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => (open ? setOpen(false) : openList())}
        >
          <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true" focusable="false">
            <path d="M1 1.5 5 5.5 9 1.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </button>
        <ul id={listId} ref={list} role="listbox" aria-label="Departure time" hidden={!open}>
          {slots.map((slot, index) => (
            <li
              key={slot}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={slot === value}
              data-active={index === active || undefined}
              // Chosen before the input loses focus, so the list is not closed first.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(slot);
              }}
            >
              {clockLabel(slot)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
