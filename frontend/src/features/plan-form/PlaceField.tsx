import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { ApiError, geocode, isAbortError } from '../../lib/api';
import type { PlaceCandidate } from '../../types/api';
import styles from './PlaceField.module.css';

export type PlaceSearch = (query: string, signal: AbortSignal) => Promise<PlaceCandidate[]>;

const searchPlaces: PlaceSearch = async (query, signal) =>
  (await geocode(query, signal)).candidates;

const MIN_QUERY_LENGTH = 3;

type Lookup =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; query: string; candidates: PlaceCandidate[] }
  | { status: 'failed'; message: string };

interface PlaceFieldProps {
  id: string;
  label: string;
  value: PlaceCandidate | null;
  onChange: (place: PlaceCandidate | null) => void;
  error?: string;
  search?: PlaceSearch;
}

/**
 * A place input that looks the text up when the field loses focus or on Enter (not on
 * every keystroke, to spare the geocoding quota). The best match is selected and shown;
 * when there are several, they stay listed so a wrong guess is easy to correct.
 */
export function PlaceField({
  id,
  label,
  value,
  onChange,
  error,
  search = searchPlaces,
}: PlaceFieldProps) {
  const [text, setText] = useState(value?.name ?? '');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  function choose(place: PlaceCandidate) {
    setText(place.name);
    onChange(place);
  }

  async function runSearch() {
    const query = text.trim();
    if (query.length < MIN_QUERY_LENGTH || query === value?.name) {
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLookup({ status: 'searching' });
    try {
      const candidates = await search(query, controller.signal);
      setLookup({ status: 'found', query, candidates });
      const best = candidates[0];
      if (best) {
        choose(best);
      }
    } catch (caught) {
      if (isAbortError(caught)) {
        return;
      }
      setLookup({
        status: 'failed',
        message:
          caught instanceof ApiError ? caught.message : 'The place search failed. Try again.',
      });
    }
  }

  function handleTextChange(next: string) {
    // A lookup still in flight answers for text that no longer exists.
    pending.current?.abort();
    setText(next);
    setLookup({ status: 'idle' });
    if (value) {
      onChange(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && text.trim() !== value?.name) {
      event.preventDefault();
      void runSearch();
    }
  }

  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const errorId = `${id}-error`;
  const describedBy = [hintId, statusId, error ? errorId : null].filter(Boolean).join(' ');
  const matches = lookup.status === 'found' && lookup.candidates.length > 1 ? lookup : null;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <p id={hintId} className={styles.hint}>
        City, address or place in the US or Canada
      </p>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        value={text}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={() => void runSearch()}
        onKeyDown={handleKeyDown}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-selected={value ? true : undefined}
      />
      <p id={statusId} role="status" className={styles.status}>
        {statusMessage(lookup)}
      </p>
      {matches && (
        <details className={styles.matches}>
          <summary className={styles.matchesSummary}>
            {matches.candidates.length - 1} other{' '}
            {matches.candidates.length === 2 ? 'match' : 'matches'} for “{matches.query}”
          </summary>
          <fieldset className={styles.matchesList}>
            <legend className="visually-hidden">Matches for “{matches.query}”</legend>
            {matches.candidates.map((candidate) => (
              <label key={`${candidate.lat},${candidate.lon}`} className={styles.match}>
                <input
                  type="radio"
                  name={`${id}-match`}
                  checked={value?.lat === candidate.lat && value.lon === candidate.lon}
                  onChange={() => choose(candidate)}
                />
                <span>{candidate.name}</span>
              </label>
            ))}
          </fieldset>
        </details>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function statusMessage(lookup: Lookup): string {
  switch (lookup.status) {
    case 'searching':
      return 'Searching…';
    case 'failed':
      return lookup.message;
    case 'found':
      return lookup.candidates.length === 0
        ? 'No matching place in the US or Canada. Try a city and state, like “Denver, CO”.'
        : '';
    case 'idle':
      return '';
  }
}
