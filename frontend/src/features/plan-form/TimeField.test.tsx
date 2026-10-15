import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TimeField } from './TimeField';

const SLOTS = ['06:00', '06:15', '06:30', '06:45'];

function Harness({ onChange }: { onChange: (time: string) => void }) {
  const [value, setValue] = useState('06:15');
  return (
    <TimeField
      value={value}
      slots={SLOTS}
      onChange={(time) => {
        setValue(time);
        onChange(time);
      }}
      invalid={false}
      describedBy="hint"
    />
  );
}

function renderField(onChange = vi.fn()) {
  render(<Harness onChange={onChange} />);
  return { onChange, field: screen.getByLabelText('Time') };
}

describe('TimeField', () => {
  it('shows the time the way the rest of the app writes it', () => {
    const { field } = renderField();

    expect(field).toHaveValue('6:15 AM');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the departure times when the field is clicked', async () => {
    const user = userEvent.setup();
    const { field } = renderField();

    await user.click(field);

    expect(screen.getByRole('listbox', { name: 'Departure time' })).toBeVisible();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '6:00 AM',
      '6:15 AM',
      '6:30 AM',
      '6:45 AM',
    ]);
    expect(screen.getByRole('option', { name: '6:15 AM' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('takes the time a driver picks from the list', async () => {
    const user = userEvent.setup();
    const { onChange, field } = renderField();

    await user.click(field);
    await user.click(screen.getByRole('option', { name: '6:45 AM' }));

    expect(onChange).toHaveBeenCalledWith('06:45');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('walks the list with the arrow keys and takes one with Enter', async () => {
    const user = userEvent.setup();
    const { onChange, field } = renderField();

    field.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('06:30');
  });

  it('closes the list on Escape without changing the time', async () => {
    const user = userEvent.setup();
    const { onChange, field } = renderField();

    await user.click(field);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes a typed time as soon as it can be read', async () => {
    const user = userEvent.setup();
    const { onChange, field } = renderField();

    await user.clear(field);
    await user.type(field, '6:45 pm');

    expect(onChange).toHaveBeenLastCalledWith('18:45');
  });

  it('keeps what is typed on screen until the field is left', async () => {
    const user = userEvent.setup();
    const { field } = renderField();

    await user.clear(field);
    await user.type(field, 'quarter past');
    expect(field).toHaveValue('quarter past');

    await user.tab();

    expect(field).toHaveValue('6:15 AM');
  });
});
