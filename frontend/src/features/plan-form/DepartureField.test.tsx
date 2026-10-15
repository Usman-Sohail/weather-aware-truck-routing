import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DepartureField } from './DepartureField';

function renderField(today: string, value = `${today}T08:00`) {
  render(
    <DepartureField
      value={value}
      days={8}
      today={today}
      earliestToday="00:00"
      onChange={vi.fn()}
      invalid={false}
      describedBy="departure-hint"
    />,
  );
  return screen.getAllByRole('radio').map((day) => day.closest('label')?.textContent ?? '');
}

function months(): string[] {
  return screen
    .getAllByRole('radiogroup')
    .flatMap((group) => [...group.querySelectorAll('p')].map((name) => name.textContent ?? ''));
}

describe('DepartureField', () => {
  it('gathers the days under the month they belong to', () => {
    const days = renderField('2026-10-15');

    expect(months()).toEqual(['October']);
    expect(days).toEqual([
      'Today15',
      'Fri16',
      'Sat17',
      'Sun18',
      'Mon19',
      'Tue20',
      'Wed21',
      'Thu22',
    ]);
  });

  it('starts a new month where the days cross into it', () => {
    const days = renderField('2026-10-29');

    expect(months()).toEqual(['October', 'November']);
    expect(days).toEqual(['Today29', 'Fri30', 'Sat31', 'Sun1', 'Mon2', 'Tue3', 'Wed4', 'Thu5']);
  });

  it('names the year as well once the days reach another one', () => {
    renderField('2026-12-29');

    expect(months()).toEqual(['December', 'January 2027']);
  });

  it('spells the whole date for screen readers', () => {
    renderField('2026-10-29');

    expect(screen.getByRole('radio', { name: 'Sunday, November 1' })).toBeVisible();
  });
});
