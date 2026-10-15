import { act, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_BOUNDS, MAP_STYLE_URL } from './mapStyle';
import { ROUTE_LAYER_IDS, ROUTE_SOURCE_ID, routeBounds, routeFeatures } from './routeLayers';
import type { MapRoute } from './routeLayers';
import { TripMap } from './TripMap';
import type { TripMapProps } from './TripMap';
import { useTripMap } from './useTripMap';

const fakes = vi.hoisted(() => {
  type Listener = (event?: unknown) => void;

  class FakeGeoJSONSource {
    readonly setData = vi.fn();
  }

  class FakeMap {
    static instances: FakeMap[] = [];
    readonly options: Record<string, unknown>;
    readonly canvas = document.createElement('canvas');
    readonly sources = new Map<string, FakeGeoJSONSource>();
    readonly layerIds: string[] = [];
    readonly addControl = vi.fn();
    readonly fitBounds = vi.fn();
    readonly remove = vi.fn();
    readonly touchZoomRotate = { disableRotation: vi.fn() };
    readonly keyboard = { disableRotation: vi.fn() };
    private listeners: { type: string; layers: string[] | null; listener: Listener }[] = [];

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeMap.instances.push(this);
    }

    on(type: string, ...rest: [Listener] | [string[], Listener]) {
      const entry =
        rest.length === 1
          ? { type, layers: null, listener: rest[0] }
          : { type, layers: rest[0], listener: rest[1] };
      this.listeners.push(entry);
      return {
        unsubscribe: () => {
          this.listeners = this.listeners.filter((item) => item !== entry);
        },
      };
    }

    layersListenedTo(type: string) {
      return this.listeners.find((item) => item.type === type)?.layers;
    }

    fire(type: string, event?: unknown) {
      for (const item of this.listeners.filter((candidate) => candidate.type === type)) {
        item.listener(event);
      }
    }

    addSource(id: string) {
      this.sources.set(id, new FakeGeoJSONSource());
    }

    addLayer(layer: { id: string }) {
      this.layerIds.push(layer.id);
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    getCanvas() {
      return this.canvas;
    }
  }

  class FakeNavigationControl {
    readonly options: unknown;

    constructor(options: unknown) {
      this.options = options;
    }
  }

  return { FakeMap, FakeNavigationControl };
});

vi.mock('./maplibreWorker', () => ({}));

vi.mock('maplibre-gl', () => ({
  Map: fakes.FakeMap,
  NavigationControl: fakes.FakeNavigationControl,
}));

type FakeMap = InstanceType<typeof fakes.FakeMap>;

const ROUTE_A: MapRoute = {
  id: 'A',
  geometry: [
    [-104.99, 39.74],
    [-87.63, 41.88],
  ],
};
const ROUTE_B: MapRoute = {
  id: 'B',
  geometry: [
    [-104.99, 39.74],
    [-94.58, 39.1],
    [-87.63, 41.88],
  ],
};
const ROUTE_C: MapRoute = {
  id: 'C',
  geometry: [
    [-122.42, 37.77],
    [-111.89, 40.76],
  ],
};

const PLAN = { routes: [ROUTE_A, ROUTE_B], planKey: 'plan-1', selectedRouteId: 'B' };
const NEXT_PLAN = { routes: [ROUTE_C], planKey: 'plan-2', selectedRouteId: 'C' };
const NO_PLAN = { routes: [], planKey: null, selectedRouteId: null };

function renderTripMap(props: Partial<TripMapProps> = {}) {
  const baseline: TripMapProps = { ...NO_PLAN, onSelectRoute: vi.fn(), ...props };
  const view = render(<TripMap {...baseline} />);
  return {
    ...view,
    update: (next: Partial<TripMapProps>) => view.rerender(<TripMap {...baseline} {...next} />),
  };
}

function liveMap(): FakeMap {
  const live = fakes.FakeMap.instances.filter((map) => map.remove.mock.calls.length === 0);
  const [map] = live;
  if (!map || live.length > 1) throw new Error(`Expected one live map, found ${live.length}`);
  return map;
}

function loadMap(): FakeMap {
  const map = liveMap();
  act(() => map.fire('load'));
  return map;
}

function routeSourceOf(map: FakeMap) {
  const source = map.sources.get(ROUTE_SOURCE_ID);
  if (!source) throw new Error('The route source was never added');
  return source;
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  }));
}

function CheckpointLayer() {
  const map = useTripMap();
  useEffect(() => {
    map?.addLayer({ id: 'checkpoints', type: 'circle', source: ROUTE_SOURCE_ID });
  }, [map]);
  return <p>{map ? 'Drawing checkpoints' : 'Waiting for the map'}</p>;
}

beforeEach(() => {
  fakes.FakeMap.instances = [];
  stubReducedMotion(false);
});

