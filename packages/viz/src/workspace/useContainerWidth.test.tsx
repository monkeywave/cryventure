import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_BREAKPOINT_PX, isCompactWidth, useContainerWidth } from './useContainerWidth.ts';
import { installResizeObserverMock, type ResizeObserverMock } from './resizeObserverMock.ts';

describe('isCompactWidth', () => {
  it('is compact only for a measured width under the breakpoint', () => {
    expect(isCompactWidth(390)).toBe(true);
    expect(isCompactWidth(COMPACT_BREAKPOINT_PX)).toBe(false);
    expect(isCompactWidth(1024)).toBe(false);
    expect(isCompactWidth(0)).toBe(false);
    expect(isCompactWidth(undefined)).toBe(false);
    expect(isCompactWidth(500, 400)).toBe(false);
  });
});

function Probe() {
  const [ref, width] = useContainerWidth<HTMLDivElement>();
  return <div ref={ref} data-testid="probe">{String(width)}</div>;
}

describe('useContainerWidth', () => {
  let mock: ResizeObserverMock;
  afterEach(() => {
    mock.restore();
    vi.restoreAllMocks();
  });

  it('reports the initial width and follows resizes until unmounted', () => {
    mock = installResizeObserverMock();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800 } as DOMRect);
    const { getByTestId, unmount } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('800');
    act(() => mock.resize(getByTestId('probe'), 500));
    expect(getByTestId('probe').textContent).toBe('500');
    unmount();
    expect(mock.observed()).toBe(0);
  });
});
