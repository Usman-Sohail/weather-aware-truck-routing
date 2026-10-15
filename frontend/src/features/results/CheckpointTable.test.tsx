import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { readable } from '../../test/text';
import { CheckpointTable } from './CheckpointTable';
import { testCheckpoint, testRoute } from './testRoutes';

const ROUTE = {
  ...testRoute('A', 1, 50, ['low', 'severe', 'low']),
  checkpoints: [
    testCheckpoint('A', 0, 0, 'low'),
    testCheckpoint('A', 1, 25, 'severe', {
      weather: { gust_mph: 41, wind_mph: 24, rain_in_hr: 0.02, snow_in_hr: 0 },
      reasons: ['Gust 41 mph with 42,000 lb load → Severe (load rule)'],
    }),
    testCheckpoint('A', 2, 50.4, 'low', {
      weather: { gust_mph: 9.5, wind_mph: 4, rain_in_hr: 0.01, snow_in_hr: 0 },
    }),
  ],
};

function rows() {
  const [, ...body] = screen.getAllByRole('row');
  return body.map((row) =>
    within(row)
      .getAllByRole('cell')
      .map((cell) => readable(cell.textContent)),
  );
}

describe('CheckpointTable', () => {
  it('lists where and when the truck meets each forecast, and the risk there', () => {
    render(<CheckpointTable route={ROUTE} timeZone="America/Denver" />);

    expect(screen.getByRole('table', { name: 'Checkpoints on Route A' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Arrives (MDT)' })).toBeVisible();
    expect(rows()).toEqual([
      ['0', 'Wed, 7:15 PM', 'Low', 'Gust 12 mphNo rain or snow'],
      ['25', 'Wed, 8:15 PM', 'Severe', 'Gust 41 mph with 42,000 lb load → Severe (load rule)'],
      ['50', 'Wed, 9:15 PM', 'Low', 'Gust 9.5 mphRain 0.01 in/hr'],
    ]);
  });

  it('can hide Low-risk checkpoints to show only the ones that matter', async () => {
    const user = userEvent.setup();
    render(<CheckpointTable route={ROUTE} timeZone="America/Denver" />);

    await user.click(screen.getByRole('checkbox', { name: 'Hide Low risk' }));

    expect(rows().map(([mile]) => mile)).toEqual(['25']);
    expect(screen.getByText('3 checkpoints, 1 above Low.')).toBeVisible();
  });

  it('says so when every checkpoint is Low and Low is hidden', async () => {
    const user = userEvent.setup();
    render(<CheckpointTable route={testRoute('C', 3, 50, ['low', 'low'])} timeZone="UTC" />);

    await user.click(screen.getByRole('checkbox', { name: 'Hide Low risk' }));

    expect(screen.getByText('Every checkpoint on Route C is Low risk.')).toBeVisible();
  });

  it('names the zone again on rows after a clock change', () => {
    const route = testRoute('A', 1, 25, ['low', 'low']);
    const [first, second] = route.checkpoints;
    if (!first || !second) throw new Error('missing checkpoints');
    first.eta_utc = '2026-11-01T06:30:00Z';
    second.eta_utc = '2026-11-01T09:30:00Z';

    render(<CheckpointTable route={route} timeZone="America/Denver" />);

    expect(screen.getByRole('columnheader', { name: 'Arrives (MDT)' })).toBeVisible();
    expect(rows().map(([, arrives]) => arrives)).toEqual(['Sun, 12:30 AM', 'Sun, 2:30 AM MST']);
  });
});
