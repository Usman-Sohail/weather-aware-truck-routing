import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { readable } from '../../test/text';
import { HeatmapLegend } from './HeatmapLegend';

describe('HeatmapLegend', () => {
  it('names every risk level from Low to No Travel, then the cells without a forecast', () => {
    render(<HeatmapLegend approxCellMi={17} />);

    const levels = screen.getByRole('list', { name: 'Weather risk' });
    expect(
      within(levels)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Low', 'Moderate', 'High', 'Severe', 'No Travel', 'No forecast']);
  });

  it('shows each colour as the map washes it, leaving the meaning to the labels', () => {
    const { container } = render(<HeatmapLegend approxCellMi={17} />);

    const swatches = container.querySelectorAll('li > [aria-hidden="true"]');
    expect(swatches).toHaveLength(6);
    expect(swatches[1]).toHaveStyle({ backgroundColor: 'rgba(239, 189, 60, 0.45)' });
    expect(swatches[5]).toHaveAttribute('data-hatched');
  });

  it('gives the size of the grid in whole miles', () => {
    const { rerender } = render(<HeatmapLegend approxCellMi={17.3} />);

    expect(readable(screen.getByText(/^Grid/).textContent)).toBe('Grid ≈ 17 mi');

    rerender(<HeatmapLegend approxCellMi={6.9} />);

    expect(readable(screen.getByText(/^Grid/).textContent)).toBe('Grid ≈ 7 mi');
  });
});
