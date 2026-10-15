import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { readable } from '../../test/text';
import { ForecastSlider } from './ForecastSlider';

// Wednesday 8:15 PM in Denver (MDT).
const DEPARTURE = '2026-10-15T02:15:00Z';

function SliderWithState({
  initialHour,
  onChange,
  maxHour,
}: {
  initialHour: number;
  onChange: (hour: number) => void;
  maxHour?: number;
}) {
  const [hour, setHour] = useState(initialHour);
  return (
    <ForecastSlider
      hour={hour}
      onChange={(next) => {
        onChange(next);
        setHour(next);
      }}
      departureUtc={DEPARTURE}
      timeZone="America/Denver"
      maxHour={maxHour}
    />
  );
}

async function renderFocused(initialHour: number, maxHour?: number) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<SliderWithState initialHour={initialHour} onChange={onChange} maxHour={maxHour} />);
  await user.tab();
  const slider = screen.getByRole('slider', { name: 'Forecast hour' });
  expect(slider).toHaveFocus();
  return { user, slider, reported: () => onChange.mock.calls.map(([hour]) => hour) };
}

describe('ForecastSlider', () => {
  it('shows the hour after departure, the local time and the forecast hour', () => {
    render(
      <ForecastSlider
        hour={6}
        onChange={() => {}}
        departureUtc={DEPARTURE}
        timeZone="America/Denver"
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Forecast hour' });
    expect(slider).toHaveValue('6');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '48');
    expect(slider).toHaveAttribute('step', '1');
    expect(readable(slider.getAttribute('aria-valuetext'))).toBe(
      'Departure plus 6 hours, Thursday 2:15 AM MDT, forecast for 2 AM to 3 AM',
    );
    expect(screen.getByText('Departure + 6 h')).toBeVisible();
    expect(screen.getByText('Thu, 2:15 AM MDT')).toBeVisible();
    expect(screen.getByText('Forecast for 2 AM to 3 AM')).toBeVisible();
  });

  it('marks every 12 hours along the track', () => {
    const { container } = render(
      <ForecastSlider
        hour={0}
        onChange={() => {}}
        departureUtc={DEPARTURE}
        timeZone="America/Denver"
      />,
    );

    const ticks = [...container.querySelectorAll<HTMLElement>('[data-tick]')];
    expect(ticks.map((tick) => readable(tick.textContent))).toEqual([
      '0 h',
      '12 h',
      '24 h',
      '36 h',
      '48 h',
    ]);
    expect(ticks.map((tick) => tick.style.left)).toEqual(['0%', '25%', '50%', '75%', '100%']);
  });

  it('steps one hour with the arrow keys and six with Page Up and Page Down', async () => {
    const { user, slider, reported } = await renderFocused(6);

    await user.keyboard('{ArrowRight}{ArrowUp}{ArrowLeft}{ArrowDown}{PageUp}{PageDown}{PageDown}');

    expect(reported()).toEqual([7, 8, 7, 6, 12, 6, 0]);
    expect(slider).toHaveValue('0');
    expect(readable(slider.getAttribute('aria-valuetext'))).toBe(
      'Departure, Wednesday 8:15 PM MDT, forecast for 8 PM to 9 PM',
    );
  });

  it('stops at 48 hours', async () => {
    const { user, slider, reported } = await renderFocused(45);

    await user.keyboard('{PageUp}{PageUp}{ArrowRight}{End}');

    expect(reported()).toEqual([48]);
    expect(slider).toHaveValue('48');
    expect(screen.getByText('Departure + 48 h')).toBeVisible();
  });

  it('stops at departure', async () => {
    const { user, slider, reported } = await renderFocused(3);

    await user.keyboard('{PageDown}{ArrowLeft}{ArrowDown}{Home}');

    expect(reported()).toEqual([0]);
    expect(slider).toHaveValue('0');
    expect(screen.getByText('Departure')).toBeVisible();
  });

  it('jumps to either end with Home and End', async () => {
    const { user, reported } = await renderFocused(20);

    await user.keyboard('{End}{Home}');

    expect(reported()).toEqual([48, 0]);
  });

  it('can end before 48 hours', async () => {
    const { user, slider, reported } = await renderFocused(28, 30);

    await user.keyboard('{PageUp}{End}');

    expect(reported()).toEqual([30]);
    expect(slider).toHaveAttribute('max', '30');
    expect(screen.queryByText('36 h')).not.toBeInTheDocument();
  });

  it('reports the hour the thumb is dragged to', () => {
    const onChange = vi.fn();
    render(
      <ForecastSlider
        hour={6}
        onChange={onChange}
        departureUtc={DEPARTURE}
        timeZone="America/Denver"
      />,
    );

    fireEvent.change(screen.getByRole('slider', { name: 'Forecast hour' }), {
      target: { value: '30' },
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(30);
  });
});
