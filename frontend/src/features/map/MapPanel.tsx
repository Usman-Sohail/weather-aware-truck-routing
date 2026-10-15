import { useRef, useState } from 'react';

import type { Results } from '../results/useResults';
import { CheckpointLayer } from './CheckpointLayer';
import type { CheckpointRequest } from './CheckpointLayer';
import { ForecastSlider } from './ForecastSlider';
import { HeatmapLayer } from './HeatmapLayer';
import { HeatmapLegend } from './HeatmapLegend';
import styles from './MapPanel.module.css';
import type { MapRoute } from './routeLayers';
import { TripMap } from './TripMap';
import { TruckLayer } from './TruckLayer';

const NO_ROUTES: readonly MapRoute[] = [];

interface MapPanelProps {
  results: Results | null;
  checkpointRequest?: CheckpointRequest | null;
}

export function MapPanel({ results, checkpointRequest = null }: MapPanelProps) {
  const planKey = results?.plan.plan_token ?? null;
  // The hour lives here, not in App, so dragging the slider never re-renders the results.
  const [chosen, setChosen] = useState({ planKey, hour: 0 });
  const hour = chosen.planKey === planKey ? chosen.hour : 0;
  const selectedRouteId = results?.selected?.id ?? null;
  const overlay = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.panel}>
      <TripMap
        routes={results?.plan.routes ?? NO_ROUTES}
        planKey={planKey}
        selectedRouteId={selectedRouteId}
        onSelectRoute={results?.select ?? (() => {})}
        coveredEdges={() => ({ bottom: coveredHeight(overlay.current) })}
      >
        {results && (
          <>
            <HeatmapLayer
              corridor={results.plan.corridor}
              frames={results.assessment.heatmap.frames}
              hour={hour}
            />
            <CheckpointLayer
              routes={results.routes}
              selectedRouteId={selectedRouteId}
              timeZone={results.plan.departure.time_zone}
              request={checkpointRequest}
            />
            <TruckLayer
              routes={results.plan.routes}
              hour={hour}
              selectedRouteId={selectedRouteId}
            />
          </>
        )}
      </TripMap>
      <div ref={overlay} className={styles.overlay}>
        {results ? (
          <div className={styles.controls}>
            <div className={styles.card}>
              <ForecastSlider
                hour={hour}
                onChange={(next) => setChosen({ planKey, hour: next })}
                departureUtc={results.plan.departure.utc}
                timeZone={results.plan.departure.time_zone}
              />
            </div>
            <HeatmapLegend approxCellMi={results.plan.corridor.approx_cell_mi} />
          </div>
        ) : (
          <p className={styles.note}>Routes appear here once a trip is planned.</p>
        )}
      </div>
    </div>
  );
}

// The controls float over the map on wide screens but sit below it on a phone.
function coveredHeight(overlay: HTMLElement | null): number {
  if (!overlay) return 0;
  const { position, bottom } = getComputedStyle(overlay);
  return position === 'absolute' ? overlay.offsetHeight + Number.parseFloat(bottom) : 0;
}