describe('TripMap', () => {
  it('opens a flat map of the US with zoom buttons and compact credits', () => {
    renderTripMap();
    const map = liveMap();

    expect(map.options).toMatchObject({
      style: MAP_STYLE_URL,
      bounds: INITIAL_BOUNDS,
      attributionControl: { compact: true },
      dragRotate: false,
      touchPitch: false,
      maxPitch: 0,
      locale: { 'Map.Title': 'Map of the planned routes' },
    });
    expect(map.options.container).toBeInstanceOf(HTMLElement);
    expect(map.addControl).toHaveBeenCalledWith(
      expect.objectContaining({ options: { showCompass: false } }),
    );
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(map.keyboard.disableRotation).toHaveBeenCalled();
  });

  it('keeps the same map as the trip changes', () => {
    const { update } = renderTripMap();
    loadMap();

    update(PLAN);
    update({ ...PLAN, selectedRouteId: 'A' });
    update(NEXT_PLAN);

    expect(fakes.FakeMap.instances).toHaveLength(1);
  });

  it('adds the routes once the basemap style has loaded', () => {
    renderTripMap(PLAN);
    const map = liveMap();

    expect(map.sources.size).toBe(0);
    expect(map.layerIds).toEqual([]);

    act(() => map.fire('load'));

    expect(map.layerIds).toEqual(ROUTE_LAYER_IDS);
    expect(routeSourceOf(map).setData).toHaveBeenLastCalledWith(routeFeatures(PLAN.routes, 'B'));
  });

  it('fits each new plan into view', () => {
    const { update } = renderTripMap(PLAN);
    const map = loadMap();

    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      routeBounds(PLAN.routes),
      expect.objectContaining({
        padding: { top: 48, right: 48, bottom: 48, left: 48 },
        animate: true,
      }),
    );

    update(NEXT_PLAN);

    expect(routeSourceOf(map).setData).toHaveBeenLastCalledWith(
      routeFeatures(NEXT_PLAN.routes, 'C'),
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      routeBounds(NEXT_PLAN.routes),
      expect.objectContaining({ padding: { top: 48, right: 48, bottom: 48, left: 48 } }),
    );
  });

  it('keeps the routes clear of whatever covers an edge of the map when it fits', () => {
    renderTripMap({ ...PLAN, coveredEdges: () => ({ bottom: 200 }) });
    const map = loadMap();

    expect(map.fitBounds).toHaveBeenLastCalledWith(
      routeBounds(PLAN.routes),
      expect.objectContaining({ padding: { top: 48, right: 48, bottom: 248, left: 48 } }),
    );
  });

  it('keeps the view when only the selected route changes', () => {
    const { update } = renderTripMap(PLAN);
    const map = loadMap();

    update({ ...PLAN, selectedRouteId: 'A' });

    expect(routeSourceOf(map).setData).toHaveBeenLastCalledWith(routeFeatures(PLAN.routes, 'A'));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('clears the routes between plans and fits the next one', () => {
    const { update } = renderTripMap(PLAN);
    const map = loadMap();

    update(NO_PLAN);

    expect(routeSourceOf(map).setData).toHaveBeenLastCalledWith(routeFeatures([], null));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    update(PLAN);

    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('moves straight to a new plan for viewers who prefer reduced motion', () => {
    stubReducedMotion(true);
    renderTripMap(PLAN);
    const map = loadMap();

    expect(map.fitBounds).toHaveBeenLastCalledWith(
      routeBounds(PLAN.routes),
      expect.objectContaining({ animate: false }),
    );
  });

  it('selects the route clicked on the map', () => {
    const onSelectRoute = vi.fn();
    const { update } = renderTripMap({ ...PLAN, onSelectRoute });
    const map = loadMap();

    expect(map.layersListenedTo('click')).toEqual(ROUTE_LAYER_IDS);

    act(() => map.fire('click', { features: [{ properties: { routeId: 'A', selected: false } }] }));

    expect(onSelectRoute).toHaveBeenCalledExactlyOnceWith('A');

    const latestOnSelectRoute = vi.fn();
    update({ ...PLAN, onSelectRoute: latestOnSelectRoute });
    act(() => map.fire('click', { features: [{ properties: { routeId: 'B', selected: true } }] }));

    expect(latestOnSelectRoute).toHaveBeenCalledExactlyOnceWith('B');
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
  });

  it('shows a pointer over the routes', () => {
    renderTripMap(PLAN);
    const map = loadMap();

    expect(map.layersListenedTo('mouseenter')).toEqual(ROUTE_LAYER_IDS);

    act(() => map.fire('mouseenter'));
    expect(map.canvas.style.cursor).toBe('pointer');

    act(() => map.fire('mouseleave'));
    expect(map.canvas.style.cursor).toBe('');
  });

  it('lends the map to its children once the basemap style has loaded', () => {
    render(
      <TripMap {...NO_PLAN} onSelectRoute={vi.fn()}>
        <CheckpointLayer />
      </TripMap>,
    );

    expect(screen.getByText('Waiting for the map')).toBeInTheDocument();

    const map = loadMap();

    expect(screen.getByText('Drawing checkpoints')).toBeInTheDocument();
    expect(map.layerIds).toEqual([...ROUTE_LAYER_IDS, 'checkpoints']);
  });

  it('removes the map when it unmounts', () => {
    const { unmount } = renderTripMap();
    const map = liveMap();

    unmount();

    expect(map.remove).toHaveBeenCalled();
  });

  it('leaves one working map when StrictMode mounts it twice', () => {
    render(
      <StrictMode>
        <TripMap {...PLAN} onSelectRoute={vi.fn()}>
          <CheckpointLayer />
        </TripMap>
      </StrictMode>,
    );
    const [discarded] = fakes.FakeMap.instances;
    const map = liveMap();

    act(() => discarded?.fire('load'));

    expect(discarded?.remove).toHaveBeenCalled();
    expect(discarded?.layerIds).toEqual([]);
    expect(screen.getByText('Waiting for the map')).toBeInTheDocument();

    act(() => map.fire('load'));

    expect(screen.getByText('Drawing checkpoints')).toBeInTheDocument();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });
});
