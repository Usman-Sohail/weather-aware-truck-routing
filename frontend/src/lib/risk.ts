import type { RiskKey } from '../types/api';

/**
 * Presentation of the risk levels. Colour is never the only cue: every level also has a
 * text label and a road-sign glyph, so it reads in greyscale and for colour-blind viewers.
 *
 * The palette steps get darker from Low to No Travel (so the map reads as an ordered
 * scale) and was checked for colour-vision separation between every pair of levels.
 * Low is deliberately pale so calm stretches recede; its marks carry an outline.
 */
export type RiskGlyph = 'circle' | 'diamond' | 'triangle' | 'octagon' | 'prohibited' | 'question';

export interface RiskLevelInfo {
  key: RiskKey;
  label: string;
  /** Position on the 0-4 scale used by route metrics and heatmap frames; null when unknown. */
  index: number | null;
  color: string;
  /** Text colour that stays readable on ``color``. */
  ink: 'dark' | 'light';
  glyph: RiskGlyph;
}

export const RISK_LEVELS: readonly RiskLevelInfo[] = [
  { key: 'low', label: 'Low', index: 0, color: '#d3eccd', ink: 'dark', glyph: 'circle' },
  { key: 'moderate', label: 'Moderate', index: 1, color: '#efbd3c', ink: 'dark', glyph: 'diamond' },
  { key: 'high', label: 'High', index: 2, color: '#e2772a', ink: 'dark', glyph: 'triangle' },
  { key: 'severe', label: 'Severe', index: 3, color: '#bf2f2c', ink: 'light', glyph: 'octagon' },
  {
    key: 'no_travel',
    label: 'No Travel',
    index: 4,
    color: '#4f1a55',
    ink: 'light',
    glyph: 'prohibited',
  },
];

export const UNKNOWN_RISK: RiskLevelInfo = {
  key: 'unknown',
  label: 'No forecast',
  index: null,
  color: '#c5ccd0',
  ink: 'dark',
  glyph: 'question',
};

export function riskInfo(key: RiskKey): RiskLevelInfo {
  return RISK_LEVELS.find((level) => level.key === key) ?? UNKNOWN_RISK;
}

export function riskFromIndex(index: number | null): RiskLevelInfo {
  return index === null ? UNKNOWN_RISK : (RISK_LEVELS[index] ?? UNKNOWN_RISK);
}
