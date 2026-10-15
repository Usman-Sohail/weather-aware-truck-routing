import type { Feature, FeatureCollection, Point } from 'geojson';
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

import { RISK_LEVELS, UNKNOWN_RISK, riskInfo } from '../../lib/risk';
import type { RiskKey } from '../../types/api';
import type { CheckpointView, RouteView } from '../results/model';
import { LABEL_FONT, MAP_COLORS } from './mapStyle';

export const CHECKPOINT_SOURCE_ID = 'checkpoints';

export const CHECKPOINT_LAYER_IDS = {
  circles: 'checkpoint-circles',
  labels: 'checkpoint-labels',
} as const;

export interface CheckpointProperties {
  checkpointId: string;
  routeId: string;
  level: RiskKey;
  levelIndex: number;
  selected: boolean;
  label: string;
}

const NO_FORECAST_INDEX = -1;

export function checkpointFeatures(
  routes: RouteView[],
  selectedRouteId: string | null,
): FeatureCollection<Point, CheckpointProperties> {
  const features = routes
    .flatMap((route) =>
      route.checkpoints.map((checkpoint, index) => ({
        checkpoint,
        routeId: route.id,
        selected: route.id === selectedRouteId,
        // A stretch at one level is named once, where it starts, so labels do not pile up.
        startsStretch:
          checkpoint.assessment.level !== route.checkpoints[index - 1]?.assessment.level,
      })),
    )
    // Ids follow route order, so they stay put when the selection changes, and start at 1
    // because MapLibre's feature queries ignore the state of a feature whose id is 0.
    .map((entry, index) => checkpointFeature({ ...entry, id: index + 1 }))
    // MapLibre draws a layer's features in data order, so later ones sit on top.
    .sort(
      (a, b) =>
        Number(a.properties.selected) - Number(b.properties.selected) ||
        a.properties.levelIndex - b.properties.levelIndex,
    );
  return { type: 'FeatureCollection', features };
}

function checkpointFeature({
  checkpoint,
  routeId,
  selected,
  startsStretch,
  id,
}: {
  checkpoint: CheckpointView;
  routeId: string;
  selected: boolean;
  startsStretch: boolean;
  id: number;
}): Feature<Point, CheckpointProperties> {
  const { level } = checkpoint.assessment;
  const info = riskInfo(level);
  const levelIndex = info.index ?? NO_FORECAST_INDEX;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [checkpoint.lon, checkpoint.lat] },
    properties: {
      checkpointId: checkpoint.id,
      routeId,
      level,
      levelIndex,
      selected,
      label: selected && startsStretch && levelIndex > 0 ? info.label : '',
    },
  };
}

const LOW_RADIUS_PX = 4;
const RADIUS_STEP_PX = 1;
const STROKE_WIDTH_PX = 1;
const OTHER_ROUTE_SCALE = 0.6;
const OTHER_ROUTE_OPACITY = 0.55;
const LABEL_SIZE_PX = 12;
const LABEL_GAP_PX = 3;

// Sizes above are for zoom 6, where a long trip fills the map; zoom 3 shows the whole
// country and zoom 12 a town.
const ZOOM_SCALES: [zoom: number, scale: number][] = [
  [3, 0.6],
  [6, 1],
  [12, 1.6],
];

function zoomScaled(
  valueAt: (scale: number) => number | ExpressionSpecification,
): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...ZOOM_SCALES.flatMap(([zoom, scale]) => [zoom, valueAt(scale)]),
  ];
}

const isSelected: ExpressionSpecification = ['get', 'selected'];

// No forecast (-1) is drawn at Low's size.
const radiusAtZoom6: ExpressionSpecification = [
  '*',
  ['case', isSelected, 1, OTHER_ROUTE_SCALE],
  ['+', LOW_RADIUS_PX, ['*', RADIUS_STEP_PX, ['max', ['get', 'levelIndex'], 0]]],
];

const colorByLevel: ExpressionSpecification = [
  'step',
  ['get', 'levelIndex'],
  UNKNOWN_RISK.color,
  ...RISK_LEVELS.flatMap((level) => [level.index ?? NO_FORECAST_INDEX, level.color]),
];

const opacity: ExpressionSpecification = ['case', isSelected, 1, OTHER_ROUTE_OPACITY];

export function checkpointLayers(
  sourceId = CHECKPOINT_SOURCE_ID,
): [CircleLayerSpecification, SymbolLayerSpecification] {
  return [
    {
      id: CHECKPOINT_LAYER_IDS.circles,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-color': colorByLevel,
        'circle-radius': zoomScaled((scale) => ['*', scale, radiusAtZoom6]),
        'circle-opacity': opacity,
        'circle-stroke-color': MAP_COLORS.ink,
        'circle-stroke-width': zoomScaled((scale) => scale * STROKE_WIDTH_PX),
        'circle-stroke-opacity': opacity,
      },
    },
    {
      id: CHECKPOINT_LAYER_IDS.labels,
      type: 'symbol',
      source: sourceId,
      filter: ['!=', ['get', 'label'], ''],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': LABEL_FONT,
        'text-size': LABEL_SIZE_PX,
        // Diagonal, so labels stay off routes running east-west or north-south.
        'text-variable-anchor': ['bottom-left', 'top-right'],
        'text-radial-offset': zoomScaled((scale) => [
          '/',
          ['+', ['*', scale, radiusAtZoom6], scale * STROKE_WIDTH_PX + LABEL_GAP_PX],
          LABEL_SIZE_PX,
        ]),
        // Lower keys are placed first, so the worst levels keep their labels in a collision.
        'symbol-sort-key': ['-', ['get', 'levelIndex']],
      },
      paint: {
        'text-color': MAP_COLORS.ink,
        'text-halo-color': MAP_COLORS.halo,
        'text-halo-width': 1.5,
      },
    },
  ];
}
