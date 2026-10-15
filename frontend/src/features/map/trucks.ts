import type { Feature, FeatureCollection, Point } from 'geojson';
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

import type { PlannedRoute } from '../../types/api';
import { LABEL_FONT, MAP_COLORS } from './mapStyle';

export const TRUCK_SOURCE_ID = 'trucks';

const DOT_LAYER_ID = 'trucks-dot';
const LETTER_LAYER_ID = 'trucks-letter';

/** Bottom to top, in the order `truckLayers` returns them. */
export const TRUCK_LAYER_IDS = [DOT_LAYER_ID, LETTER_LAYER_ID] as const;

// A type alias rather than an interface, so it fits GeoJSON's open properties type.
export type TruckProperties = {
  routeId: string;
  selected: boolean;
};

const IS_SELECTED: ExpressionSpecification = ['boolean', ['get', 'selected'], false];

export function truckPositions(
  routes: readonly Pick<PlannedRoute, 'id' | 'hourly_positions'>[],
  hour: number,
  selectedRouteId: string | null,
): FeatureCollection<Point, TruckProperties> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route): Feature<Point, TruckProperties>[] => {
      // null once the truck has arrived, and undefined past the end of the data.
      const position = route.hourly_positions[hour];
      if (!position) return [];
      return [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: position },
          properties: { routeId: route.id, selected: route.id === selectedRouteId },
        },
      ];
    }),
  };
}

export function truckLayers(
  sourceId: string = TRUCK_SOURCE_ID,
): [CircleLayerSpecification, SymbolLayerSpecification] {
  return [
    {
      id: DOT_LAYER_ID,
      type: 'circle',
      source: sourceId,
      // Trucks meet at the start and on shared roads; the selected one is drawn on top.
      layout: { 'circle-sort-key': ['case', IS_SELECTED, 1, 0] },
      paint: {
        'circle-radius': ['case', IS_SELECTED, 10, 8],
        'circle-color': ['case', IS_SELECTED, MAP_COLORS.selected, MAP_COLORS.ink],
        'circle-stroke-width': 2,
        'circle-stroke-color': MAP_COLORS.halo,
      },
    },
    {
      id: LETTER_LAYER_ID,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': ['get', 'routeId'],
        'text-font': LABEL_FONT,
        'text-size': 12,
        // Where letters would overlap only the first placed is shown, and lower keys are
        // placed first, so it is the selected route's, matching the dot on top.
        'symbol-sort-key': ['case', IS_SELECTED, 0, 1],
      },
      paint: { 'text-color': MAP_COLORS.halo },
    },
  ];
}
