import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AssessResponse, RoutesResponse } from '../../types/api';
import { useResults } from './useResults';

function plan(token: string): RoutesResponse {
  return {
    routes: [
      { id: 'A', provider_index: 0, length_mi: 100, travel_time_s: 6000 },
      { id: 'B', provider_index: 1, length_mi: 120, travel_time_s: 7200 },
    ],
    checkpoints: [],
    plan_token: token,
  } as unknown as RoutesResponse;
}

function assessment(recommendedId: string): AssessResponse {
  return {
    checkpoints: [],
    routes: [
      { id: 'A', rank: recommendedId === 'A' ? 1 : 2 },
      { id: 'B', rank: recommendedId === 'B' ? 1 : 2 },
    ],
    recommendation: { route_id: recommendedId, status: 'clear' },
  } as unknown as AssessResponse;
}

describe('useResults', () => {
  it('has nothing to show until a plan is assessed', () => {
    const { result } = renderHook(() => useResults(plan('one'), null));

    expect(result.current).toBeNull();
  });

  it('opens on the recommended route and follows the driver’s choice', () => {
    const { result } = renderHook(() => useResults(plan('one'), assessment('B')));

    expect(result.current?.routes.map((route) => route.id)).toEqual(['B', 'A']);
    expect(result.current?.recommended?.id).toBe('B');
    expect(result.current?.selected?.id).toBe('B');

    act(() => result.current?.select('A'));

    expect(result.current?.selected?.id).toBe('A');
  });

  it('keeps the choice through a new assessment of the same plan', () => {
    const { result, rerender } = renderHook(({ p, a }) => useResults(p, a), {
      initialProps: { p: plan('one'), a: assessment('B') },
    });
    act(() => result.current?.select('A'));

    rerender({ p: plan('one'), a: assessment('B') });

    expect(result.current?.selected?.id).toBe('A');
  });

  it('opens a new plan on its own recommendation', () => {
    const { result, rerender } = renderHook(({ p, a }) => useResults(p, a), {
      initialProps: { p: plan('one'), a: assessment('B') },
    });
    act(() => result.current?.select('A'));

    rerender({ p: plan('two'), a: assessment('B') });

    expect(result.current?.selected?.id).toBe('B');
  });
});
