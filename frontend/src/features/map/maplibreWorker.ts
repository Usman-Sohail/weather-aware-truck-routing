import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre looks for its worker beside its own file, which Vite's bundling moves.
setWorkerUrl(workerUrl);
