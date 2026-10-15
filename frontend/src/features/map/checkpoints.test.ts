import { describe, expect, it } from 'vitest';

import { RISK_LEVELS, UNKNOWN_RISK } from '../../lib/risk';
import type { RiskKey } from '../../types/api';
import type { RouteView } from '../results/model';
import { testRoute } from '../results/testRoutes';
import {
  CHECKPOINT_LAYER_IDS,
  CHECKPOINT_SOURCE_ID,
  checkpointFeatures,
  checkpointLayers,
} from './checkpoints';
import { LABEL_FONT, MAP_COLORS } from './mapStyle';

function route(id: string, rank: number, levels: RiskKey[]): RouteView {
  const view = testRoute(id, rank, 100, levels);
  const checkpoints = view.checkpoints.map((checkpoint) => ({
    ...checkpoint,
    lon: -100 + rank + checkpoint.seq / 10,
    lat: 40 - checkpoint.seq / 10,
  }));
  return { ...view, checkpoints };
}

const ROUTES = [
  route('A', 1, ['low', 'severe', 'moderate']),
  route('B', 2, ['no_travel', 'low', 'unknown', 'high']),
];

function propertiesById(selectedRouteId: string | null) {
  return Object.fromEntries(
    checkpointFeatures(ROUTES, selectedRouteId).features.map((feature) => [
      feature.properties.checkpointId,
      feature.properties,
    ]),
  );
}

function idsById(selectedRouteId: string | null) {
  return Object.fromEntries(
    checkpointFeatures(ROUTES, selectedRouteId).features.map((feature) => [
      feature.properties.checkpointId,
      feature.id,
    ]),
  );
}

describe('checkpointFeatures', () => {
  it('places a point at every checkpoint of every route', () => {
    const { type, features } = checkpointFeatures(ROUTES, 'A');

    expect(type).toBe('FeatureCollection');
    expect(features).toHaveLength(7);
    for (const checkpoint of ROUTES.flatMap((view) => view.checkpoints)) {
      const feature = features.find(
        (candidate) => candidate.properties.checkpointId === checkpoint.id,
      );
      expect(feature?.geometry).toEqual({
        type: 'Point',
        coordinates: [checkpoint.lon, checkpoint.lat],
      });
      expect(feature?.properties.routeId).toBe(checkpoint.route_id);
    }
  });

  it('numbers the points from 1, uniquely across routes, whichever route is selected', () => {
    const ids = idsById('A');

    expect(
      Object.values(ids).every((id) => typeof id === 'number' && Number.isInteger(id) && id >= 1),
    ).toBe(true);
    expect(new Set(Object.values(ids)).size).toBe(7);
    expect(idsById('B')).toEqual(ids);
    expect(idsById(null)).toEqual(ids);
  });

  it('carries each risk level as its key and its index, with -1 for no forecast', () => {
    const levels = Object.values(propertiesById(null)).map(
      ({ checkpointId, level, levelIndex }) => [checkpointId, level, levelIndex],
    );

    expect(levels).toEqual(
      expect.arrayContaining([
        ['A-0', 'low', 0],
        ['A-1', 'severe', 3],
        ['A-2', 'moderate', 1],
        ['B-0', 'no_travel', 4],
        ['B-1', 'low', 0],
        ['B-2', 'unknown', -1],
        ['B-3', 'high', 2],
      ]),
    );
    expect(levels).toHaveLength(7);
  });

  it('marks the checkpoints of the selected route', () => {
    const selected = (selectedRouteId: string | null) =>
      Object.values(propertiesById(selectedRouteId))
        .filter((properties) => properties.selected)
        .map((properties) => properties.checkpointId)
        .sort();

    expect(selected('A')).toEqual(['A-0', 'A-1', 'A-2']);
    expect(selected('B')).toEqual(['B-0', 'B-1', 'B-2', 'B-3']);
    expect(selected(null)).toEqual([]);
  });

  it('names the level only on the selected route, and only above Low', () => {
    const labels = (selectedRouteId: string | null) =>
      Object.fromEntries(
        Object.values(propertiesById(selectedRouteId)).map((properties) => [
          properties.checkpointId,
          properties.label,
        ]),
      );

    expect(labels('A')).toEqual({
      'A-0': '',
      'A-1': 'Severe',
      'A-2': 'Moderate',
      'B-0': '',
      'B-1': '',
      'B-2': '',
      'B-3': '',
    });
    expect(labels('B')).toEqual({
      'A-0': '',
      'A-1': '',
      'A-2': '',
      'B-0': 'No Travel',
      'B-1': '',
      'B-2': '',
      'B-3': 'High',
    });
  });

  it('lists the selected route last and worse risks after milder ones, so they draw on top', () => {
    const order = (selectedRouteId: string | null) =>
      checkpointFeatures(ROUTES, selectedRouteId).features.map(
        (feature) => feature.properties.checkpointId,
      );

    expect(order('A')).toEqual(['B-2', 'B-1', 'B-3', 'B-0', 'A-0', 'A-2', 'A-1']);
    expect(order('B')).toEqual(['A-0', 'A-2', 'A-1', 'B-2', 'B-1', 'B-3', 'B-0']);
  });
});

