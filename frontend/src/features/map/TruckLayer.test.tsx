import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeMap } from '../../test/fakeMap';
import type { LonLat } from '../../types/api';
import { ROUTE_LAYER_IDS } from './routeLayers';
import { TRUCK_LAYER_IDS, TRUCK_SOURCE_ID, truckPositions } from './trucks';
import { TruckLayer } from './TruckLayer';
import { TripMapContext } from './useTripMap';

const ROUTES = [
  { id: 'A', hourly_positions: [[-105, 39.7], [-104, 39.8], null] as (LonLat | null)[] },
  {
    id: 'B',
    hourly_positions: [
      [-105, 39.7],
      [-104.5, 40],
      [-104, 40.2],
    ] as (LonLat | null)[],
  },
];

type Props = Parameters<typeof TruckLayer>[0];

function renderLayer(map: FakeMap, props: Partial<Props> = {}) {
  const layer = (next: Partial<Props>) => (
    <TripMapContext value={map.asMap()}>
      <TruckLayer routes={ROUTES} hour={0} selectedRouteId="A" {...next} />
    </TripMapContext>
  );
  const view = render(layer(props));
  return { ...view, update: (next: Partial<Props>) => view.rerender(layer(next)) };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('TruckLayer', () => {
  it('draws the trucks above everything else on the map', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);

    renderLayer(map);

    expect(map.layerIds).toEqual([...ROUTE_LAYER_IDS, ...TRUCK_LAYER_IDS]);
    expect(map.getSource(TRUCK_SOURCE_ID)?.setData).toHaveBeenLastCalledWith(
      truckPositions(ROUTES, 0, 'A'),
    );
  });

  it('moves the trucks to the chosen hour and follows the selected route', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { update } = renderLayer(map);

    update({ hour: 2, selectedRouteId: 'B' });

    expect(map.getSource(TRUCK_SOURCE_ID)?.setData).toHaveBeenLastCalledWith(
      truckPositions(ROUTES, 2, 'B'),
    );
  });

  it('takes its layers off the map when it goes', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { unmount } = renderLayer(map);

    unmount();

    expect(map.layerIds).toEqual(ROUTE_LAYER_IDS);
    expect(map.getSource(TRUCK_SOURCE_ID)).toBeUndefined();
  });
});
