import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { CheckpointRequest } from '../features/map/CheckpointLayer';
import { PlanForm } from '../features/plan-form/PlanForm';
import { TripSummary } from '../features/plan-form/TripSummary';
import type { Trip } from '../features/plan-form/validation';
import { CheckpointTable } from '../features/results/CheckpointTable';
import { RecommendationCard } from '../features/results/RecommendationCard';
import { RouteComparison } from '../features/results/RouteComparison';
import { useResults } from '../features/results/useResults';
import { PlanStatus } from '../features/trip/PlanStatus';
import { usePlanTrip } from '../features/trip/usePlanTrip';
import styles from './App.module.css';
import { DataCredits } from './DataCredits';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { useServiceStatus } from './useServiceStatus';

// MapLibre is most of the bundle, so the trip panel shows before the map has downloaded.
const MapPanel = lazy(() =>
  import('../features/map/MapPanel').then((module) => ({ default: module.MapPanel })),
);

export function App() {
  const serviceStatus = useServiceStatus();
  const { state, submit } = usePlanTrip();
  const results = useResults(state.plan, state.assessment);
  const [editing, setEditing] = useState(true);
  const [checkpointRequest, setCheckpointRequest] = useState<CheckpointRequest | null>(null);
  const formArea = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  // The form folds into a summary while a plan runs or shows its results. It comes back
  // to edit the trip, and with the reason when planning fails.
  const showForm = editing || state.status === 'failed';
  const summaryTrip = showForm ? null : state.trip;

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
          {results && (
            <section className={styles.section} aria-labelledby="results-heading">
              <h2 id="results-heading" className="visually-hidden">
                Results
              </h2>
              <RecommendationCard
                route={results.recommended}
                recommendation={results.assessment.recommendation}
                loadLb={results.assessment.load_lb}
              />
              <RouteComparison
                routes={results.routes}
                recommendation={results.assessment.recommendation}
                selectedId={results.selected?.id ?? null}
                onSelect={results.select}
              />
              {results.selected && (
                <CheckpointTable
                  route={results.selected}
                  timeZone={results.plan.departure.time_zone}
                  onShowOnMap={(checkpointId, returnFocus) =>
                    setCheckpointRequest({ checkpointId, returnFocus })
                  }
                />
              )}
            </section>
          )}
          <DataCredits />
        </div>
        <section className={styles.map} aria-label="Route map">
          <Suspense fallback={<p className={styles.mapLoading}>Loading the map…</p>}>
            <MapPanel results={results} checkpointRequest={checkpointRequest} />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
