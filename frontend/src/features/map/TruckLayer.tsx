import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect } from 'react';

import type { PlannedRoute } from '../../types/api';
import { TRUCK_LAYER_IDS, TRUCK_SOURCE_ID, truckLayers, truckPositions } from './trucks';
import { useTripMap } from './useTripMap';

interface TruckLayerProps {
  routes: readonly Pick<PlannedRoute, 'id' | 'hourly_positions'>[];
  hour: number;
  selectedRouteId: string | null;
}

export function TruckLayer({ routes, hour, selectedRouteId }: TruckLayerProps) {
  const map = useTripMap();

  useEffect(() => {
    if (!map) return;
    map.addSource(TRUCK_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    for (const layer of truckLayers()) map.addLayer(layer);
    return () => {
      for (const id of [...TRUCK_LAYER_IDS].reverse()) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(TRUCK_SOURCE_ID)) map.removeSource(TRUCK_SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    void map
      ?.getSource<GeoJSONSource>(TRUCK_SOURCE_ID)
      ?.setData(truckPositions(routes, hour, selectedRouteId));
  }, [map, routes, hour, selectedRouteId]);

  return null;
}
