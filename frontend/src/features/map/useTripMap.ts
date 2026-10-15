import type { Map as MapLibreMap } from 'maplibre-gl';
import { createContext, useContext } from 'react';

export const TripMapContext = createContext<MapLibreMap | null>(null);

/**
 * The map inside a TripMap, or null until its basemap style has loaded.
 *
 * Components that draw on it add their own sources and layers once it is there and change
 * them with `GeoJSONSource.setData` rather than re-adding them. Layers that belong under the
 * routes, such as the heatmap, go in with `map.addLayer(layer, LOWEST_ROUTE_LAYER_ID)`.
 * On cleanup, remove only what `map.getLayer` and `map.getSource` still find: React cleans
 * up a parent before its children, so the map may already be gone.
 */
export function useTripMap(): MapLibreMap | null {
  return useContext(TripMapContext);
}
