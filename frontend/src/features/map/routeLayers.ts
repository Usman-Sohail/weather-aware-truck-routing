import type { Feature, FeatureCollection, LineString } from 'geojson';
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

import type { LonLat } from '../../types/api';
import { LABEL_FONT, MAP_COLORS } from './mapStyle';

export interface MapRoute {
  id: string;
  geometry: LonLat[];
}

export interface RouteProperties {
  routeId: string;
  selected: boolean;
}

export type RouteLayer = LineLayerSpecification | SymbolLayerSpecification;

export interface RouteDash {
  /** Dash and gap lengths in line widths, as `line-dasharray` takes them. */
  dasharray: readonly number[];
  cap: 'butt' | 'round';
}

export const ROUTE_SOURCE_ID = 'routes';
export const ROUTE_HIT_AREA_LAYER_ID = 'route-hit-area';
export const ROUTE_CASING_LAYER_ID = 'route-casing';
export const ROUTE_LINE_LAYER_ID = 'route-line';
export const SELECTED_ROUTE_CASING_LAYER_ID = 'selected-route-casing';
export const SELECTED_ROUTE_LINE_LAYER_ID = 'selected-route-line';
export const ROUTE_LABEL_LAYER_ID = 'route-label';
export const SELECTED_ROUTE_LABEL_LAYER_ID = 'selected-route-label';
export const LOWEST_ROUTE_LAYER_ID = ROUTE_HIT_AREA_LAYER_ID;

// The pattern is chosen per feature, so even the solid line needs one: a dash with no gap.
const SOLID: RouteDash = { dasharray: [1, 0], cap: 'butt' };
const DASHED: RouteDash = { dasharray: [3, 2], cap: 'butt' };
// Round caps draw each zero-length dash as a dot one line width across.
const DOTTED: RouteDash = { dasharray: [0, 2], cap: 'round' };

export function routeDash(routeId: string): RouteDash {
  if (routeId === 'B') return DASHED;
  if (routeId === 'C') return DOTTED;
  return SOLID;
}

const DASHARRAY_BY_ROUTE: ExpressionSpecification = [
  'match',
  ['get', 'routeId'],
  'B',
  ['literal', DASHED.dasharray],
  'C',
  ['literal', DOTTED.dasharray],
  ['literal', SOLID.dasharray],
];

const CAP_BY_ROUTE: ExpressionSpecification = [
  'match',
  ['get', 'routeId'],
  'B',
  DASHED.cap,
  'C',
  DOTTED.cap,
  SOLID.cap,
];

interface RouteLook {
  filter: FilterSpecification;
  color: string;
  width: number;
  opacity: number;
  casingOpacity: number;
  textSize: number;
}

const OTHER_ROUTES: RouteLook = {
  filter: ['!=', ['get', 'selected'], true],
  color: MAP_COLORS.ink,
  width: 3,
  opacity: 0.7,
  casingOpacity: 0.8,
  textSize: 13,
};

const SELECTED_ROUTE: RouteLook = {
  filter: ['==', ['get', 'selected'], true],
  color: MAP_COLORS.selected,
  width: 5,
  opacity: 1,
  casingOpacity: 1,
  textSize: 15,
};

const HALO_WIDTH = 2;
const HIT_AREA_WIDTH = 20;

function casingLayer(id: string, look: RouteLook): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: look.filter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.halo,
      'line-width': look.width + 2 * HALO_WIDTH,
      'line-opacity': look.casingOpacity,
    },
  };
}

function lineLayer(id: string, look: RouteLook): LineLayerSpecification {
  return {
    id,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: look.filter,
    layout: { 'line-cap': CAP_BY_ROUTE, 'line-join': 'round' },
    paint: {
      'line-color': look.color,
      'line-width': look.width,
      'line-opacity': look.opacity,
      'line-dasharray': DASHARRAY_BY_ROUTE,
    },
  };
}

function labelLayer(id: string, look: RouteLook): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: ROUTE_SOURCE_ID,
    filter: look.filter,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 240,
      'text-field': ['get', 'routeId'],
      'text-font': LABEL_FONT,
      'text-size': look.textSize,
      'text-rotation-alignment': 'viewport',
    },
    paint: {
      'text-color': look.color,
      'text-halo-color': MAP_COLORS.halo,
      'text-halo-width': 2,
    },
  };
}

/**
 * Bottom to top. The selected route has its own casing and line above the others', so it
 * stays whole where routes share a road; its label sits highest, so it wins collisions.
 */
export function routeLayers(): RouteLayer[] {
  return [
    // Invisible and wider than any route, so a click or tap need not land exactly on a line.
    {
      id: ROUTE_HIT_AREA_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-width': HIT_AREA_WIDTH, 'line-opacity': 0 },
    },
    casingLayer(ROUTE_CASING_LAYER_ID, OTHER_ROUTES),
    lineLayer(ROUTE_LINE_LAYER_ID, OTHER_ROUTES),
    casingLayer(SELECTED_ROUTE_CASING_LAYER_ID, SELECTED_ROUTE),
    lineLayer(SELECTED_ROUTE_LINE_LAYER_ID, SELECTED_ROUTE),
    labelLayer(ROUTE_LABEL_LAYER_ID, OTHER_ROUTES),
    labelLayer(SELECTED_ROUTE_LABEL_LAYER_ID, SELECTED_ROUTE),
  ];
}

export const ROUTE_LAYER_IDS = routeLayers().map((layer) => layer.id);

export function routeFeatures(
  routes: readonly MapRoute[],
  selectedRouteId: string | null,
): FeatureCollection<LineString, RouteProperties> {
  const features = routes.map((route): Feature<LineString, RouteProperties> => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: route.geometry },
    properties: { routeId: route.id, selected: route.id === selectedRouteId },
  }));
  // Last is drawn on top and comes first in what a click on overlapping routes reports.
  features.sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected));
  return { type: 'FeatureCollection', features };
}

export function routeSource(): GeoJSONSourceSpecification {
  return { type: 'geojson', data: routeFeatures([], null) };
}

export function routeBounds(routes: readonly MapRoute[]): [LonLat, LonLat] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const route of routes) {
    for (const [lon, lat] of route.geometry) {
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    }
  }
  return west === Infinity
    ? null
    : [
        [west, south],
        [east, north],
      ];
}
