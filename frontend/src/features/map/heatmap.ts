import type { FeatureCollection, Polygon } from 'geojson';
import type { ExpressionSpecification, FillLayerSpecification } from 'maplibre-gl';

import { RISK_LEVELS, UNKNOWN_RISK } from '../../lib/risk';
import type { Corridor } from '../../types/api';

export const HEATMAP_SOURCE_ID = 'heatmap-cells';
export const HEATMAP_FILL_LAYER_ID = 'heatmap-fill';
export const HEATMAP_HATCH_LAYER_ID = 'heatmap-hatch';
export const HATCH_IMAGE_ID = 'heatmap-hatch-pattern';

// Every pair of levels stays clearly apart over the light basemap (CIEDE2000 above 13),
// while roads and places still show through.
const WASH_OPACITY = 0.45;

const HATCH_SIZE = 8;
const HATCH_LINE_WIDTH = 1.5;

export interface FeatureStateTarget {
  setFeatureState(feature: { source: string; id: number }, state: { level: number | null }): void;
}

export function cellPolygons(corridor: Corridor): FeatureCollection<Polygon> {
  const { cells, step_lon_deg: stepLon, step_lat_deg: stepLat } = corridor;
  const westEdges = cells.map(([west]) => west);
  const southEdges = cells.map(([, south]) => south);
  const eastEdge = farEdge(westEdges, stepLon);
  const northEdge = farEdge(southEdges, stepLat);
  return {
    type: 'FeatureCollection',
    features: cells.map(([west, south], id) => {
      const east = eastEdge(west);
      const north = northEdge(south);
      return {
        type: 'Feature',
        id,
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      };
    }),
  };
}

// The API rounds corners and steps separately, so a corner plus a step can miss the next
// cell's corner by a metre. Translucent cells that overlap or part by that much show
// hairline seams, so a far edge snaps to the near edge of a neighbouring row or column.
function farEdge(nearEdges: number[], step: number): (near: number) => number {
  const gridLines = [...new Set(nearEdges)];
  return (near) => {
    const far = near + step;
    return gridLines.find((line) => Math.abs(line - far) < step / 1000) ?? far;
  };
}

// An unknown level (null, or not set yet) reads as -1, below every step's first stop.
const LEVEL_STATE: ExpressionSpecification = ['coalesce', ['feature-state', 'level'], -1];

export function heatmapLayers(
  sourceId = HEATMAP_SOURCE_ID,
): [hatch: FillLayerSpecification, fill: FillLayerSpecification] {
  return [
    {
      id: HEATMAP_HATCH_LAYER_ID,
      type: 'fill',
      source: sourceId,
      paint: {
        // fill-pattern cannot read feature state, so the opacity picks out the unknown cells.
        'fill-pattern': HATCH_IMAGE_ID,
        'fill-opacity': ['step', LEVEL_STATE, 1, 0, 0],
        // Antialiasing strokes the edge of every translucent cell, which would grid the wash.
        'fill-antialias': false,
      },
    },
    {
      id: HEATMAP_FILL_LAYER_ID,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': [
          'step',
          LEVEL_STATE,
          'transparent',
          ...RISK_LEVELS.flatMap(({ index, color }) => (index === null ? [] : [index, color])),
        ],
        'fill-opacity': WASH_OPACITY,
        'fill-antialias': false,
      },
    },
  ];
}

export function hatchImage(): { width: number; height: number; data: Uint8Array } {
  const [red, green, blue] = rgbChannels(UNKNOWN_RISK.color);
  const data = new Uint8Array(HATCH_SIZE * HATCH_SIZE * 4);
  for (let y = 0; y < HATCH_SIZE; y += 1) {
    for (let x = 0; x < HATCH_SIZE; x += 1) {
      // Stripes run along x + y = a multiple of the tile size, rising to the right, so they
      // carry on across tile edges. Partial coverage by distance keeps their edges smooth.
      const offset = (x + y + 1) % HATCH_SIZE;
      const distance = Math.min(offset, HATCH_SIZE - offset) / Math.SQRT2;
      const coverage = Math.min(1, Math.max(0, HATCH_LINE_WIDTH / 2 + 0.5 - distance));
      data.set([red, green, blue, Math.round(coverage * 255)], (y * HATCH_SIZE + x) * 4);
    }
  }
  return { width: HATCH_SIZE, height: HATCH_SIZE, data };
}

export function applyFrame(
  target: FeatureStateTarget,
  frame: readonly (number | null)[],
  previous?: readonly (number | null)[],
  sourceId = HEATMAP_SOURCE_ID,
): void {
  const changesOnly = previous?.length === frame.length;
  frame.forEach((level, id) => {
    if (changesOnly && previous[id] === level) return;
    target.setFeatureState({ source: sourceId, id }, { level });
  });
}

export function washColor(color: string): string {
  const [red, green, blue] = rgbChannels(color);
  return `rgba(${red}, ${green}, ${blue}, ${WASH_OPACITY})`;
}

function rgbChannels(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
