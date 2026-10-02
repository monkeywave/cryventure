// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_STORAGE_KEY } from './storage.ts';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function lensProbe() {
  const { useProgress } = await import('./useProgress.ts');
  const store = await import('./store.ts');
  function LensProbe() {
    return <span data-testid="lens">{useProgress((p) => p.lens ?? 'none')}</span>;
  }
  return { LensProbe, store };
}

describe('useProgress', () => {
  it('renders the selected slice and re-renders on updates', async () => {
    const { LensProbe, store } = await lensProbe();
    render(<LensProbe />);
    expect(screen.getByTestId('lens').textContent).toBe('none');
    act(() => store.setLens('story'));
    expect(screen.getByTestId('lens').textContent).toBe('story');
  });

  it('follows writes from another tab', async () => {
    const { LensProbe } = await lensProbe();
    render(<LensProbe />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_STORAGE_KEY, newValue: JSON.stringify({ version: 1, lens: 'cryptographer', lessons: {} }) }));
    });
    expect(screen.getByTestId('lens').textContent).toBe('cryptographer');
  });

  it('renders empty progress on the server', async () => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, lens: 'story', lessons: {} }));
    const { LensProbe } = await lensProbe();
    expect(renderToString(<LensProbe />)).toContain('none');
  });
});
