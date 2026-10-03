// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.ts';

/** A controllable `(prefers-reduced-motion: reduce)` media query list. */
function fakeMediaQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
  };
  const matchMedia = vi.fn(() => list as unknown as MediaQueryList);
  vi.stubGlobal('matchMedia', matchMedia);
  const change = (matches: boolean) => {
    list.matches = matches;
    for (const listener of [...listeners]) listener();
  };
  return { list, listeners, matchMedia, change };
}

afterEach(() => vi.unstubAllGlobals());

describe('usePrefersReducedMotion', () => {
  it('reads the initial preference from the reduced-motion media query', () => {
    const { matchMedia } = fakeMediaQuery(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('is false when the reader does not ask for reduced motion', () => {
    fakeMediaQuery(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });

  it('follows change events live', () => {
    const { change } = fakeMediaQuery(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    act(() => change(true));
    expect(result.current).toBe(true);
    act(() => change(false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes from the media query on unmount', () => {
    const { list, listeners } = fakeMediaQuery(false);
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(listeners.size).toBe(1);
    const [listener] = listeners;
    unmount();
    expect(list.removeEventListener).toHaveBeenCalledWith('change', listener);
    expect(listeners.size).toBe(0);
  });

  it('is false without matchMedia (old browsers, test environments)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
});
