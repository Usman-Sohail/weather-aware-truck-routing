import styles from './App.module.css';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { useServiceStatus } from './useServiceStatus';

export function App() {
  const serviceStatus = useServiceStatus();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Weather-Aware Truck Routing</h1>
        <ServiceStatusBadge status={serviceStatus} />
      </header>
      <main className={styles.main}>
        <section className={styles.panel} aria-label="Trip planner">
          <p className={styles.placeholder}>Trip planning form</p>
        </section>
        <section className={styles.map} aria-label="Route map">
          <p className={styles.placeholder}>Map</p>
        </section>
      </main>
    </div>
  );
}
