// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { Lens } from '@cryventure/core';
import { applyLensToDocument } from './lens.ts';
import { useLabLens } from './useLabLens.ts';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.lens;
});

function LensProbe({ pinned }: { pinned?: Lens }) {
  return <span data-testid="lens">{useLabLens(pinned)}</span>;
}

const shownLens = () => screen.getByTestId('lens').textContent;

/** MutationObserver callbacks run as microtasks; flush them inside `act`. */
async function setPageLens(lens: Lens): Promise<void> {
  await act(async () => {
    applyLensToDocument(lens);
    await Promise.resolve();
  });
}

describe('useLabLens', () => {
  it('defaults to engineer while <html> carries no lens', () => {
    render(<LensProbe />);
    expect(shownLens()).toBe('engineer');
  });

  it('starts from the lens the head script already set, and follows it live', async () => {
    applyLensToDocument('story');
    render(<LensProbe />);
    expect(shownLens()).toBe('story');
    await setPageLens('cryptographer');
    expect(shownLens()).toBe('cryptographer');
  });

  it('keeps a pinned lens regardless of the page lens', async () => {
    render(<LensProbe pinned="story" />);
    await setPageLens('cryptographer');
    expect(shownLens()).toBe('story');
  });

  it('renders the default lens on the server', () => {
    applyLensToDocument('cryptographer');
    expect(renderToString(<LensProbe />)).toContain('engineer');
  });
});
