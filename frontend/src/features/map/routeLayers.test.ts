// The style spec maplibre-gl ships with, so the layers are read here as the map reads them.
import {
  featureFilter,
  latest,
  normalizePropertyExpression,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import { LABEL_FONT, MAP_COLORS } from './mapStyle';
import {
  LOWEST_ROUTE_LAYER_ID,
  ROUTE_LAYER_IDS,
  ROUTE_SOURCE_ID,
  routeBounds,
  routeDash,
  routeFeatures,
  routeLayers,
  routeSource,
} from './routeLayers';
import type { MapRoute, RouteLayer, RouteProperties } from './routeLayers';

const ROUTES: MapRoute[] = [
  {
    id: 'A',
    geometry: [
      [-104.99, 39.74],
      [-96.7, 40.81],
      [-87.63, 41.88],
    ],
  },
  {
    id: 'B',
    geometry: [
      [-104.99, 39.74],
      [-94.58, 39.1],
      [-87.63, 41.88],
    ],
  },
  {
    id: 'C',
    geometry: [
      [-104.99, 39.74],
      [-100.35, 43.5],
      [-87.63, 41.88],
    ],
  },
];

const LAYERS = routeLayers();
const SELECTED_B: RouteProperties = { routeId: 'B', selected: true };
const OTHER_A: RouteProperties = { routeId: 'A', selected: false };

type PropertySpecification = Parameters<typeof normalizePropertyExpression>[2];

function resolve(
  layer: RouteLayer,
  section: 'layout' | 'paint',
  property: string,
  route: RouteProperties,
): unknown {
  const reference = (latest as unknown as Record<string, Record<string, PropertySpecification>>)[
    `${section}_${layer.type}`
  ];
  const specification = reference?.[property];
  if (!specification) throw new Error(`${property} is not a ${layer.type} ${section} property`);
  const values = (layer[section] ?? {}) as Record<string, unknown>;
  return normalizePropertyExpression(values[property], property, specification).evaluate(
    { zoom: 6 },
    { type: 'LineString', properties: route },
  );
}

function draws(layer: RouteLayer, route: RouteProperties): boolean {
  return featureFilter(layer.filter, 'filter').filter(
    { zoom: 6 },
    { type: 'LineString', properties: route },
  );
}

function paint(layer: RouteLayer | undefined, property: string): unknown {
  return (layer?.paint as Record<string, unknown> | undefined)?.[property];
}

function visibleLines(route: RouteProperties): RouteLayer[] {
  return LAYERS.filter(
    (layer) =>
      layer.type === 'line' &&
      draws(layer, route) &&
      resolve(layer, 'paint', 'line-opacity', route) !== 0,
  );
}

function labelFor(route: RouteProperties): RouteLayer | undefined {
  return LAYERS.find((layer) => layer.type === 'symbol' && draws(layer, route));
}

describe('routeFeatures', () => {
  it('draws each route as one line that carries its letter', () => {
    const { type, features } = routeFeatures(ROUTES, null);

    expect(type).toBe('FeatureCollection');
    expect(features).toEqual(
      ROUTES.map((route) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: route.geometry },
        properties: { routeId: route.id, selected: false },
      })),
    );
  });

  it('draws the selected route last, on top of the others', () => {
    const { features } = routeFeatures(ROUTES, 'B');

    expect(features.map((feature) => feature.properties)).toEqual([
      { routeId: 'A', selected: false },
      { routeId: 'C', selected: false },
      { routeId: 'B', selected: true },
    ]);
  });
});

describe('routeBounds', () => {
  it('spans every point of every route', () => {
    expect(routeBounds(ROUTES)).toEqual([
      [-104.99, 39.1],
      [-87.63, 43.5],
    ]);
  });

  it('has nothing to fit without routes', () => {
    expect(routeBounds([])).toBeNull();
    expect(routeBounds([{ id: 'A', geometry: [] }])).toBeNull();
  });
});

