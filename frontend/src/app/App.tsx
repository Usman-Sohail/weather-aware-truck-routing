import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { PlanForm } from '../features/plan-form/PlanForm';
import { TripSummary } from '../features/plan-form/TripSummary';
import type { Trip } from '../features/plan-form/validation';
import { buildRouteViews } from '../features/results/model';
import { RecommendationCard } from '../features/results/RecommendationCard';
import { PlanStatus } from '../features/trip/PlanStatus';
import { usePlanTrip } from '../features/trip/usePlanTrip';
import styles from './App.module.css';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { useServiceStatus } from './useServiceStatus';

export function App() {
  const serviceStatus = useServiceStatus();
  const { state, submit } = usePlanTrip();
  const [editing, setEditing] = useState(true);
  const formArea = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  // The form folds into a summary while a plan runs or shows its results. It comes back
  // to edit the trip, and with the reason when planning fails.
  const showForm = editing || state.status === 'failed';
  const summaryTrip = showForm ? null : state.trip;

  const { plan, assessment } = state;
  const routes = useMemo(
    () => (plan && assessment ? buildRouteViews(plan, assessment) : null),
    [plan, assessment],
  );
  const recommended =
    routes?.find((route) => route.id === assessment?.recommendation.route_id) ?? null;

  // Focus follows the trip into the summary, so keyboard and screen reader users keep their place.
  useEffect(() => {
    if (summaryTrip) summary.current?.focus();
  }, [summaryTrip]);

  function planTrip(trip: Trip) {
    setEditing(false);
    void submit(trip);
  }

  function editTrip() {
    flushSync(() => setEditing(true));
    formArea.current?.querySelector('input')?.focus();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Weather-Aware Truck Routing</h1>
        <ServiceStatusBadge status={serviceStatus} />
      </header>
      <main className={styles.main}>
        <div className={styles.panel}>
          <section className={styles.section} aria-labelledby="plan-heading">
            <h2 id="plan-heading" className={styles.panelHeading}>
              Plan a trip
            </h2>
            <div ref={formArea} hidden={!showForm}>
              <PlanForm
                onSubmit={planTrip}
                apiError={state.status === 'failed' ? state.error : null}
              />
            </div>
            {summaryTrip && <TripSummary ref={summary} trip={summaryTrip} onEdit={editTrip} />}
            <PlanStatus state={state} />
          </section>
          {routes && assessment && (
            <section className={styles.section} aria-labelledby="results-heading">
              <h2 id="results-heading" className="visually-hidden">
                Results
              </h2>
              <RecommendationCard
                route={recommended}
                recommendation={assessment.recommendation}
                loadLb={assessment.load_lb}
              />
            </section>
          )}
        </div>
        <section className={styles.map} aria-label="Route map">
          <p className={styles.placeholder}>Map</p>
        </section>
      </main>
    </div>
  );
}
