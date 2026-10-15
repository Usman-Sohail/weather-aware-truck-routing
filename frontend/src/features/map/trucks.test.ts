import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import type { LonLat, PlannedRoute } from '../../types/api';
import { LABEL_FONT, MAP_COLORS } from './mapStyle';
import { TRUCK_LAYER_IDS, TRUCK_SOURCE_ID, truckLayers, truckPositions } from './trucks';

const DENVER: LonLat = [-104.99, 39.74];

const ROUTES: Pick<PlannedRoute, 'id' | 'hourly_positions'>[] = [
  { id: 'A', hourly_positions: [DENVER, [-103.2, 39.6], [-101.4, 39.4], null] },
  { id: 'B', hourly_positions: [DENVER, [-103.5, 40.1], null, null] },
  { id: 'C', hourly_positions: [DENVER, [-103.3, 39.9], [-101.6, 39.8], [-100.1, 39.9]] },
];

function routeIds(hour: number): string[] {
  return truckPositions(ROUTES, hour, null).features.map(({ properties }) => properties.routeId);
}

describe('truckPositions', () => {
  it('places one point per route still driving at the hour', () => {
    expect(truckPositions(ROUTES, 1, null)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-103.2, 39.6] },
          properties: { routeId: 'A', selected: false },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-103.5, 40.1] },
          properties: { routeId: 'B', selected: false },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-103.3, 39.9] },
          properties: { routeId: 'C', selected: false },
        },
      ],
    });
  });

  it('leaves out trucks that have arrived', () => {
    expect(routeIds(2)).toEqual(['A', 'C']);
    expect(routeIds(3)).toEqual(['C']);
  });

  it('flags the selected route', () => {
    const flags = truckPositions(ROUTES, 0, 'B').features.map(({ properties }) => [
      properties.routeId,
      properties.selected,
    ]);

    expect(flags).toEqual([
      ['A', false],
      ['B', true],
      ['C', false],
    ]);
  });

  it('treats an hour beyond the data as arrived', () => {
    expect(routeIds(4)).toEqual([]);
    expect(routeIds(48)).toEqual([]);
  });

  it('can be handed to a MapLibre GeoJSON source as it is', () => {
    const data: GeoJSONSourceSpecification['data'] = truckPositions(ROUTES, 1, 'A');

    expect(data).toHaveProperty('type', 'FeatureCollection');
  });
});

describe('truckLayers', () => {
  it('draws a dot with the route letter on top, from the trucks source unless told otherwise', () => {
    const [dot, letter] = truckLayers();

    expect(TRUCK_LAYER_IDS).toEqual([dot.id, letter.id]);
    expect(dot).toMatchObject({ type: 'circle', source: TRUCK_SOURCE_ID });
    expect(letter).toMatchObject({
      type: 'symbol',
      source: TRUCK_SOURCE_ID,
      layout: { 'text-field': ['get', 'routeId'], 'text-font': LABEL_FONT },
    });
    expect(truckLayers('trip-trucks').map((layer) => layer.source)).toEqual([
      'trip-trucks',
      'trip-trucks',
    ]);
  });

  it('paints trucks in ink and the selected route in the selection blue, never in risk colours', () => {
    const [dot] = truckLayers();
    const colours = new Set(JSON.stringify(truckLayers()).match(/#[0-9a-f]{6}/gi));

    expect(dot.paint?.['circle-color']).toEqual([
      'case',
      ['boolean', ['get', 'selected'], false],
      MAP_COLORS.selected,
      MAP_COLORS.ink,
    ]);
    expect(colours).toEqual(new Set([MAP_COLORS.selected, MAP_COLORS.ink, MAP_COLORS.halo]));
  });
});
