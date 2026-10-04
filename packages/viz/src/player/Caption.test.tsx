import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../viz.css';
import { vizMessages } from '../i18n/messages.ts';
import { LabLayoutProvider } from '../lab/LabLayout.tsx';
import { createFixtureBundle, fixtureMessages } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { Caption } from './Caption.tsx';

const live = () => document.querySelector('[aria-live="polite"]');

function renderCaption(narrow: boolean, messages = fixtureMessages) {
  return renderLab(
    <LabLayoutProvider narrow={narrow}>
      <Caption />
    </LabLayoutProvider>,
    { bundle: createFixtureBundle(), messages },
  );
}

/** jsdom does no layout: pretend the caption text needs `scrollHeight` px but shows only 40. */
function fakeTextHeight(scrollHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
}

afterEach(() => vi.restoreAllMocks());

describe('Caption', () => {
  it('renders nothing on wide labs', () => {
    renderCaption(false);
    expect(screen.queryByRole('group', { name: 'Narration' })).toBeNull();
    expect(live()).toBeNull();
  });

  it('narrates the initial hint, then the current step, in one polite live region', () => {
    const { store } = renderCaption(true);
    expect(screen.getByRole('group', { name: 'Narration' })).toBeTruthy();
    expect(live()?.textContent).toBe('This is the initial state. Press Play or step forward to begin.');
    act(() => store.getState().seek(1));
    expect(live()?.textContent).toBe('Substitute 2 bytes');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('wraps long unbroken runs (a hex digest) inside the caption instead of widening the page', () => {
    renderCaption(true);
    const text = live() as HTMLElement;
    expect(text.classList.contains('cv-caption__text')).toBe(true);
    expect(getComputedStyle(text).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(text).maxWidth).toBe('100%');
    expect(getComputedStyle(text.closest('.cv-caption') as HTMLElement).minWidth).toBe('0px');
  });

  it('renders German', () => {
    renderCaption(true, { ...vizMessages.de, ...fixtureMessages });
    expect(screen.getByRole('group', { name: 'Erläuterung' })).toBeTruthy();
    expect(live()?.textContent).toContain('Ausgangszustand');
  });

  it('hides the toggle while the text fits', () => {
    fakeTextHeight(40);
    renderCaption(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers an accessible toggle for clamped text that expands and collapses it', async () => {
    fakeTextHeight(120);
    renderCaption(true);
    const toggle = screen.getByRole('button', { name: 'Show full text' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(live()?.id);
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
    expect(live()?.getAttribute('data-expanded')).toBe('true');
  });

  it('raises caret exponents in the narration', () => {
    const { store } = renderCaption(true, { ...fixtureMessages, 'fixture.narration.sub': 'a^{{count}} and b^{k}' });
    act(() => store.getState().seek(1));
    expect(live()?.textContent).toBe('a² and bk');
    expect(live()?.querySelector('sup')?.textContent).toBe('k');
  });
});
