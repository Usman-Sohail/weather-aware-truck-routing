import { Popup } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';

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

interface CheckpointLayerProps {
  routes: RouteView[];
  selectedRouteId: string | null;
  timeZone: string;
}

export function CheckpointLayer({ routes, selectedRouteId, timeZone }: CheckpointLayerProps) {
  const map = useTripMap();
  const [popupContent] = useState(() => document.createElement('div'));
  // A popup belongs to the routes it was opened on, so new results close it.
  const [opened, setOpened] = useState<{ routes: RouteView[]; checkpointId: string } | null>(null);
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

  useEffect(() => {
    if (!map || !checkpoint) return;
    const popup = new Popup({ maxWidth: 'none' })
      .setLngLat([checkpoint.lon, checkpoint.lat])
      .setDOMContent(popupContent)
      .addTo(map);
    // A click on another checkpoint opens it before this popup's close-on-click fires.
    const closing = popup.on('close', () => {
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
