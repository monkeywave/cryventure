import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overflowsBox, useScrollFocusable } from './useScrollRegion.ts';

/** Every render's `focusable` value, in order. */
let seen: boolean[] = [];

function Region({ text = 'content' }: { text?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusable = useScrollFocusable(ref);
  seen.push(focusable);
  return (
    <div ref={ref} data-testid="region" tabIndex={focusable ? 0 : undefined}>
      <span>{text}</span>
    </div>
  );
}

function stubBox(scrollWidth: number, clientWidth: number, scrollHeight = 100, clientHeight = 100) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

/** Stands in for the browser's ResizeObserver (jsdom has none); `resizeAll` fires every observer. */
let observers: (() => void)[] = [];
class FakeResizeObserver {
  constructor(callback: (entries: ResizeObserverEntry[]) => void) {
    observers.push(() => callback([]));
  }
  observe() {}
  disconnect() {}
}
const resizeAll = () => act(() => observers.forEach((callback) => callback()));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  seen = [];
  observers = [];
});

describe('overflowsBox', () => {
  it('is true only when the content is wider or taller than the box', () => {
    const fits = { scrollWidth: 200, clientWidth: 200, scrollHeight: 100, clientHeight: 100 };
    expect(overflowsBox(fits)).toBe(false);
    expect(overflowsBox({ ...fits, scrollWidth: 300 })).toBe(true);
    expect(overflowsBox({ ...fits, scrollHeight: 400 })).toBe(true);
  });
});

describe('useScrollFocusable', () => {
  // The initial state is also what the server renders (effects do not run there), so SSR HTML is focusable too.
  it('starts focusable, so the first render is keyboard-reachable before anything is measured', () => {
    stubBox(200, 200);
    render(<Region />);
    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('stays focusable when the region overflows vertically', () => {
    stubBox(200, 200, 400, 100);
    const { getByTestId } = render(<Region />);
    expect(getByTestId('region').getAttribute('tabindex')).toBe('0');
  });

  it('stays focusable when the region overflows horizontally', () => {
    stubBox(300, 200);
    const { getByTestId } = render(<Region />);
    expect(getByTestId('region').getAttribute('tabindex')).toBe('0');
  });

  it('leaves the tab order once measured as fitting, before any paint', () => {
    stubBox(200, 200);
    const { getByTestId } = render(<Region />);
    // Rendering flushes layout effects synchronously: no passive effect or observer needed.
    expect(getByTestId('region').hasAttribute('tabindex')).toBe(false);
  });

  it('re-measures when the region or its content resizes', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    stubBox(200, 200);
    const { getByTestId, rerender } = render(<Region text="short" />);
    expect(getByTestId('region').hasAttribute('tabindex')).toBe(false);
    stubBox(300, 200);
    rerender(<Region text="a much longer content" />);
    resizeAll();
    expect(getByTestId('region').getAttribute('tabindex')).toBe('0');
  });

  it('does not measure on a re-render without a resize (no forced layout per commit)', () => {
    stubBox(200, 200);
    const { getByTestId, rerender } = render(<Region text="short" />);
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(300);
    scrollWidth.mockClear();
    rerender(<Region text="longer" />);
    expect(scrollWidth).not.toHaveBeenCalled();
    expect(getByTestId('region').hasAttribute('tabindex')).toBe(false);
  });
});
