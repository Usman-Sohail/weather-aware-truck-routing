import type { RiskGlyph as Glyph } from '../lib/risk';

/**
 * Road-sign shapes for the risk levels, so each level stays recognisable without colour:
 * circle (Low), warning diamond (Moderate), triangle (High), octagon (Severe),
 * prohibition sign (No Travel) and a dashed circle for a missing forecast.
 */
export function RiskGlyph({ glyph, size = 14 }: { glyph: Glyph; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      data-glyph={glyph}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      {glyph === 'circle' && <circle cx="8" cy="8" r="5.5" />}
      {glyph === 'diamond' && <path d="M8 1.75 14.25 8 8 14.25 1.75 8Z" />}
      {glyph === 'triangle' && <path d="M8 2 14.5 13.5h-13Z" />}
      {glyph === 'octagon' && (
        <path d="M5.5 1.9h5l3.6 3.6v5l-3.6 3.6h-5l-3.6-3.6v-5Z" fill="currentColor" />
      )}
      {glyph === 'prohibited' && (
        <>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M3.9 3.9l8.2 8.2" />
        </>
      )}
      {glyph === 'question' && <circle cx="8" cy="8" r="5.5" strokeDasharray="2 2" />}
    </svg>
  );
}
