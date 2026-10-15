import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFrameCallback } from './useFrameCallback';

function stubAnimationFrames() {
  const waiting = new Map<number, FrameRequestCallback>();
  let lastId = 0;
  const request = vi.fn((callback: FrameRequestCallback) => {
    lastId += 1;
    waiting.set(lastId, callback);
    return lastId;
  });
  const cancel = vi.fn((id: number) => {
    waiting.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    request,
    cancel,
    drawFrame() {
      const due = [...waiting.values()];
      waiting.clear();
      for (const callback of due) callback(performance.now());
    },
  };
}

describe('useFrameCallback', () => {
  it('collapses the calls made within one frame into one call with the latest value', () => {
    const frames = stubAnimationFrames();
    const callback = vi.fn();
    const { result } = renderHook(() => useFrameCallback(callback));

    result.current(1);
    result.current(2);
    result.current(3);

    expect(callback).not.toHaveBeenCalled();
    expect(frames.request).toHaveBeenCalledTimes(1);
    frames.drawFrame();
    expect(callback).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('calls once in each frame that had calls', () => {
    const frames = stubAnimationFrames();
    const callback = vi.fn();
    const { result } = renderHook(() => useFrameCallback(callback));

    result.current('first');
    frames.drawFrame();
    result.current('second');
    frames.drawFrame();
    frames.drawFrame();

    expect(callback.mock.calls).toEqual([['first'], ['second']]);
  });

  it('cancels the pending frame on unmount', () => {
    const frames = stubAnimationFrames();
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useFrameCallback(callback));

    result.current(5);
    unmount();
    frames.drawFrame();

    expect(frames.cancel).toHaveBeenCalledExactlyOnceWith(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps returning the same function, which calls the latest callback', () => {
    const frames = stubAnimationFrames();
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useFrameCallback(callback), {
      initialProps: { callback: first },
    });
    const schedule = result.current;

    schedule(1);
    rerender({ callback: latest });
    frames.drawFrame();

    expect(result.current).toBe(schedule);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('keeps working when a frame runs at once, as some test doubles do', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const callback = vi.fn();
    const { result } = renderHook(() => useFrameCallback(callback));

    result.current('first');
    result.current('second');

    expect(callback.mock.calls).toEqual([['first'], ['second']]);
  });
});
