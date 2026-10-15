import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { readable } from '../../test/text';
import type { Recommendation } from '../../types/api';
import { RouteComparison } from './RouteComparison';
import { testRoute } from './testRoutes';

const ROUTES = [
  testRoute('B', 1, 1000, ['low', 'low', 'moderate', 'low', 'low'], { low: 750, moderate: 250 }),
  testRoute('A', 2, 800, ['low', 'high', 'high', 'low', 'low'], { low: 500, high: 300 }),
  testRoute('C', 3, 500, ['low', 'low', 'low'], { low: 500 }),
];

const CLEAR: Recommendation = {
  route_id: 'B',
  status: 'clear',
  decided_by: 'high_miles',
  tied_on: [],
  explanation: 'Route B has fewer High miles than Route A (0 vs 300).',
};

describe('RouteComparison', () => {
  it('offers each route as a choice, best first, with what sets it apart', () => {
    render(
      <RouteComparison routes={ROUTES} recommendation={CLEAR} selectedId="B" onSelect={() => {}} />,
    );

    const choices = screen.getAllByRole('radio');
    expect(choices.map((choice) => readable(choice.getAttribute('aria-label')))).toEqual([
      'Route B: 1,000 mi in 13 h 53 min. Recommended. 250 mi Moderate.',
      'Route A: 800 mi in 11 h 07 min. 300 mi High.',
      'Route C: 500 mi in 6 h 57 min. Low risk the whole way.',
    ]);
    expect(choices[0]).toBeChecked();
    expect(screen.getByText('Recommended')).toBeVisible();
    expect(screen.getByText('300 mi High')).toBeVisible();
    expect(screen.getByText('Low risk the whole way')).toBeVisible();
  });

  it('reports the route the driver picks', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <RouteComparison routes={ROUTES} recommendation={CLEAR} selectedId="B" onSelect={onSelect} />,
    );

    await user.click(screen.getByText('300 mi High'));

    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('draws every route on one mile scale, so lengths compare at a glance', () => {
    const { container } = render(
      <RouteComparison routes={ROUTES} recommendation={CLEAR} selectedId="B" onSelect={() => {}} />,
    );

    const widths = [...container.querySelectorAll<HTMLElement>('[data-ribbon]')].map(
      (ribbon) => ribbon.style.width,
    );
    expect(widths).toEqual(['100%', '80%', '50%']);
    expect(screen.getByText('0 mi')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('keys the colours to the risk levels', () => {
    render(
      <RouteComparison routes={ROUTES} recommendation={CLEAR} selectedId="B" onSelect={() => {}} />,
    );

    const legend = screen.getByRole('list', { name: 'Risk levels' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Low', 'Moderate', 'High', 'Severe', 'No Travel', 'No forecast']);
  });

  it('calls the best route only the least risky when none avoids No Travel', () => {
    const recommendation: Recommendation = { ...CLEAR, status: 'no_safe_route' };
    render(
      <RouteComparison
        routes={ROUTES}
        recommendation={recommendation}
        selectedId="B"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('Least risky')).toBeVisible();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Route B: .*\. Least risky\./ })).toBeChecked();
  });

  it('names the stretch under the pointer in a tooltip', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RouteComparison routes={ROUTES} recommendation={CLEAR} selectedId="B" onSelect={() => {}} />,
    );
    const stretches = [...container.querySelectorAll<HTMLElement>('[data-ribbon="A"] > *')];
    expect(stretches).toHaveLength(3);
    const high = stretches[1] as HTMLElement;

    await user.hover(high);

    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip).toHaveTextContent('High');
    expect(tooltip).toHaveTextContent('Miles 100 to 500');
    expect(high).not.toHaveAttribute('title');

    await user.unhover(high);

    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });
});
