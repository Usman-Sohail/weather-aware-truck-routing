import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { riskInfo, RISK_LEVELS, UNKNOWN_RISK } from '../../lib/risk';
import type { Corridor, LonLat } from '../../types/api';
import {
  applyFrame,
  cellPolygons,
  HATCH_IMAGE_ID,
  hatchImage,
  HEATMAP_FILL_LAYER_ID,
  HEATMAP_HATCH_LAYER_ID,
  HEATMAP_SOURCE_ID,
  heatmapLayers,
  washColor,
} from './heatmap';
import type { FeatureStateTarget } from './heatmap';

function corridor(cells: LonLat[], stepLonDeg = 0.5, stepLatDeg = 0.25): Corridor {
  return {
    step_lat_deg: stepLatDeg,
    step_lon_deg: stepLonDeg,
    approx_cell_mi: 17,
    cells,
    first_location_index: 40,
  };
}

const LEVEL_STATE = ['coalesce', ['feature-state', 'level'], -1];

describe('cellPolygons', () => {
  it('outlines each cell as a closed square ring from its south-west corner and the steps', () => {
    const { features } = cellPolygons(
      corridor([
        [-104.5, 39.75],
        [-102, 41],
      ]),
    );

    expect(features[0]).toEqual({
      type: 'Feature',
      id: 0,
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-104.5, 39.75],
            [-104, 39.75],
            [-104, 40],
            [-104.5, 40],
            [-104.5, 39.75],
          ],
        ],
      },
    });
    const ring = features[1]?.geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring?.at(-1)).toEqual(ring?.[0]);
  });

  it('numbers the features by cell index, the index the heatmap frames use', () => {
    const { features } = cellPolygons(
      corridor([
        [-104.5, 39.75],
        [-104, 39.75],
        [-104.5, 40],
      ]),
    );

    expect(features.map((feature) => feature.id)).toEqual([0, 1, 2]);
  });

  it('gives neighbouring cells exactly the same edge, despite the rounding in the API', () => {
    // As the API sends them: corners rounded to 5 decimals, the longitude step to 6.
    const cells: LonLat[] = [
      [-100.12474, 40.2],
      [-99.9942, 40.2],
      [-100.12474, 40.3],
    ];
    const { features } = cellPolygons(corridor(cells, 0.130541, 0.1));

    expect(features[0]?.geometry.coordinates).toEqual([
      [
        [-100.12474, 40.2],
        [-99.9942, 40.2],
        [-99.9942, 40.3],
        [-100.12474, 40.3],
        [-100.12474, 40.2],
      ],
    ]);
  });

  it('is empty for an empty corridor', () => {
    expect(cellPolygons(corridor([]))).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('heatmapLayers', () => {
  const [hatch, fill] = heatmapLayers();

  it('adds the no-forecast hatch first, then the risk colours', () => {
    expect([hatch.id, fill.id]).toEqual([HEATMAP_HATCH_LAYER_ID, HEATMAP_FILL_LAYER_ID]);
    expect([hatch.type, fill.type]).toEqual(['fill', 'fill']);
  });

  it('colours each cell by the level in its feature state, from Low to No Travel', () => {
    expect(fill.paint?.['fill-color']).toEqual([
      'step',
      LEVEL_STATE,
      // Cells without a forecast take the hatch instead.
      'transparent',
      ...RISK_LEVELS.flatMap((level) => [level.index, level.color]),
    ]);
  });

  it('washes the colours over the basemap rather than hiding it', () => {
    const opacity = fill.paint?.['fill-opacity'];

    expect(opacity).toBeGreaterThanOrEqual(0.4);
    expect(opacity).toBeLessThanOrEqual(0.5);
  });

  it('shows the hatch only where the level is unknown, since a pattern cannot follow feature state', () => {
    expect(hatch.paint?.['fill-pattern']).toBe(HATCH_IMAGE_ID);
    expect(hatch.paint?.['fill-opacity']).toEqual(['step', LEVEL_STATE, 1, 0, 0]);
  });

  it('draws no cell outlines, which would grid the translucent wash', () => {
    expect(hatch.paint?.['fill-antialias']).toBe(false);
    expect(fill.paint?.['fill-antialias']).toBe(false);
  });

  it('reads the heatmap source, or the one given', () => {
    expect([hatch.source, fill.source]).toEqual([HEATMAP_SOURCE_ID, HEATMAP_SOURCE_ID]);
    expect(heatmapLayers('trip-cells').map((layer) => layer.source)).toEqual([
      'trip-cells',
      'trip-cells',
    ]);
  });
});

describe('hatchImage', () => {
  const { width, height, data } = hatchImage();
  const pixels = Array.from({ length: width * height }, (_, index) =>
    data.subarray(index * 4, index * 4 + 4),
  );
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
  const hex = (channels: Uint8Array) =>
    `#${Array.from(channels, (value) => value.toString(16).padStart(2, '0')).join('')}`;

  it('is a small RGBA tile whose sides are a power of two, as seamless patterns need', () => {
    expect([width, height]).toEqual([8, 8]);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data).toHaveLength(width * height * 4);
  });

  it('draws a line in the no-forecast grey on a transparent ground', () => {
    const alphas = pixels.map((pixel) => pixel[3]);
    const colours = new Set(pixels.map((pixel) => hex(pixel.subarray(0, 3))));

    expect(alphas).toContain(255);
    expect(alphas).toContain(0);
    expect([...colours]).toEqual([UNKNOWN_RISK.color]);
  });

  it('tiles seamlessly, the line leaving each edge where it enters the opposite one', () => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // The next pixel up the diagonal, wrapping round the tile, lies on the same stripe.
        expect(alphaAt((x + 1) % width, (y + height - 1) % height)).toBe(alphaAt(x, y));
      }
    }
    expect(alphaAt(0, height - 1)).toBe(255);
    expect(alphaAt(width - 1, 0)).toBe(255);
  });
});

