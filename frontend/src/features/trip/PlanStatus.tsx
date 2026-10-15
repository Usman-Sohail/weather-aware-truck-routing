import { useEffect, useRef } from 'react';

import styles from './PlanStatus.module.css';
import type { PlanState, PlanStep } from './usePlanTrip';

const STEPS: { step: PlanStep; label: string }[] = [
  { step: 'routing', label: 'Finding truck routes' },
  { step: 'forecast', label: 'Getting the forecast along each route' },
  { step: 'assessing', label: 'Assessing weather risk' },
];

const SPOKEN_PROGRESS = { done: ' (done)', current: ' (in progress)', waiting: '' };

/** Progress of a running plan, why it failed, or notices about a finished one. */
export function PlanStatus({ state }: { state: PlanState }) {
  const failure = useRef<HTMLParagraphElement>(null);

  // Like an error summary, the reason takes focus so it is read first and Tab continues from it.
  useEffect(() => {
    if (state.error) failure.current?.focus();
  }, [state.error]);

  if (state.status === 'working' && state.step) {
    const current = STEPS.findIndex(({ step }) => step === state.step);
    return (
      <div role="status" className={styles.status}>
        <ol className={styles.steps}>
          {STEPS.map(({ step, label }, index) => {
            const progress = index < current ? 'done' : index === current ? 'current' : 'waiting';
            return (
              <li
                key={step}
                className={styles.step}
                data-state={progress}
                aria-current={progress === 'current' ? 'step' : undefined}
              >
                <span className={styles.marker} aria-hidden="true">
                  {progress === 'done' && <CheckMark />}
                  {progress === 'waiting' && index + 1}
                </span>
                {label}
                {SPOKEN_PROGRESS[progress] && (
                  <span className="visually-hidden">{SPOKEN_PROGRESS[progress]}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  if (state.status === 'failed' && state.error) {
    const message =
      state.error.code === 'VALIDATION_ERROR'
        ? 'Check the highlighted fields.'
        : state.error.message;
    return (
      <p ref={failure} role="alert" tabIndex={-1} className={styles.failure}>
        {message}
      </p>
    );
  }

  if (state.status === 'done' && state.plan && state.plan.notices.length > 0) {
    return (
      <ul className={styles.notices}>
        {state.plan.notices.map((notice) => (
          <li key={notice.code}>{notice.message}</li>
        ))}
      </ul>
    );
  }

  return null;
}

function CheckMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M2.5 6.5 5 9l4.5-6" />
    </svg>
  );
}
