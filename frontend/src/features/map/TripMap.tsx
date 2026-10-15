import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibreWorker';

import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource, PaddingOptions } from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { prefersReducedMotion } from '../../lib/motion';
import { INITIAL_BOUNDS, MAP_STYLE_URL } from './mapStyle';
import {
  ROUTE_LAYER_IDS,
  ROUTE_SOURCE_ID,
  routeBounds,
  routeFeatures,
  routeLayers,
  routeSource,
} from './routeLayers';
import type { MapRoute } from './routeLayers';
import styles from './TripMap.module.css';
import { TripMapContext } from './useTripMap';

export interface TripMapProps {
  routes: readonly MapRoute[];
  /** Changes with every new plan; each new plan is fitted into view once. */
  planKey: string | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  children?: ReactNode;
  /** Pixels hidden under overlays along each edge, measured when a plan is fitted. */
  coveredEdges?: () => Partial<PaddingOptions>;
}

const FIT_PADDING_PX = 48;
const FIT_DURATION_MS = 800;

/**
 * Picking a route on the map is a shortcut for pointer users; the route comparison stays
 * the accessible way to choose one.
 */
export function TripMap({
  routes,
  planKey,
  selectedRouteId,
  onSelectRoute,
  children,
  coveredEdges,
}: TripMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const fittedPlanKey = useRef<string | null>(null);
  const selectRoute = useEffectEvent(onSelectRoute);
  const fitPadding = useEffectEvent((): PaddingOptions => {
    const covered = coveredEdges?.() ?? {};
    return {
      top: FIT_PADDING_PX + (covered.top ?? 0),
      right: FIT_PADDING_PX + (covered.right ?? 0),
      bottom: FIT_PADDING_PX + (covered.bottom ?? 0),
      left: FIT_PADDING_PX + (covered.left ?? 0),
    };
  });

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      bounds: INITIAL_BOUNDS,
      attributionControl: { compact: true },
      dragRotate: false,
      touchPitch: false,
      maxPitch: 0,
      locale: { 'Map.Title': 'Map of the planned routes' },
    });
    instance.addControl(new NavigationControl({ showCompass: false }));
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();

    const subscriptions = [
      instance.on('load', () => {
        instance.addSource(ROUTE_SOURCE_ID, routeSource());
        for (const layer of routeLayers()) instance.addLayer(layer);
        setMap(instance);
      }),
      instance.on('click', ROUTE_LAYER_IDS, (event) => {
        const routeId: unknown = event.features?.[0]?.properties.routeId;
        if (typeof routeId === 'string') selectRoute(routeId);
      }),
      instance.on('mouseenter', ROUTE_LAYER_IDS, () => {
        instance.getCanvas().style.cursor = 'pointer';
      }),
      instance.on('mouseleave', ROUTE_LAYER_IDS, () => {
        instance.getCanvas().style.cursor = '';
      }),
    ];

    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
      // A map made again starts from the initial view, so it fits the current plan anew.
      fittedPlanKey.current = null;
      setMap(null);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    void map
      ?.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)
      ?.setData(routeFeatures(routes, selectedRouteId));
  }, [map, routes, selectedRouteId]);

  useEffect(() => {
    if (!map || planKey === fittedPlanKey.current) return;
    fittedPlanKey.current = planKey;
    const bounds = routeBounds(routes);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: fitPadding(),
        duration: FIT_DURATION_MS,
        animate: !prefersReducedMotion(),
      });
    }
  }, [map, planKey, routes]);

  return (
    <div className={styles.map}>
      <div ref={container} className={styles.canvas} />
      <TripMapContext value={map}>{children}</TripMapContext>
    </div>
  );
}
