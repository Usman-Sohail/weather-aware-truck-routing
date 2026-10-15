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

describe('DepartureField', () => {
  it('names the month once, where the days begin', () => {
    expect(renderField('2026-10-15')).toEqual([
      'TodayOct 15',
      'Fri16',
      'Sat17',
      'Sun18',
      'Mon19',
      'Tue20',
      'Wed21',
      'Thu22',
    ]);
  });

  it('names the month again when the days cross into it', () => {
    expect(renderField('2026-10-29')).toEqual([
      'TodayOct 29',
      'Fri30',
      'Sat31',
      'SunNov 1',
      'Mon2',
      'Tue3',
      'Wed4',
      'Thu5',
    ]);
  });

  it('spells the whole date for screen readers', () => {
    renderField('2026-10-29');

    expect(screen.getByRole('radio', { name: 'Sunday, November 1' })).toBeVisible();
  });
});
