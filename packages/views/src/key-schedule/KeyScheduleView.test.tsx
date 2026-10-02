import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadViewMessages } from '../messages.ts';
import KeyScheduleView from './KeyScheduleView.tsx';
import { derivationLabels, keyScheduleBundle } from './testFixture.ts';

const view = <KeyScheduleView labId="fixture" lens="engineer" />;

function renderEnglish() {
  return renderLab(view, { bundle: keyScheduleBundle(), messages: { ...loadViewMessages('en'), ...derivationLabels.en } });
}

const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const word = (hex: string) => screen.getByRole('button', { name: new RegExp(`${hex}$`) });

describe('KeyScheduleView', () => {
  it('is styled by cv-keyschedule classes only (no inline styles)', () => {
    renderEnglish();
    expect(document.querySelector('section.cv-keyschedule')).toBeTruthy();
    expect(document.querySelectorAll('.cv-keyschedule__row')).toHaveLength(11);
    expect(document.querySelectorAll('button.cv-keyschedule__word')).toHaveLength(44);
    expect(document.querySelectorAll('.cv-keyschedule [style]')).toHaveLength(0);
  });

  it('lists 11 round keys of 4 focusable words', () => {
    renderEnglish();
    const rounds = within(screen.getByRole('region', { name: 'Key schedule' })).getAllByRole('list')[0]!;
    expect(within(rounds).getAllByText(/^Round key \d+/)).toHaveLength(11);
    expect(screen.getAllByRole('button')).toHaveLength(44);
    expect(word('a0fafe17').getAttribute('aria-label')).toBe('Word w[4]: a0fafe17');
    expect(screen.getByRole('list', { name: 'Round key 1 – not used yet' })).toBeTruthy();
  });

  it('marks the round key most recently used at the playhead', () => {
    const { store } = renderEnglish();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    act(() => store.getState().seek(2));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Round key 0 – most recently used');
    act(() => store.getState().seek(7));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Round key 1 – most recently used');
    expect(document.querySelectorAll('[data-status="used"]')).toHaveLength(1);
  });

  it('explains the derivation chain of a selected word (w[4] = SubWord(RotWord(w[3])) ⊕ Rcon[1] ⊕ w[0])', async () => {
    renderEnglish();
    expect(live().textContent).toBe('Select or hover a word to see how it is derived.');
    await userEvent.click(word('a0fafe17'));
    expect(word('a0fafe17').getAttribute('aria-pressed')).toBe('true');
    const text = live().textContent ?? '';
    expect(text).toContain('How Word w[4] is derived');
    for (const part of ['Key word w[3] 09cf4f3c', 'RotWord for w[4] cf4f3c09', 'SubWord for w[4] 8a84eb01', 'Round constant Rcon[1] 01000000', '⊕ Rcon for w[4] 8b84eb01', 'Key word w[0] 2b7e1516', 'Word w[4] a0fafe17']) {
      expect(text).toContain(part);
    }
    expect(within(live()).getByLabelText('XOR with Round constant Rcon[1] (01000000)')).toBeTruthy();
  });

  it('previews on hover and keyboard focus, and toggles selection', async () => {
    renderEnglish();
    fireEvent.mouseEnter(word('2b7e1516'));
    expect(live().textContent).toBe('Key word w[0] is copied straight from the cipher key.');
    fireEvent.mouseLeave(word('2b7e1516'));
    expect(live().textContent).toBe('Select or hover a word to see how it is derived.');
    await userEvent.tab();
    expect(document.activeElement).toBe(word('2b7e1516'));
    await userEvent.tab();
    expect(live().textContent).toBe('Key word w[1] is copied straight from the cipher key.');
    await userEvent.keyboard('{Enter}');
    expect(word('28aed2a6').getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(word('28aed2a6').getAttribute('aria-pressed')).toBe('false');
  });

  it('renders German', () => {
    renderLab(view, { bundle: keyScheduleBundle(), messages: { ...loadVizMessages('de'), ...loadViewMessages('de'), ...derivationLabels.de } });
    expect(screen.getByRole('region', { name: 'Schlüsselplan' })).toBeTruthy();
    expect(screen.getAllByText(/^Rundenschlüssel \d+/).length).toBe(11);
    expect(word('2b7e1516').getAttribute('aria-label')).toBe('Schlüsselwort w[0]: 2b7e1516');
  });

  it('explains when the derivation facet is missing', () => {
    const bundle = keyScheduleBundle();
    renderLab(view, { bundle: { ...bundle, facets: { 'state@default': bundle.facets['state@default'] } }, messages: loadViewMessages('en') });
    expect(screen.getByRole('status').textContent).toBe('This lab does not record a key schedule.');
  });

  it('shows a loading status without a bundle', () => {
    renderLab(view, { bundle: null, messages: loadViewMessages('en') });
    expect(screen.getByRole('status').textContent).toBe('Preparing the key schedule…');
  });
});
