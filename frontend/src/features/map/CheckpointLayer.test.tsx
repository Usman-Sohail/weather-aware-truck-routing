import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeMap } from '../../test/fakeMap';
import type { RouteView } from '../results/model';
import { testRoute } from '../results/testRoutes';
import { CHECKPOINT_LAYER_IDS, CHECKPOINT_SOURCE_ID, checkpointFeatures } from './checkpoints';
import { CheckpointLayer } from './CheckpointLayer';
import { ROUTE_LABEL_LAYER_ID, ROUTE_LAYER_IDS } from './routeLayers';
import { TripMapContext } from './useTripMap';

const popups = vi.hoisted(() => {
  // Mounts its content in the page like MapLibre's popup, and closes like its × button.
  class FakePopup {
    static instances: FakePopup[] = [];
    readonly options: unknown;
    lngLat: unknown = null;
    removed = false;
    private content: Element | null = null;
    private closeListener: (() => void) | null = null;

    constructor(options: unknown) {
      this.options = options;
      FakePopup.instances.push(this);
    }

    setLngLat(lngLat: unknown) {
      this.lngLat = lngLat;
      return this;
    }

    setDOMContent(node: Element) {
      this.content = node;
      return this;
    }

    addTo() {
      if (this.content) document.body.append(this.content);
      return this;
    }

    on(type: string, listener: () => void) {
      if (type === 'close') this.closeListener = listener;
      return { unsubscribe: () => (this.closeListener = null) };
    }

    close() {
      this.closeListener?.();
      this.remove();
    }

    remove() {
      this.removed = true;
      this.content?.remove();
      return this;
    }
  }
  return { FakePopup };
});

vi.mock('maplibre-gl', () => ({ Popup: popups.FakePopup }));

const ROUTES = [
  testRoute('B', 1, 50, ['low', 'severe', 'low']),
  testRoute('A', 2, 60, ['low', 'low']),
];

type Props = Parameters<typeof CheckpointLayer>[0];

function renderLayer(map: FakeMap, props: Partial<Props> = {}) {
  const layer = (next: Partial<Props>) => (
    <TripMapContext value={map.asMap()}>
      <CheckpointLayer routes={ROUTES} selectedRouteId="B" timeZone="America/Denver" {...next} />
    </TripMapContext>
  );
  const view = render(layer(props));
  return { ...view, update: (next: Partial<Props>) => view.rerender(layer(next)) };
}

function clickCheckpoint(map: FakeMap, checkpointId: string) {
  act(() => {
    map.fire('click', CHECKPOINT_LAYER_IDS.circles, {
      features: [{ properties: { checkpointId } }],
    });
  });
}

function latestPopup() {
  return popups.FakePopup.instances.at(-1);
}

beforeEach(() => {
  popups.FakePopup.instances = [];
});

describe('CheckpointLayer', () => {
  it('draws the checkpoints over the route lines and under their letters', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);

    renderLayer(map);

    const labels = ROUTE_LAYER_IDS.indexOf(ROUTE_LABEL_LAYER_ID);
    expect(map.layerIds).toEqual([
      ...ROUTE_LAYER_IDS.slice(0, labels),
      CHECKPOINT_LAYER_IDS.circles,
      CHECKPOINT_LAYER_IDS.labels,
      ...ROUTE_LAYER_IDS.slice(labels),
    ]);
    expect(map.getSource(CHECKPOINT_SOURCE_ID)?.setData).toHaveBeenLastCalledWith(
      checkpointFeatures(ROUTES, 'B'),
    );
  });

  it('brings the selected route’s checkpoints forward', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { update } = renderLayer(map);

    update({ selectedRouteId: 'A' });

    expect(map.getSource(CHECKPOINT_SOURCE_ID)?.setData).toHaveBeenLastCalledWith(
      checkpointFeatures(ROUTES, 'A'),
    );
  });

  it('opens the details of a clicked checkpoint in a popup at its place', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    renderLayer(map);

    clickCheckpoint(map, 'B-1');

    expect(screen.getByRole('heading', { name: 'Route B, mile 25' })).toBeVisible();
    expect(latestPopup()?.lngLat).toEqual([-100, 40]);
    expect(latestPopup()?.options).toMatchObject({ maxWidth: 'none' });
  });

  it('moves the popup to the next checkpoint clicked', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    renderLayer(map);
    clickCheckpoint(map, 'B-1');

    clickCheckpoint(map, 'A-0');

    expect(popups.FakePopup.instances.filter((popup) => !popup.removed)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Route A, mile 0' })).toBeVisible();
  });

  it('forgets the popup once it is closed', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    renderLayer(map);
    clickCheckpoint(map, 'B-1');

    act(() => latestPopup()?.close());

    expect(screen.queryByRole('heading', { name: 'Route B, mile 25' })).not.toBeInTheDocument();
  });

  it('closes the popup when a new plan or assessment replaces the routes', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { update } = renderLayer(map);
    clickCheckpoint(map, 'B-1');

    update({ routes: ROUTES.map((route): RouteView => ({ ...route })) });

    expect(latestPopup()?.removed).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Route B, mile 25' })).not.toBeInTheDocument();
  });

  it('takes its layers and listeners off the map when it goes', () => {
    const map = new FakeMap(ROUTE_LAYER_IDS);
    const { unmount } = renderLayer(map);

    unmount();

    expect(map.layerIds).toEqual(ROUTE_LAYER_IDS);
    expect(map.getSource(CHECKPOINT_SOURCE_ID)).toBeUndefined();
    expect(map.listenerCount).toBe(0);
  });
});
