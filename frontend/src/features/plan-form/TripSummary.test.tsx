import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TripSummary } from './TripSummary';
import type { Trip } from './validation';

const TRIP: Trip = {
  origin: {
    name: 'Denver, CO, United States',
    lat: 39.74,
    lon: -104.99,
    country_code: 'US',
    time_zone: 'America/Denver',
  },
  destination: {
    name: 'Chicago, IL, United States',
    lat: 41.88,
    lon: -87.63,
    country_code: 'US',
    time_zone: 'America/Chicago',
  },
  departureLocal: '2026-10-14T18:45',
  loadLb: 42000,
  intervalMi: 25,
};

describe('TripSummary', () => {
  it('summarises the trip in one glance', () => {
    render(
      <TripSummary trip={TRIP} onEdit={() => {}} now={() => new Date('2026-10-14T20:00:00Z')} />,
    );

    expect(screen.getByText('Denver, CO')).toBeVisible();
    expect(screen.getByText('Chicago, IL')).toBeVisible();
    expect(
      screen.getByText('Departs Wed, 6:45 PM MDT. 42,000 lb of cargo, weather every 25 mi.'),
    ).toBeVisible();
  });

  it('keeps the check interval on one line with its unit', () => {
    render(<TripSummary trip={TRIP} onEdit={() => {}} />);

    expect(screen.getByRole('group', { name: 'Trip summary' }).textContent).toContain(
      'weather every 25\u00a0mi.',
    );
  });

  it('offers to edit the trip', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<TripSummary trip={TRIP} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'Edit trip' }));

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
