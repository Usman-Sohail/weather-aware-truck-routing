import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../lib/api';
import type { RoutesResponse } from '../../types/api';
import { PlanStatus } from './PlanStatus';
import type { PlanState } from './usePlanTrip';

const IDLE: PlanState = {
  status: 'idle',
  step: null,
  trip: null,
  plan: null,
  assessment: null,
  error: null,
};

describe('PlanStatus', () => {
  it('shows nothing before a plan starts', () => {
    const { container } = render(<PlanStatus state={IDLE} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the steps and marks the current one', () => {
    render(<PlanStatus state={{ ...IDLE, status: 'working', step: 'forecast' }} />);

    const steps = screen.getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Finding truck routes (done)',
      'Getting the forecast along each route',
      'Assessing weather risk',
    ]);
    expect(steps[0]).toHaveAttribute('data-state', 'done');
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[2]).toHaveAttribute('data-state', 'waiting');
  });

  it('says why a plan failed and what to try', () => {
    const error = new ApiError(422, 'NO_ROUTE', 'No truck route was found between these places.');

    render(<PlanStatus state={{ ...IDLE, status: 'failed', error }} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No truck route was found between these places.',
    );
  });

  it('points to the form for validation errors instead of repeating them', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Ensure this value is less than 80000.', {
      load_lb: ['Ensure this value is less than 80000.'],
    });

    render(<PlanStatus state={{ ...IDLE, status: 'failed', error }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields.');
  });

  it('notes notices from the routing provider when the plan is done', () => {
    const plan = {
      notices: [
        { code: 'FEWER_ROUTES', message: 'Only 2 distinct routes were found for this trip.' },
      ],
    } as RoutesResponse;

    render(<PlanStatus state={{ ...IDLE, status: 'done', plan }} />);

    expect(screen.getByText('Only 2 distinct routes were found for this trip.')).toBeVisible();
  });
});
