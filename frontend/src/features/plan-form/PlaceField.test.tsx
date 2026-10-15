import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { PlaceCandidate } from '../../types/api';
import { PlaceField, type PlaceSearch } from './PlaceField';

const DENVER_CO: PlaceCandidate = {
  name: 'Denver, CO, United States',
  lat: 39.74,
  lon: -104.99,
  country_code: 'US',
  time_zone: 'America/Denver',
};
const DENVER_NC: PlaceCandidate = {
  name: 'Denver, NC, United States',
  lat: 35.53,
  lon: -81.03,
  country_code: 'US',
  time_zone: 'America/New_York',
};

function Harness({
  search,
  onChange = () => {},
  error,
}: {
  search: PlaceSearch;
  onChange?: (place: PlaceCandidate | null) => void;
  error?: string;
}) {
  const [value, setValue] = useState<PlaceCandidate | null>(null);
  return (
    <form>
      <PlaceField
        id="origin"
        label="Starting place"
        value={value}
        onChange={(place) => {
          setValue(place);
          onChange(place);
        }}
        error={error}
        search={search}
      />
      <button type="button">Next field</button>
    </form>
  );
}

describe('PlaceField', () => {
  it('looks up the typed place when the field loses focus and selects the best match', async () => {
    const search = vi.fn().mockResolvedValue([DENVER_CO, DENVER_NC]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness search={search} onChange={onChange} />);

    await user.type(screen.getByLabelText('Starting place'), 'Denver');
    await user.tab();

    expect(search).toHaveBeenCalledWith('Denver', expect.any(AbortSignal));
    await user.click(await screen.findByText('1 other match for “Denver”'));
    expect(screen.getByRole('radio', { name: 'Denver, CO, United States' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(DENVER_CO);
    expect(screen.getByLabelText('Starting place')).toHaveValue('Denver, CO, United States');
  });

  it('lets the driver pick another match', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness search={vi.fn().mockResolvedValue([DENVER_CO, DENVER_NC])} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
    await user.click(await screen.findByText('1 other match for “Denver”'));
    await user.click(screen.getByRole('radio', { name: 'Denver, NC, United States' }));

    expect(onChange).toHaveBeenLastCalledWith(DENVER_NC);
    expect(screen.getByLabelText('Starting place')).toHaveValue('Denver, NC, United States');
  });

  it('does not list choices when there is only one match', async () => {
    const user = userEvent.setup();
    render(<Harness search={vi.fn().mockResolvedValue([DENVER_CO])} />);

    await user.type(screen.getByLabelText('Starting place'), 'Denver, CO{Enter}');

    expect(await screen.findByLabelText('Starting place')).toHaveValue('Denver, CO, United States');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/other match/)).not.toBeInTheDocument();
  });

  it('clears the selection as soon as the text changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness search={vi.fn().mockResolvedValue([DENVER_CO])} onChange={onChange} />);

    await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');
    await screen.findByDisplayValue('Denver, CO, United States');
    await user.type(screen.getByLabelText('Starting place'), 'x');

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('explains when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness search={vi.fn().mockResolvedValue([])} />);

    await user.type(screen.getByLabelText('Starting place'), 'Atlantis{Enter}');

    expect(
      await screen.findByText(
        'No matching place in the US or Canada. Try a city and state, like “Denver, CO”.',
      ),
    ).toBeVisible();
  });

  it('shows why a lookup failed', async () => {
    const user = userEvent.setup();
    const failure = new ApiError(503, 'PROVIDER_RATE_LIMITED', 'The routing service is busy.');
    render(<Harness search={vi.fn().mockRejectedValue(failure)} />);

    await user.type(screen.getByLabelText('Starting place'), 'Denver{Enter}');

    expect(await screen.findByText('The routing service is busy.')).toBeVisible();
  });

  it('waits for at least three characters before searching', async () => {
    const search = vi.fn();
    const user = userEvent.setup();
    render(<Harness search={search} />);

    await user.type(screen.getByLabelText('Starting place'), 'De{Enter}');

    expect(search).not.toHaveBeenCalled();
  });

  it('links a validation error to the input', () => {
    render(<Harness search={vi.fn()} error="Choose a starting place from the matches." />);

    const input = screen.getByLabelText('Starting place');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining('Choose a starting place from the matches.'),
    );
  });
});

describe('PlaceField with a slow search', () => {
  it('ignores a search that returns after the text was edited again', async () => {
    let resolveSearch: (places: PlaceCandidate[]) => void = () => {};
    const search: PlaceSearch = (_query, signal) =>
      new Promise((resolve, reject) => {
        resolveSearch = resolve;
        signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness search={search} onChange={onChange} />);

    await user.type(screen.getByLabelText('Starting place'), 'Denver');
    await user.tab();
    await user.type(screen.getByLabelText('Starting place'), ', NC');
    await act(async () => {
      resolveSearch([DENVER_CO]);
    });

    expect(screen.getByLabelText('Starting place')).toHaveValue('Denver, NC');
    expect(onChange).not.toHaveBeenCalledWith(DENVER_CO);
  });
});
