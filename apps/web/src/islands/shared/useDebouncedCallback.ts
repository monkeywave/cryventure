import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function that calls the latest `callback` once `delayMs` passed without another call
 * (with the last call's arguments). A call still waiting when the component unmounts is dropped.
 */
export function useDebouncedCallback<Args extends unknown[]>(callback: (...args: Args) => void, delayMs: number): (...args: Args) => void {
  const latest = useRef(callback);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (...args: Args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), delayMs);
    },
    [delayMs],
  );
}
