import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_BREAKPOINT_PX, isCompactWidth, useCompactContainer } from './useContainerWidth.ts';
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

function CompactProbe({ onRender }: { onRender: () => void }) {
  const [ref, compact] = useCompactContainer<HTMLDivElement>();
  onRender();
  return <div ref={ref} data-testid="compact">{String(compact)}</div>;
}

describe('useCompactContainer', () => {
  let mock: ResizeObserverMock;
  afterEach(() => {
    mock.restore();
    vi.restoreAllMocks();
  });

  it('starts wide, flips at the breakpoint and ignores resizes on the same side', () => {
    mock = installResizeObserverMock();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0 } as DOMRect);
    const onRender = vi.fn();
    const { getByTestId, unmount } = render(<CompactProbe onRender={onRender} />);
    const probe = getByTestId('compact');
    expect(probe.textContent).toBe('false');
    act(() => mock.resize(probe, 390));
    expect(probe.textContent).toBe('true');
    const renders = onRender.mock.calls.length;
    act(() => mock.resize(probe, 400));
    expect(onRender.mock.calls.length).toBe(renders);
    act(() => mock.resize(probe, COMPACT_BREAKPOINT_PX));
    expect(probe.textContent).toBe('false');
    unmount();
    expect(mock.observed()).toBe(0);
  });
});
