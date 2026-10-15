import { Popup } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';

import { prefersReducedMotion } from '../../lib/motion';
import type { RouteView } from '../results/model';
import {
  CHECKPOINT_LAYER_IDS,
  CHECKPOINT_SOURCE_ID,
  checkpointFeatures,
  checkpointLayers,
} from './checkpoints';
import { CheckpointPopup } from './CheckpointPopup';
import { ROUTE_LABEL_LAYER_ID } from './routeLayers';
import { useTripMap } from './useTripMap';

export interface CheckpointRequest {
  checkpointId: string;
  returnFocus: HTMLElement | null;
}

interface CheckpointLayerProps {
  routes: RouteView[];
  selectedRouteId: string | null;
  timeZone: string;
  request?: CheckpointRequest | null;
}

const REQUEST_ZOOM = 7;

export function CheckpointLayer({
  routes,
  selectedRouteId,
  timeZone,
  request = null,
}: CheckpointLayerProps) {
  const map = useTripMap();
  const [popupContent] = useState(() => document.createElement('div'));
  // A popup belongs to the routes it was opened on, so new results close it.
  const [opened, setOpened] = useState<{
    routes: RouteView[];
    checkpointId: string;
    returnFocus?: HTMLElement | null;
  } | null>(null);
  const [handledRequest, setHandledRequest] = useState(request);
  if (request !== handledRequest) {
    setHandledRequest(request);
    if (request) setOpened({ routes, ...request });
  }
  const openId = opened?.routes === routes ? opened.checkpointId : null;
  const checkpoint = openId === null ? null : findCheckpoint(routes, openId);
  const openCheckpoint = useEffectEvent((checkpointId: string) => {
    setOpened({ routes, checkpointId });
  });

  useEffect(() => {
    if (!map) return;
    map.addSource(CHECKPOINT_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    for (const layer of checkpointLayers()) map.addLayer(layer, ROUTE_LABEL_LAYER_ID);
    const subscriptions = [
      map.on('click', CHECKPOINT_LAYER_IDS.circles, (event) => {
        const checkpointId: unknown = event.features?.[0]?.properties.checkpointId;
        if (typeof checkpointId === 'string') openCheckpoint(checkpointId);
      }),
      map.on('mouseenter', CHECKPOINT_LAYER_IDS.circles, () => {
        map.getCanvas().style.cursor = 'pointer';
      }),
      map.on('mouseleave', CHECKPOINT_LAYER_IDS.circles, () => {
        map.getCanvas().style.cursor = '';
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
      for (const id of [CHECKPOINT_LAYER_IDS.labels, CHECKPOINT_LAYER_IDS.circles]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(CHECKPOINT_SOURCE_ID)) map.removeSource(CHECKPOINT_SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    void map
      ?.getSource<GeoJSONSource>(CHECKPOINT_SOURCE_ID)
      ?.setData(checkpointFeatures(routes, selectedRouteId));
  }, [map, routes, selectedRouteId]);

  const moveTo = useEffectEvent((checkpointId: string) => {
    const target = findCheckpoint(routes, checkpointId);
    if (!map || !target) return;
    // On a phone the map sits below the results, out of sight.
    map.getContainer().scrollIntoView?.({ block: 'nearest' });
    map.easeTo({
      center: [target.lon, target.lat],
      zoom: Math.max(map.getZoom(), REQUEST_ZOOM),
      animate: !prefersReducedMotion(),
    });
  });

  useEffect(() => {
    if (request) moveTo(request.checkpointId);
  }, [map, request]);

  const returnFocus = useEffectEvent((popupElement: HTMLElement | undefined) => {
    const focused = document.activeElement;
    if (focused === document.body || popupElement?.contains(focused)) opened?.returnFocus?.focus();
  });

  useEffect(() => {
    if (!map || !checkpoint) return;
    const popup = new Popup({ maxWidth: 'none' })
      .setLngLat([checkpoint.lon, checkpoint.lat])
      .setDOMContent(popupContent)
      .addTo(map);
    // A click on another checkpoint opens it before this popup's close-on-click fires.
    const closing = popup.on('close', () => {
      returnFocus(popup.getElement?.());
      setOpened((current) => (current?.checkpointId === checkpoint.id ? null : current));
    });
    return () => {
      closing.unsubscribe();
      popup.remove();
    };
  }, [map, checkpoint, popupContent]);

  return checkpoint
    ? createPortal(
        <CheckpointPopup
          checkpoint={checkpoint}
          routeId={checkpoint.route_id}
          timeZone={timeZone}
        />,
        popupContent,
      )
    : null;
}

function findCheckpoint(routes: RouteView[], checkpointId: string) {
  for (const route of routes) {
    const found = route.checkpoints.find((checkpoint) => checkpoint.id === checkpointId);
    if (found) return found;
  }
  return null;
}
