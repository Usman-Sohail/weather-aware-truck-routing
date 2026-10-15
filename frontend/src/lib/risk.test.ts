import { describe, expect, it } from 'vitest';

import { RISK_LEVELS, UNKNOWN_RISK, riskFromIndex, riskInfo } from './risk';

describe('risk levels', () => {
  it('are ordered from Low to No Travel with the validated palette', () => {
    expect(RISK_LEVELS.map((level) => [level.key, level.label, level.color])).toEqual([
      ['low', 'Low', '#d3eccd'],
      ['moderate', 'Moderate', '#efbd3c'],
      ['high', 'High', '#e2772a'],
      ['severe', 'Severe', '#bf2f2c'],
      ['no_travel', 'No Travel', '#4f1a55'],
    ]);
    expect(RISK_LEVELS.map((level) => level.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('pair each fill with the text colour that keeps labels readable', () => {
    const inks = Object.fromEntries(RISK_LEVELS.map((level) => [level.key, level.ink]));

    expect(inks).toEqual({
      low: 'dark',
      moderate: 'dark',
      high: 'dark',
      severe: 'light',
      no_travel: 'light',
    });
    expect(UNKNOWN_RISK.ink).toBe('dark');
  });

  it('look up by API key and by heatmap index', () => {
    expect(riskInfo('severe').label).toBe('Severe');
    expect(riskInfo('unknown')).toBe(UNKNOWN_RISK);
    expect(riskFromIndex(4).key).toBe('no_travel');
    expect(riskFromIndex(null)).toBe(UNKNOWN_RISK);
  });

  it('give every level a distinct road-sign glyph', () => {
    const glyphs = [...RISK_LEVELS, UNKNOWN_RISK].map((level) => level.glyph);

    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