describe('applyFrame', () => {
  function recordingTarget() {
    return { setFeatureState: vi.fn<FeatureStateTarget['setFeatureState']>() };
  }

  it('sets the level of every cell, null where the forecast is unknown', () => {
    const target = recordingTarget();

    applyFrame(target, [0, null, 3]);

    expect(target.setFeatureState.mock.calls).toEqual([
      [{ source: HEATMAP_SOURCE_ID, id: 0 }, { level: 0 }],
      [{ source: HEATMAP_SOURCE_ID, id: 1 }, { level: null }],
      [{ source: HEATMAP_SOURCE_ID, id: 2 }, { level: 3 }],
    ]);
  });

  it('updates only the cells that changed since the previous frame', () => {
    const target = recordingTarget();

    applyFrame(target, [0, 2, null, null, 4], [0, 1, null, 3, 4]);

    expect(target.setFeatureState.mock.calls).toEqual([
      [{ source: HEATMAP_SOURCE_ID, id: 1 }, { level: 2 }],
      [{ source: HEATMAP_SOURCE_ID, id: 3 }, { level: null }],
    ]);
  });

  it('sets every cell when the previous frame does not match in length', () => {
    const target = recordingTarget();

    applyFrame(target, [1, 1], [1]);

    expect(target.setFeatureState).toHaveBeenCalledTimes(2);
  });

  it('updates the source it is given', () => {
    const target = recordingTarget();

    applyFrame(target, [2], undefined, 'trip-cells');

    expect(target.setFeatureState).toHaveBeenCalledWith(
      { source: 'trip-cells', id: 0 },
      { level: 2 },
    );
  });

  it('takes a MapLibre map as its target', () => {
    expectTypeOf<MapLibreMap>().toExtend<FeatureStateTarget>();
  });
});

describe('washColor', () => {
  it('gives a palette colour at the strength the map paints it, for legend swatches', () => {
    expect(washColor(riskInfo('moderate').color)).toBe('rgba(239, 189, 60, 0.45)');
  });
});
