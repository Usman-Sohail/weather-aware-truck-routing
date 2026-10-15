import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Calls made within one animation frame collapse into a single `callback(latest)` on the
 * next frame, so dragging the slider redraws the map once a frame rather than once per
 * input event. The returned function never changes and always calls the latest `callback`.
 */
export function useFrameCallback<T>(callback: (value: T) => void): (value: T) => void {
  const latestCallback = useRef(callback);
  const pending = useRef<{ value: T } | null>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    latestCallback.current = callback;
  });

  useEffect(
    () => () => {
      if (pending.current) cancelAnimationFrame(frame.current);
      pending.current = null;
    },
    [],
  );

  return useCallback((value: T) => {
    const scheduled = pending.current !== null;
    pending.current = { value };
    if (scheduled) return;
    // Marked pending before the request, so a frame that runs at once still clears it.
    frame.current = requestAnimationFrame(() => {
      const latest = pending.current;
      pending.current = null;
      if (latest) latestCallback.current(latest.value);
    });
  }, []);
}