/**
 * The few MapLibre expression operators these layers use, evaluated for one feature, so the
 * tests can check what the map would draw without a WebGL context.
 */
function evaluate(expression: unknown, zoom: number, properties: Record<string, unknown>): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression as [string, ...unknown[]];
  const value = (index: number) => evaluate(args[index], zoom, properties);
  const numbers = () => args.map((_, index) => Number(value(index)));
  switch (operator) {
    case 'get':
      return properties[String(args[0])];
    case 'zoom':
      return zoom;
    case '+':
      return numbers().reduce((sum, term) => sum + term, 0);
    case '*':
      return numbers().reduce((product, factor) => product * factor, 1);
    case '-':
      return args.length === 1 ? -Number(value(0)) : Number(value(0)) - Number(value(1));
    case '/':
      return Number(value(0)) / Number(value(1));
    case 'max':
      return Math.max(...numbers());
    case 'case':
      for (let index = 0; index < args.length - 1; index += 2) {
        if (value(index) === true) return value(index + 1);
      }
      return value(args.length - 1);
    case 'step': {
      let output = value(1);
      for (let index = 2; index < args.length; index += 2) {
        if (Number(value(0)) >= Number(args[index])) output = value(index + 1);
      }
      return output;
    }
    case 'interpolate': {
      expect(args[0]).toEqual(['linear']);
      const input = Number(value(1));
      const stops: [number, number][] = [];
      for (let index = 2; index < args.length; index += 2) {
        stops.push([Number(args[index]), Number(value(index + 1))]);
      }
      const above = stops.findIndex(([stop]) => stop >= input);
      const upper = stops.at(above);
      const lower = stops[above - 1];
      if (!upper || !lower || above === -1) return upper?.[1];
      const progress = (input - lower[0]) / (upper[0] - lower[0]);
      return lower[1] + progress * (upper[1] - lower[1]);
    }
    default:
      throw new Error(`The test evaluator does not support "${operator}".`);
  }
}

