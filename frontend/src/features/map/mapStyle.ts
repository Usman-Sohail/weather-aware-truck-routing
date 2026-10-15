// The shared look of the trip map. MapLibre paints with literal colours, so the few it
// needs mirror the design tokens in global.css; risk colours come from lib/risk.ts.

/** OpenFreeMap's light basemap: free, no key, and its credits appear on the map. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** A font the basemap's glyph server provides, for every text label drawn on the map. */
export const LABEL_FONT = ['Noto Sans Bold'];

/**
 * Colours for everything on the map that is not risk. Routes are told apart by dash
 * pattern and letter, so they share ink; the selected route takes the selection blue.
 */
export const MAP_COLORS = {
  /** --color-ink */
  ink: '#1f2a30',
  /** --color-shield-blue, the selection colour used in the results panel */
  selected: '#1e4e8c',
  /** Casing and text halos that keep lines and labels legible over the heatmap. */
  halo: '#ffffff',
} as const;

/** The US and southern Canada, shown until the first plan arrives. */
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-125, 24],
  [-66, 50],
];
