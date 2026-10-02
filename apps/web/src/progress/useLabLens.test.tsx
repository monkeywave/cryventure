// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lens } from '@cryventure/core';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function lensProbe() {
  const { useLabLens } = await import('./useLabLens.ts');
  const store = await import('./store.ts');
  function LensProbe({ pinned }: { pinned?: Lens }) {
    return <span data-testid="lens">{useLabLens(pinned)}</span>;
  }
  return { LensProbe, store };
}

describe('useLabLens', () => {
  it('follows the page lens live and defaults to engineer', async () => {
    const { LensProbe, store } = await lensProbe();
    render(<LensProbe />);
    expect(screen.getByTestId('lens').textContent).toBe('engineer');
    act(() => store.setLens('cryptographer'));
    expect(screen.getByTestId('lens').textContent).toBe('cryptographer');
  });

  it('keeps a pinned lens regardless of the page lens', async () => {
    const { LensProbe, store } = await lensProbe();
    render(<LensProbe pinned="story" />);
    act(() => store.setLens('cryptographer'));
    expect(screen.getByTestId('lens').textContent).toBe('story');
  });
});
