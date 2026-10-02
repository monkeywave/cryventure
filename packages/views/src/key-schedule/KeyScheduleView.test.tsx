import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderLab } from '@cryventure/viz/testing';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadViewMessages } from '../messages.ts';
import KeyScheduleView from './KeyScheduleView.tsx';
import { aesDerivation, derivationLabels, keyScheduleBundle } from './testFixture.ts';

const view = <KeyScheduleView labId="fixture" lens="engineer" />;

function renderEnglish() {
  return renderLab(view, {
    bundle: keyScheduleBundle(),
    messages: { ...loadViewMessages('en'), ...derivationLabels.en },
  });
}

const live = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
const word = (hex: string) => screen.getByRole('button', { name: new RegExp(`${hex}$`) });
const chain = () => document.querySelector<HTMLElement>('.cv-keyschedule__chain');
const roundItem = (round: number) =>
  document.querySelectorAll('.cv-keyschedule__row')[round] as HTMLElement;
const sources = () =>
  [...document.querySelectorAll('[data-source]')]
    .map((node) => node.getAttribute('data-node'))
    .sort();

describe('KeyScheduleView', () => {
  it('falls back to generic group headings without producer group labels', () => {
    const bundle = keyScheduleBundle();
    const derivation = { ...aesDerivation, groups: undefined };
    renderLab(view, {
      bundle: { ...bundle, facets: { ...bundle.facets, 'derivation@default': derivation } },
      messages: { ...loadViewMessages('en'), ...derivationLabels.en },
    });
    expect(screen.getAllByText(/^Group \d+/)).toHaveLength(11);
    expect(screen.getByRole('list', { name: 'Group 1 – not used yet' })).toBeTruthy();
  });

  it('re-renders only the words whose source mark flips on hover', () => {
    const renders = vi.fn();
    renderLab(
      <Profiler id="ks" onRender={(_id, _phase, actual) => renders(actual)}>
        {view}
      </Profiler>,
      { bundle: keyScheduleBundle(), messages: { ...loadViewMessages('en'), ...derivationLabels.en } },
    );
    renders.mockClear();
    fireEvent.mouseEnter(word('a0fafe17'));
    expect(sources()).toEqual(['w/0', 'w/3']);
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('is styled by cv-keyschedule classes only (no inline styles)', () => {
    renderEnglish();
    expect(document.querySelector('section.cv-keyschedule')).toBeTruthy();
    expect(document.querySelectorAll('.cv-keyschedule__row')).toHaveLength(11);
    expect(document.querySelectorAll('button.cv-keyschedule__word')).toHaveLength(44);
    expect(document.querySelectorAll('.cv-keyschedule [style]')).toHaveLength(0);
  });

  it('lists 11 round keys of 4 focusable words', () => {
    renderEnglish();
    const rounds = within(screen.getByRole('region', { name: 'Key schedule' })).getAllByRole(
      'list',
    )[0]!;
    expect(within(rounds).getAllByText(/^Round key \d+/)).toHaveLength(11);
    expect(screen.getAllByRole('button')).toHaveLength(44);
    expect(word('a0fafe17').getAttribute('aria-label')).toBe('Word w[4]: a0fafe17');
    expect(screen.getByRole('list', { name: 'Round key 1 – not used yet' })).toBeTruthy();
  });

  it('marks the round key most recently used at the playhead', () => {
    const { store } = renderEnglish();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    act(() => store.getState().seek(2));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Round key 0 – most recently used',
    );
    act(() => store.getState().seek(7));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Round key 1 – most recently used',
    );
    expect(document.querySelectorAll('[data-status="used"]')).toHaveLength(1);
  });

  it('discloses the chain of w[4] inside round key 1, before round key 2 (FIPS 197 App. A.1)', async () => {
    renderEnglish();
    expect(chain()).toBeNull();
    await userEvent.click(word('a0fafe17'));
    const panel = screen.getByRole('region', { name: 'How Word w[4] is derived' });
    expect(roundItem(1).contains(panel)).toBe(true);
    expect(roundItem(1).nextElementSibling).toBe(roundItem(2));
    const text = panel.textContent ?? '';
    for (const part of [
      'Key word w[3] 09cf4f3c',
      'RotWord for w[4] cf4f3c09',
      'SubWord for w[4] 8a84eb01',
      'Round constant Rcon[1] 01000000',
      '⊕ Rcon for w[4] 8b84eb01',
      'Key word w[0] 2b7e1516',
      'Word w[4] a0fafe17',
    ]) {
      expect(text).toContain(part);
    }
    expect(within(panel).getByLabelText('XOR with Round constant Rcon[1] (01000000)')).toBeTruthy();
    expect(panel.querySelector('[data-result]')?.textContent).toContain('a0fafe17');
  });

  it('wires aria-expanded / aria-controls and announces the selection once', async () => {
    renderEnglish();
    expect(word('a0fafe17').getAttribute('aria-expanded')).toBe('false');
    expect(word('a0fafe17').hasAttribute('aria-controls')).toBe(false);
    await userEvent.click(word('a0fafe17'));
    expect(word('a0fafe17').getAttribute('aria-expanded')).toBe('true');
    expect(word('a0fafe17').getAttribute('aria-controls')).toBe(chain()?.id);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(live().textContent).toBe(
      'Word w[4] selected – its derivation is shown below “Round key 1”.',
    );
    expect(document.activeElement).toBe(word('a0fafe17'));
  });

  it('keeps one chain open: selecting another word moves it, selecting again or Escape closes it', async () => {
    renderEnglish();
    await userEvent.click(word('a0fafe17'));
    await userEvent.click(word('d014f9a8'));
    expect(document.querySelectorAll('.cv-keyschedule__chain')).toHaveLength(1);
    expect(roundItem(10).contains(chain())).toBe(true);
    await userEvent.click(word('d014f9a8'));
    expect(chain()).toBeNull();
    expect(live().textContent).toBe('');
    word('2b7e1516').focus();
    await userEvent.keyboard('{Enter}');
    expect(chain()?.textContent).toContain('Key word w[0] is copied straight from the cipher key.');
    await userEvent.keyboard('{Escape}');
    expect(chain()).toBeNull();
    expect(document.activeElement).toBe(word('2b7e1516'));
    await userEvent.keyboard(' ');
    expect(chain()).not.toBeNull();
  });

  it('marks the direct source words on hover and focus without opening a chain', async () => {
    renderEnglish();
    fireEvent.mouseEnter(word('a0fafe17'));
    expect(chain()).toBeNull();
    expect(sources()).toEqual(['w/0', 'w/3']);
    fireEvent.mouseLeave(word('a0fafe17'));
    expect(sources()).toEqual([]);
    act(() => word('88542cb1').focus());
    expect(sources()).toEqual(['w/1', 'w/4']);
  });

  it('publishes the selected word as the linked-brushing selection', async () => {
    const { store } = renderEnglish();
    await userEvent.click(word('a0fafe17'));
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    await userEvent.keyboard('{Escape}');
    expect(store.getState().selection.valueRefId).toBeNull();
  });

  it('scrolls an opened chain into view with block: nearest', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderEnglish();
    await userEvent.click(word('a0fafe17'));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('renders German', () => {
    renderLab(view, {
      bundle: keyScheduleBundle(),
      messages: { ...loadVizMessages('de'), ...loadViewMessages('de'), ...derivationLabels.de },
    });
    expect(screen.getByRole('region', { name: 'Schlüsselplan' })).toBeTruthy();
    expect(screen.getAllByText(/^Rundenschlüssel \d+/).length).toBe(11);
    expect(word('2b7e1516').getAttribute('aria-label')).toBe('Schlüsselwort w[0]: 2b7e1516');
  });

  it('explains when the derivation facet is missing', () => {
    const bundle = keyScheduleBundle();
    renderLab(view, {
      bundle: { ...bundle, facets: { 'state@default': bundle.facets['state@default'] } },
      messages: loadViewMessages('en'),
    });
    expect(screen.getByRole('status').textContent).toBe('This lab does not record a key schedule.');
  });

  it('shows a loading status without a bundle', () => {
    renderLab(view, { bundle: null, messages: loadViewMessages('en') });
    expect(screen.getByRole('status').textContent).toBe('Preparing the key schedule…');
  });
});
