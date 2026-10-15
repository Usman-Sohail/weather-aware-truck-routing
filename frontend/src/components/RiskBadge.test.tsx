import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RiskBadge } from './RiskBadge';

describe('RiskBadge', () => {
  it('names the level in text and draws its glyph', () => {
    const { container } = render(<RiskBadge level="no_travel" />);

    expect(screen.getByText('No Travel')).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-glyph="prohibited"]')).toBeInTheDocument();
  });

  it('uses readable text on each fill', () => {
    render(
      <>
        <RiskBadge level="severe" />
        <RiskBadge level="moderate" />
      </>,
    );

    expect(screen.getByText('Severe').closest('span')).toHaveStyle({ color: 'rgb(255, 255, 255)' });
    expect(screen.getByText('Moderate').closest('span')).toHaveStyle({
      backgroundColor: 'rgb(239, 189, 60)',
    });
  });

  it('describes a missing forecast instead of showing a level', () => {
    render(<RiskBadge level="unknown" />);

    expect(screen.getByText('No forecast')).toBeVisible();
  });

  it('comes in a small size for tables and legends', () => {
    const { container } = render(<RiskBadge level="high" size="small" />);

    expect(screen.getByText('High')).toHaveAttribute('data-size', 'small');
    expect(container.querySelector('svg')).toHaveAttribute('width', '12');
  });
});
