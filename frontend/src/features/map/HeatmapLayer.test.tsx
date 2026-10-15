import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeMap } from '../../test/fakeMap';
import type { Corridor } from '../../types/api';
import {
  cellPolygons,
  HATCH_IMAGE_ID,
  HEATMAP_FILL_LAYER_ID,
  HEATMAP_HATCH_LAYER_ID,
  HEATMAP_SOURCE_ID,
} from './heatmap';
import { HeatmapLayer } from './HeatmapLayer';
import { ROUTE_LAYER_IDS } from './routeLayers';
import { TripMapContext } from './useTripMap';

const CORRIDOR: Corridor = {
  step_lat_deg: 0.1,
  step_lon_deg: 0.13,
  approx_cell_mi: 7,
  cells: [
    [-105, 39.7],
    [-104.87, 39.7],
    [-104.74, 39.7],
  ],
  first_location_index: 0,
};

const FRAMES = [
  [0, 1, null],
  [0, 2, null],
  [3, 2, 0],
];

type Props = Parameters<typeof HeatmapLayer>[0];

function renderLayer(map: FakeMap, props: Partial<Props> = {}) {
  const layer = (next: Partial<Props>) => (
    <TripMapContext value={map.asMap()}>
      <HeatmapLayer corridor={CORRIDOR} frames={FRAMES} hour={0} {...next} />
    </TripMapContext>
  );
  const view = render(layer(props));
  return { ...view, update: (next: Partial<Props>) => view.rerender(layer(next)) };
}

function levels(map: FakeMap, cells: number) {
  return Array.from(
    { length: cells },
    (_, id) =>
      (map.featureStates.get(`${HEATMAP_SOURCE_ID}:${id}`) as { level: number | null } | undefined)
        ?.level,
  );
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('HeatmapLayer', () => {
  it('lays the corridor under the routes, hatching cells without a forecast', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);

    renderLayer(map);

    expect(map.images.has(HATCH_IMAGE_ID)).toBe(true);
    expect(map.layerIds).toEqual([
      HEATMAP_HATCH_LAYER_ID,
      HEATMAP_FILL_LAYER_ID,
      ...ROUTE_LAYER_IDS,
    ]);
    expect(map.getSource(HEATMAP_SOURCE_ID)?.setData).toHaveBeenCalledWith(cellPolygons(CORRIDOR));
  });

  it('shows the chosen hour, touching only the cells that change', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { update } = renderLayer(map);
    expect(levels(map, 3)).toEqual([0, 1, null]);
    map.setFeatureState.mockClear();

    update({ hour: 1 });

    expect(map.setFeatureState).toHaveBeenCalledTimes(1);
    expect(levels(map, 3)).toEqual([0, 2, null]);
  });

  it('starts each new plan from a clean slate', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { update } = renderLayer(map, { hour: 2 });
    const corridor = { ...CORRIDOR, cells: CORRIDOR.cells.slice(0, 1) };

    update({ corridor, frames: [[1], [1], [4]], hour: 2 });

    expect(map.removeFeatureState).toHaveBeenCalledWith({ source: HEATMAP_SOURCE_ID });
    expect([...map.featureStates.values()]).toEqual([{ level: 4 }]);
  });

  it('takes its layers off the map when it goes', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { unmount } = renderLayer(map);

    unmount();

    expect(map.layerIds).toEqual(ROUTE_LAYER_IDS);
    expect(map.getSource(HEATMAP_SOURCE_ID)).toBeUndefined();
  });
});
