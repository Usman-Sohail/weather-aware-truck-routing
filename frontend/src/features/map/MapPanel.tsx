import type { Results } from '../results/useResults';
import styles from './MapPanel.module.css';
import type { MapRoute } from './routeLayers';
import { TripMap } from './TripMap';

const NO_ROUTES: readonly MapRoute[] = [];

export function MapPanel({ results }: { results: Results | null }) {
  return (
    <div className={styles.panel}>
      <TripMap
        routes={results?.plan.routes ?? NO_ROUTES}
        planKey={results?.plan.plan_token ?? null}
        selectedRouteId={results?.selected?.id ?? null}
        onSelectRoute={results?.select ?? (() => {})}
      />
      <div className={styles.overlay}>
        {!results && <p className={styles.note}>Routes appear here once a trip is planned.</p>}
      </div>
    </div>
  );
}
