import { describe, expect, it } from 'vitest';
import { revealScrollTop } from './useRevealCurrentRow.ts';

describe('revealScrollTop', () => {
  const view = { scrollTop: 100, clientHeight: 200 };

  it('keeps the scroll position when the row is already in view', () => {
    expect(revealScrollTop(view, { top: 150, height: 20 })).toBe(100);
  });

  it('scrolls up just far enough to show a row above the view', () => {
    expect(revealScrollTop(view, { top: 40, height: 20 })).toBe(40);
  });

  it('scrolls down just far enough to show a row below the view', () => {
    expect(revealScrollTop(view, { top: 380, height: 20 })).toBe(200);
  });

  it('aligns the top of a row taller than the view', () => {
    expect(revealScrollTop(view, { top: 400, height: 300 })).toBe(400);
  });

  it('keeps a row clear of a sticky header of `headerOffset` pixels', () => {
    // Visible below the header: 130 … 300.
    expect(revealScrollTop(view, { top: 150, height: 20 }, 30)).toBe(100);
    expect(revealScrollTop(view, { top: 110, height: 20 }, 30)).toBe(80);
    expect(revealScrollTop(view, { top: 380, height: 20 }, 30)).toBe(200);
  });
});
