// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedCallback } from './useDebouncedCallback.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedCallback', () => {
  it('calls once, with the last arguments, after the delay without further calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 150));
    act(() => result.current('a'));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current('ab'));
    act(() => vi.advanceTimersByTime(149));
    expect(callback).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('ab');
  });

  it('calls the latest callback, not the one from the render that scheduled it', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useDebouncedCallback(callback, 150), { initialProps: { callback: first } });
    act(() => result.current());
    rerender({ callback: second });
    act(() => vi.advanceTimersByTime(150));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('drops a pending call on unmount', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 150));
    act(() => result.current());
    unmount();
    act(() => vi.advanceTimersByTime(150));
    expect(callback).not.toHaveBeenCalled();
  });
});
