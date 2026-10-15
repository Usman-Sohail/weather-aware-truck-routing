import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataCredits } from './DataCredits';

describe('DataCredits', () => {
  it('credits the weather and routing data, with the weather licence', () => {
    render(<DataCredits />);

    expect(screen.getByRole('link', { name: /^Open-Meteo\.com/ })).toHaveAttribute(
      'href',
      'https://open-meteo.com/',
    );
    expect(screen.getByRole('link', { name: /^CC BY 4\.0/ })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(screen.getByRole('link', { name: /^TomTom/ })).toHaveAttribute(
      'href',
      'https://www.tomtom.com/',
    );
  });

  it('opens each credit in a new tab, so the plan stays open, and says so', () => {
    render(<DataCredits />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
      expect(link).toHaveAccessibleName(/\(opens in a new tab\)$/);
    }
  });
});
