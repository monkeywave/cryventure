import { describe, expect, it, vi } from 'vitest';
import { scrollToHeadingAnchor } from './anchorScroll.ts';

function fakeWindow(hash: string, navigationType = 'navigate') {
  const heading = { scrollIntoView: vi.fn() };
  const getElementById = vi.fn((id: string) => (id === 'how-it-works' ? heading : null));
  const win = {
    location: { hash },
    document: { getElementById },
    performance: { getEntriesByType: () => [{ type: navigationType }] },
  } as unknown as Window;
  return { win, heading, getElementById };
}

describe('scrollToHeadingAnchor', () => {
  it('scrolls to the heading named before the lab state', () => {
    const { win, heading } = fakeWindow('#how-it-works&lab=a&s=3&v=1');
    scrollToHeadingAnchor(win);
    expect(heading.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('leaves a plain heading hash to the browser', () => {
    const { win, getElementById } = fakeWindow('#how-it-works');
    scrollToHeadingAnchor(win);
    expect(getElementById).not.toHaveBeenCalled();
  });

  it('tolerates an unknown heading id', () => {
    const { win } = fakeWindow('#gone&lab=a&v=1');
    expect(() => scrollToHeadingAnchor(win)).not.toThrow();
  });

  it.each(['reload', 'back_forward'])('keeps the restored scroll position on %s', (type) => {
    const { win, heading } = fakeWindow('#how-it-works&lab=a&v=1', type);
    scrollToHeadingAnchor(win);
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });
});
