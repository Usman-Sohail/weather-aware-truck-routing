import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import type { Corridor } from '../../types/api';
import {
  applyFrame,
  cellPolygons,
  HATCH_IMAGE_ID,
  hatchImage,
  HEATMAP_SOURCE_ID,
  heatmapLayers,
} from './heatmap';
import { LOWEST_ROUTE_LAYER_ID } from './routeLayers';
import { useFrameCallback } from './useFrameCallback';
import { useTripMap } from './useTripMap';

type Frame = readonly (number | null)[];

interface HeatmapLayerProps {
  corridor: Corridor;
  frames: readonly Frame[];
  hour: number;
}

export function HeatmapLayer({ corridor, frames, hour }: HeatmapLayerProps) {
  const map = useTripMap();
  const shownFrame = useRef<Frame | undefined>(undefined);

  useEffect(() => {
    if (!map) return;
    if (!map.hasImage(HATCH_IMAGE_ID)) map.addImage(HATCH_IMAGE_ID, hatchImage());
    map.addSource(HEATMAP_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    for (const layer of heatmapLayers()) map.addLayer(layer, LOWEST_ROUTE_LAYER_ID);
    return () => {
      for (const layer of heatmapLayers()) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
      shownFrame.current = undefined;
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    void map.getSource<GeoJSONSource>(HEATMAP_SOURCE_ID)?.setData(cellPolygons(corridor));
    // Cell ids restart at 0 for every plan, so states left by the last one would linger.
    map.removeFeatureState({ source: HEATMAP_SOURCE_ID });
    shownFrame.current = undefined;
  }, [map, corridor]);

  const showHour = useFrameCallback((k: number) => {
    const frame = frames[k];
    if (!map || !frame) return;
    applyFrame(map, frame, shownFrame.current);
    shownFrame.current = frame;
  });

  useEffect(() => {
    showHour(hour);
  }, [map, corridor, frames, hour, showHour]);

  return null;
}
