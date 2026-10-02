/**
 * Shared Vitest setup for React packages (viz, views): DOM cleanup and the browser APIs
 * jsdom lacks but motion / react-resizable-panels touch.
 */
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function installMatchMedia(): void {
  if (typeof window.matchMedia === 'function') return;
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

installMatchMedia();
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
