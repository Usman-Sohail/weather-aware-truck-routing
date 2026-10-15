import styles from './PlanStatus.module.css';
import type { PlanState, PlanStep } from './usePlanTrip';

const STEPS: { step: PlanStep; label: string }[] = [
  { step: 'routing', label: 'Finding truck routes' },
  { step: 'forecast', label: 'Getting the forecast along each route' },
  { step: 'assessing', label: 'Assessing weather risk' },
];

/** Progress of a running plan, why it failed, or notices about a finished one. */
export function PlanStatus({ state }: { state: PlanState }) {
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
                {label}
                {progress === 'done' && <span className="visually-hidden"> (done)</span>}
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
      <p role="alert" className={styles.failure}>
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
