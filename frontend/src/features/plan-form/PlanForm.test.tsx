import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { PlaceCandidate } from '../../types/api';
import { PlanForm } from './PlanForm';
import type { PlaceSearch } from './PlaceField';

const DENVER: PlaceCandidate = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};
const CHICAGO: PlaceCandidate = {
  name: 'Chicago, IL, United States',
  lat: 41.88,
  lon: -87.63,
  country_code: 'US',
  time_zone: 'America/Chicago',
};
// 12:00 in Denver.
const NOW = new Date('2026-10-15T18:00:00Z');

const search: PlaceSearch = (query) =>
  Promise.resolve(query.toLowerCase().startsWith('den') ? [DENVER] : [CHICAGO]);

function renderForm(props: Partial<Parameters<typeof PlanForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <PlanForm onSubmit={onSubmit} apiError={null} now={() => NOW} search={search} {...props} />,
  );
  return { onSubmit };
}

async function choosePlaces(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
  await screen.findByDisplayValue(DENVER.name);
  await user.type(screen.getByLabelText('Destination'), 'Chicago{Enter}');
  await screen.findByDisplayValue(CHICAGO.name);
}

describe('PlanForm', () => {
  it('shows what is missing and focuses the first problem', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Compare routes' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a starting place from the matches.')).toBeVisible();
    expect(screen.getByText('Choose a destination from the matches.')).toBeVisible();
    expect(screen.getByText('Enter the cargo weight in pounds.')).toBeVisible();
    expect(screen.getByLabelText('Starting place')).toHaveFocus();
  });

  it('defaults the departure to the next quarter hour at the starting place', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
    await screen.findByDisplayValue(DENVER.name);

    expect(screen.getByLabelText('Time')).toHaveValue('12:15');
    expect(screen.getByRole('radio', { name: 'Thursday, October 15' })).toBeChecked();
    expect(screen.getByText(/Local time in Denver \(MDT\)/)).toBeVisible();
  });

  it('offers today and the seven days the API accepts', () => {
    renderForm();

    const days = screen.getAllByRole('radio', { name: /, October / });

    expect(days).toHaveLength(8);
    expect(days[0]).toBeChecked();
    expect(screen.getByText('Today')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Thursday, October 22' })).toBeVisible();
  });

  it('keeps the time when the driver picks another day', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await choosePlaces(user);
    await user.type(screen.getByLabelText('Cargo weight'), '42000');
    await user.click(screen.getByRole('radio', { name: 'Saturday, October 17' }));
    await user.click(screen.getByRole('button', { name: 'Compare routes' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ departureLocal: '2026-10-17T12:15' }),
    );
  });

  it('submits a complete trip', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await choosePlaces(user);
    await user.type(screen.getByLabelText('Cargo weight'), '42,000');
    await user.click(screen.getByRole('radio', { name: '10 mi' }));
    await user.click(screen.getByRole('button', { name: 'Compare routes' }));

    expect(onSubmit).toHaveBeenCalledWith({
      origin: DENVER,
      destination: CHICAGO,
      departureLocal: '2026-10-15T12:15',
      loadLb: 42000,
      intervalMi: 10,
    });
  });

  it('keeps a departure the driver chose when the starting place changes', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('radio', { name: 'Friday, October 16' }));
    const time = screen.getByLabelText('Time');
    await user.selectOptions(time, '06:30');
    await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
    await screen.findByDisplayValue(DENVER.name);

    expect(time).toHaveValue('06:30');
    expect(screen.getByRole('radio', { name: 'Friday, October 16' })).toBeChecked();
  });

  it('shows API field errors next to their fields until the field is edited', async () => {
    const user = userEvent.setup();
    const apiError = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', {
      load_lb: ['Ensure this value is less than or equal to 80000.'],
      non_field_errors: ['Origin and destination must be different places.'],
    });
    renderForm({ apiError });

    expect(screen.getByText('Ensure this value is less than or equal to 80000.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Origin and destination must be different places.',
    );

    await user.type(screen.getByLabelText('Cargo weight'), '1');

    expect(
      screen.queryByText('Ensure this value is less than or equal to 80000.'),
    ).not.toBeInTheDocument();
  });

  it('takes only digits and thousands separators as the cargo weight', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Cargo weight'), 'abc42,0x00 lb');

    expect(screen.getByLabelText('Cargo weight')).toHaveValue('42,000');
  });
});
