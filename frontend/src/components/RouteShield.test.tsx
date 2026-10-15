import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteShield } from './RouteShield';

describe('RouteShield', () => {
  it('is announced as the route it labels', () => {
    render(<RouteShield id="B" />);

    expect(screen.getByRole('img', { name: 'Route B' })).toHaveTextContent('B');
  });

  it('stays silent when the route is already named in text', () => {
    const { container } = render(<RouteShield id="C" decorative />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