describe('checkpointLayers', () => {
  const [circles, labels] = checkpointLayers();
  const circlePaint = circles.paint ?? {};
  const labelLayout = labels.layout ?? {};

  const radius = (levelIndex: number, selected: boolean, zoom = 6) =>
    Number(evaluate(circlePaint['circle-radius'], zoom, { levelIndex, selected }));
  const strokeWidth = (zoom: number) =>
    Number(evaluate(circlePaint['circle-stroke-width'], zoom, {}));

  it('draws circles, then labels over them, from the checkpoint source or the one given', () => {
    expect([circles.id, circles.type, labels.id, labels.type]).toEqual([
      CHECKPOINT_LAYER_IDS.circles,
      'circle',
      CHECKPOINT_LAYER_IDS.labels,
      'symbol',
    ]);
    expect([circles.source, labels.source]).toEqual([CHECKPOINT_SOURCE_ID, CHECKPOINT_SOURCE_ID]);
    expect(checkpointLayers('trip-checkpoints').map((layer) => layer.source)).toEqual([
      'trip-checkpoints',
      'trip-checkpoints',
    ]);
  });

  it('colours each circle by its risk level, and grey without a forecast', () => {
    const colours = [...RISK_LEVELS, UNKNOWN_RISK].map((level) =>
      evaluate(circlePaint['circle-color'], 6, { levelIndex: level.index ?? -1 }),
    );

    expect(colours).toEqual([...RISK_LEVELS, UNKNOWN_RISK].map((level) => level.color));
  });

  it.each([3, 6, 12])('grows circles from Low to No Travel at zoom %i', (zoom) => {
    const radii = RISK_LEVELS.map((level) => radius(level.index ?? -1, true, zoom));

    radii.slice(1).forEach((next, index) => {
      expect(next).toBeGreaterThan(radii[index] ?? Infinity);
    });
    expect(radius(-1, true, zoom)).toBe(radii[0]);
  });

  it('draws the checkpoints of other routes smaller and fainter', () => {
    const opacity = (selected: boolean) =>
      evaluate(circlePaint['circle-opacity'], 6, { levelIndex: 2, selected });

    for (const level of [...RISK_LEVELS, UNKNOWN_RISK]) {
      expect(radius(level.index ?? -1, false)).toBeLessThan(radius(level.index ?? -1, true));
    }
    expect(opacity(true)).toBe(1);
    expect(opacity(false)).toBeLessThan(1);
    expect(circlePaint['circle-stroke-opacity']).toEqual(circlePaint['circle-opacity']);
  });

  it('scales circles with zoom, so they read from the whole country to a town', () => {
    expect(radius(0, true, 3)).toBeLessThan(radius(0, true, 6));
    expect(radius(0, true, 6)).toBeLessThan(radius(0, true, 12));
    expect(radius(0, false, 3)).toBeGreaterThanOrEqual(1);
    expect(radius(4, true, 16)).toBeLessThanOrEqual(16);
  });

  it('outlines every circle in ink, so pale levels show on a light basemap', () => {
    expect(circlePaint['circle-stroke-color']).toBe(MAP_COLORS.ink);
    for (const zoom of [3, 6, 12]) {
      expect(strokeWidth(zoom)).toBeGreaterThan(0);
    }
  });

  it('labels only the checkpoints that carry a label, in the map font with a white halo', () => {
    expect(labels.filter).toEqual(['!=', ['get', 'label'], '']);
    expect(labelLayout['text-field']).toEqual(['get', 'label']);
    expect(labelLayout['text-font']).toEqual(LABEL_FONT);
    expect(labels.paint?.['text-color']).toBe(MAP_COLORS.ink);
    expect(labels.paint?.['text-halo-color']).toBe(MAP_COLORS.halo);
    expect(labels.paint?.['text-halo-width']).toBeGreaterThan(0);
  });

  it('places the labels of the worst levels first when labels collide', () => {
    const sortKeys = [1, 2, 3, 4].map((levelIndex) =>
      Number(evaluate(labelLayout['symbol-sort-key'], 6, { levelIndex })),
    );

    expect(sortKeys).toEqual([...sortKeys].sort((a, b) => b - a));
    expect(new Set(sortKeys).size).toBe(4);
  });

  it.each([3, 6, 9, 12, 16])('sets each label just clear of its circle at zoom %i', (zoom) => {
    const textSize = Number(labelLayout['text-size']);

    for (const levelIndex of [1, 2, 3, 4]) {
      const offset =
        Number(evaluate(labelLayout['text-radial-offset'], zoom, { levelIndex, selected: true })) *
        textSize;
      const edge = radius(levelIndex, true, zoom) + strokeWidth(zoom);
      expect(offset).toBeGreaterThan(edge);
      expect(offset).toBeLessThan(edge + 6);
    }
  });
});