describe('routeDash', () => {
  it('tells the routes apart by pattern: A solid, B dashed, C dotted', () => {
    expect(routeDash('A')).toEqual({ dasharray: [1, 0], cap: 'butt' });
    expect(routeDash('B')).toEqual({ dasharray: [3, 2], cap: 'butt' });
    expect(routeDash('C')).toEqual({ dasharray: [0, 2], cap: 'round' });
  });

  it('draws a route it does not expect as a solid line', () => {
    expect(routeDash('D')).toEqual(routeDash('A'));
  });
});

describe('routeLayers', () => {
  it('passes the MapLibre style spec', () => {
    const errors = validateStyleMin({
      version: 8,
      glyphs: 'https://tiles.example.com/fonts/{fontstack}/{range}.pbf',
      sources: { [ROUTE_SOURCE_ID]: routeSource() },
      layers: LAYERS,
    });

    expect(errors).toEqual([]);
  });

  it('starts with the layer that other layers go beneath', () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual(ROUTE_LAYER_IDS);
    expect(ROUTE_LAYER_IDS[0]).toBe(LOWEST_ROUTE_LAYER_ID);
  });

  it('lays the selected route over the others, casing and all', () => {
    const position = (layer: RouteLayer) => LAYERS.indexOf(layer);
    const selected = visibleLines(SELECTED_B).map(position);
    const others = visibleLines(OTHER_A).map(position);

    expect(selected).toHaveLength(2);
    expect(others).toHaveLength(2);
    expect(Math.min(...selected)).toBeGreaterThan(Math.max(...others));
  });

  it('draws the selected route wider, in the selection colour', () => {
    const [selectedCasing, selectedLine] = visibleLines(SELECTED_B);
    const [otherCasing, otherLine] = visibleLines(OTHER_A);

    expect(paint(selectedLine, 'line-color')).toBe(MAP_COLORS.selected);
    expect(paint(selectedLine, 'line-opacity')).toBe(1);
    expect(paint(selectedLine, 'line-width')).toBeGreaterThan(
      Number(paint(otherLine, 'line-width')),
    );
    expect(paint(otherLine, 'line-color')).toBe(MAP_COLORS.ink);
    expect(paint(otherLine, 'line-opacity')).toBeGreaterThan(0.5);
    expect(paint(otherLine, 'line-opacity')).toBeLessThan(1);

    for (const [casing, line] of [
      [selectedCasing, selectedLine],
      [otherCasing, otherLine],
    ]) {
      expect(paint(casing, 'line-color')).toBe(MAP_COLORS.halo);
      expect(paint(casing, 'line-width')).toBeGreaterThan(Number(paint(line, 'line-width')));
    }
  });

  it('dashes every route line by its letter', () => {
    for (const routeId of ['A', 'B', 'C', 'D']) {
      for (const selected of [true, false]) {
        const route = { routeId, selected };
        const [, line] = visibleLines(route);

        expect(line && resolve(line, 'paint', 'line-dasharray', route)).toEqual(
          routeDash(routeId).dasharray,
        );
        expect(line && resolve(line, 'layout', 'line-cap', route)).toBe(routeDash(routeId).cap);
      }
    }
  });

  it('labels each route with its letter along the line, over a white halo', () => {
    for (const route of [SELECTED_B, OTHER_A]) {
      const label = labelFor(route);

      expect(label && String(resolve(label, 'layout', 'text-field', route))).toBe(route.routeId);
      expect(label?.layout).toMatchObject({
        'symbol-placement': 'line',
        'text-font': LABEL_FONT,
      });
      expect(paint(label, 'text-halo-color')).toBe(MAP_COLORS.halo);
    }
  });

  it('gives the selected route its label in the selection colour, ahead of the others', () => {
    expect(paint(labelFor(SELECTED_B), 'text-color')).toBe(MAP_COLORS.selected);
    expect(paint(labelFor(OTHER_A), 'text-color')).toBe(MAP_COLORS.ink);
    // MapLibre places the labels of higher layers first, so they win where labels collide.
    expect(LAYERS.at(-1)).toBe(labelFor(SELECTED_B));
  });
});
