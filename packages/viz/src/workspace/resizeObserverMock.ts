/** Test helper: a controllable ResizeObserver for jsdom (which has none). */
export interface ResizeObserverMock {
  /** Fires the callbacks observing `element` with a new content width. */
  resize(element: Element, width: number): void;
  /** Number of currently observed elements. */
  observed(): number;
  restore(): void;
}

type Callback = (entries: { target: Element; contentRect: { width: number } }[]) => void;

export function installResizeObserverMock(): ResizeObserverMock {
  const original = globalThis.ResizeObserver;
  const targets = new Map<Element, Callback>();
  class MockResizeObserver {
    constructor(private readonly callback: Callback) {}
    observe(element: Element): void {
      targets.set(element, this.callback);
    }
    unobserve(element: Element): void {
      targets.delete(element);
    }
    disconnect(): void {
      for (const [element, callback] of targets) if (callback === this.callback) targets.delete(element);
    }
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  return {
    resize: (element, width) => targets.get(element)?.([{ target: element, contentRect: { width } }]),
    observed: () => targets.size,
    restore: () => {
      globalThis.ResizeObserver = original;
    },
  };
}
