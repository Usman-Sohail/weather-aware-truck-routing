import { PlanForm } from '../features/plan-form/PlanForm';
import { PlanStatus } from '../features/trip/PlanStatus';
import { usePlanTrip } from '../features/trip/usePlanTrip';
import styles from './App.module.css';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { useServiceStatus } from './useServiceStatus';

export function App() {
  const serviceStatus = useServiceStatus();
  const { state, submit } = usePlanTrip();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Weather-Aware Truck Routing</h1>
        <ServiceStatusBadge status={serviceStatus} />
      </header>
      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="plan-heading">
          <h2 id="plan-heading" className={styles.panelHeading}>
            Plan a trip
          </h2>
          <PlanForm
            onSubmit={(trip) => void submit(trip)}
            apiError={state.status === 'failed' ? state.error : null}
          />
          <PlanStatus state={state} />
        </section>
        <section className={styles.map} aria-label="Route map">
          <p className={styles.placeholder}>Map</p>
        </section>
      </main>
    </div>
  );
}
