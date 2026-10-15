import type { Map as MapLibreMap } from 'maplibre-gl';
import { vi } from 'vitest';

type Listener = (event: unknown) => void;

export class FakeSource {
  readonly setData = vi.fn();
}

// A loaded MapLibre map as the layer components use it, recording what they do to it.
export class FakeMap {
  readonly sources = new Map<string, FakeSource>();
  readonly layerIds: string[];
  readonly images = new Set<string>();
  readonly featureStates = new Map<string, unknown>();
  readonly canvas = document.createElement('canvas');
  readonly setFeatureState = vi.fn(
    (feature: { source: string; id: string | number }, state: unknown) => {
      this.featureStates.set(`${feature.source}:${String(feature.id)}`, state);
    },
  );
  readonly removeFeatureState = vi.fn((target: { source: string }) => {
    for (const key of [...this.featureStates.keys()]) {
      if (key.startsWith(`${target.source}:`)) this.featureStates.delete(key);
    }
  });
  readonly setPadding = vi.fn();
  private subscriptions: { type: string; layerId: string; listener: Listener }[] = [];

  constructor(layerIds: readonly string[] = []) {
    this.layerIds = [...layerIds];
  }

  addSource(id: string) {
    this.sources.set(id, new FakeSource());
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  removeSource(id: string) {
    this.sources.delete(id);
  }

  addLayer(layer: { id: string }, beforeId?: string) {
    const index = beforeId === undefined ? -1 : this.layerIds.indexOf(beforeId);
    if (index === -1) this.layerIds.push(layer.id);
    else this.layerIds.splice(index, 0, layer.id);
  }

  getLayer(id: string) {
    return this.layerIds.includes(id) ? { id } : undefined;
  }

  removeLayer(id: string) {
    this.layerIds.splice(this.layerIds.indexOf(id), 1);
  }

  hasImage(id: string) {
    return this.images.has(id);
  }

  addImage(id: string) {
    this.images.add(id);
  }

  getCanvas() {
    return this.canvas;
  }

  on(type: string, layerId: string, listener: Listener) {
    const subscription = { type, layerId, listener };
    this.subscriptions.push(subscription);
    return {
      unsubscribe: () => {
        this.subscriptions = this.subscriptions.filter((item) => item !== subscription);
      },
    };
  }

  fire(type: string, layerId: string, event: unknown = {}) {
    for (const item of this.subscriptions) {
      if (item.type === type && item.layerId === layerId) item.listener(event);
    }
  }

  get listenerCount() {
    return this.subscriptions.length;
  }

  asMap(): MapLibreMap {
    return this as unknown as MapLibreMap;
  }
}
