import { facetKey, type Lens, type Messages, type TraceBundle, type ValuesFacet, type WordopsFacet, type WordTerm } from '@cryventure/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import WordopsView from './WordopsView.tsx';

/*
 * Synthetic facets on the shared fixture bundle (state steps −1 … 2):
 * - 32-bit SHA-256 round 0 of "abc" (FIPS 180-4 example) at step 0, registers a … h, nothing at step 1
 *   (sparse), a feed-forward-like step 2 whose registers change without a shift;
 * - a 64-bit facet without registers whose only step is 1.
 */
const add32 = (...words: string[]) =>
  (words.reduce((sum, word) => sum + BigInt(`0x${word}`), BigInt(0)) % BigInt(2) ** BigInt(32)).toString(16).padStart(8, '0');

const IV = ['6a09e667', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527f', '9b05688c', '1f83d9ab', '5be0cd19'];
const ROUND0_AFTER = ['5d6aebcd', '6a09e667', 'bb67ae85', '3c6ef372', 'fa2a4622', '510e527f', '9b05688c', '1f83d9ab'];
const T1 = add32(ROUND0_AFTER[4]!, (BigInt(2) ** BigInt(32) - BigInt(`0x${IV[3]}`)).toString(16));
const T2 = add32(ROUND0_AFTER[0]!, (BigInt(2) ** BigInt(32) - BigInt(`0x${T1}`)).toString(16));

const term = (id: string, hex: string, role: WordTerm['role'], op?: WordTerm['op'], valueRef?: string): WordTerm => ({
  id,
  label: { key: `test.term.${id}` },
  hex,
  role,
  ...(op === undefined ? {} : { op }),
  ...(valueRef === undefined ? {} : { valueRef }),
});

const ROUND_TERMS: WordTerm[] = [
  term('Sigma1', '3587272b', 'intermediate', 'Sigma1'),
  term('Ch', '1f85c98c', 'intermediate', 'ch'),
  term('K', '428a2f98', 'constant', undefined, 'k/0'),
  term('W', '61626380', 'operand', undefined, 'w/0'),
  term('T1', T1, 'intermediate', 'add'),
  term('T2', T2, 'intermediate', 'add'),
  term('a', ROUND0_AFTER[0]!, 'result', 'add'),
];

const sha32: WordopsFacet = {
  kind: 'wordops',
  schemaVersion: 1,
  wordBits: 32,
  registerNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  steps: [
    { step: 0, formula: { key: 'test.formula.round' }, terms: ROUND_TERMS, registers: { before: IV, after: ROUND0_AFTER } },
    {
      step: 2,
      formula: { key: 'test.formula.feed' },
      terms: [term('H0', add32(IV[0]!, ROUND0_AFTER[0]!), 'result', 'add')],
      registers: { before: ROUND0_AFTER, after: [add32(IV[0]!, ROUND0_AFTER[0]!), ...ROUND0_AFTER.slice(1)] },
    },
  ],
};

const sha64: WordopsFacet = {
  kind: 'wordops',
  schemaVersion: 1,
  wordBits: 64,
  steps: [
    {
      step: 1,
      formula: { key: 'test.formula.schedule' },
      terms: [term('s0', '6a09e667f3bcc908', 'intermediate', 'sigma0'), term('Wt', '0123456789abcdef', 'result', 'add', 'w/16')],
    },
  ],
};

const values: ValuesFacet = {
  kind: 'values',
  schemaVersion: 1,
  values: [{ id: 'w/0', labelKey: 'test.value.w0', role: 'public', region: 'state', offset: 0, length: 4 }],
} as unknown as ValuesFacet;

const LABELS = {
  'test.term.Sigma1': 'Σ1(e)',
  'test.term.Ch': 'Ch(e, f, g)',
  'test.term.K': 'K_0',
  'test.term.W': 'W_0',
  'test.term.T1': 'T1',
  'test.term.T2': 'T2',
  'test.term.a': 'a (new)',
  'test.term.H0': 'H0',
  'test.term.s0': 'σ0(W_1)',
  'test.term.Wt': 'W_16',
  'test.formula.round': 'T1 = h + Σ1(e) + Ch(e, f, g) + K_t + W_t with Σ1 = ROTR⁶ ⊕ ROTR¹¹ ⊕ ROTR²⁵',
  'test.formula.feed': 'H ← H + (a, …, h)',
  'test.formula.schedule': 'W_t = σ1(W_t−2) + W_t−7 + σ0(W_t−15) + W_t−16',
  'test.value.w0': 'message word 0',
};
const english: Messages = { ...loadViewMessages('en'), ...LABELS };

function bundleWith(facets: Record<string, unknown>): TraceBundle {
  const bundle = createFixtureBundle();
  return { ...bundle, facets: { ...bundle.facets, ...facets } };
}

function render(lens: Lens = 'engineer', wordops: WordopsFacet = sha32, extra: Record<string, unknown> = {}) {
  return renderLab(<WordopsView labId="fixture" lens={lens} />, {
    bundle: bundleWith({ [facetKey('wordops')]: wordops, ...extra }),
    messages: english,
  });
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-term="${id}"]`);
const termLabels = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((cell) => cell.querySelector('.cv-wordops__name')?.textContent);
const formula = () => document.querySelector('.cv-wordops__formula')?.textContent;
const register = (side: 'before' | 'after', name: string) =>
  within(screen.getByRole('group', { name: side })).getByText(name).closest<HTMLElement>('[data-register]')!;
const shiftList = () => screen.queryByRole('list', { name: 'Register shift' });

describe('WordopsView', () => {
  it('lists every term in dataflow order with op glyph and hex in 4-digit chunks', () => {
    const { store } = render();
    act(() => store.getState().seek(0));
    expect(termLabels()).toEqual(['Σ1(e)', 'Ch(e, f, g)', 'K_0', 'W_0', 'T1', 'T2', 'a (new)']);
    expect(row('Sigma1')!.querySelector('.cv-wordops__hex')!.textContent).toBe('3587 272b');
    expect(row('Sigma1')!.querySelector('.cv-wordops__op')!.textContent).toBe('Σ1big sigma 1 (Σ1)');
    expect(row('Ch')!.querySelector('.cv-wordops__op [aria-hidden]')!.textContent).toBe('Ch');
  });

  it('draws the SHA-2 register shift as labelled arrows with a text alternative', () => {
    const { store } = render();
    act(() => store.getState().seek(0));
    expect(register('before', 'a').textContent).toContain('6a09 e667');
    expect(register('after', 'e').textContent).toContain('fa2a 4622');
    const arrows = within(shiftList()!).getAllByRole('listitem').map((item) => item.textContent);
    expect(arrows).toEqual(['a ← T1 + T2', 'b ← a', 'c ← b', 'd ← c', 'e ← d + T1', 'f ← e', 'g ← f', 'h ← g']);
    const svg = document.querySelector('.cv-wordops__arrows')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect([...svg.querySelectorAll('.cv-wordops__arrowlabel')].map((label) => label.textContent)).toEqual(['T1 + T2', '+ T1']);
    expect(svg.querySelectorAll('[data-source="copy"] line')).toHaveLength(6);
  });

  it('shows registers without arrows on a non-round step, marking changed ones with a glyph', () => {
    const { store } = render();
    act(() => store.getState().seek(2));
    expect(shiftList()).toBeNull();
    expect(register('after', 'a').hasAttribute('data-changed')).toBe(true);
    expect(register('after', 'a').textContent).toContain('•');
    expect(register('after', 'b').hasAttribute('data-changed')).toBe(false);
  });

  it('keeps the latest step on sparse steps and previews the first one before it', () => {
    const { store } = render();
    expect(document.querySelector('[data-upcoming]')).not.toBeNull();
    expect(screen.getByText(english['view.wordops.upcoming']!)).toBeTruthy();
    act(() => store.getState().seek(1));
    expect(document.querySelector('[data-upcoming]')).toBeNull();
    expect(row('T1')).not.toBeNull();
    act(() => store.getState().seek(2));
    expect(row('T1')).toBeNull();
    expect(row('H0')).not.toBeNull();
  });

  it('engineer lens: bit strips for 32-bit rotation terms only, no formula', () => {
    const { store } = render('engineer');
    act(() => store.getState().seek(0));
    expect(formula()).toBeUndefined();
    const strip = within(row('Sigma1')!).getByRole('img');
    expect(strip.getAttribute('aria-label')).toBe('bits MSB → LSB: 0011 0101 1000 0111 0010 0111 0010 1011');
    expect(within(row('Ch')!).queryByRole('img')).toBeNull();
    expect(within(row('T1')!).queryByRole('img')).toBeNull();
  });

  it('engineer lens: 64-bit words stay hex only, without registers', () => {
    const { store } = render('engineer', sha64);
    act(() => store.getState().seek(1));
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'Bits (MSB → LSB)' })).toBeNull();
    expect(row('s0')!.querySelector('.cv-wordops__hex')!.textContent).toBe('6a09 e667 f3bc c908');
    expect(screen.queryByRole('region', { name: english['view.wordops.registers'] })).toBeNull();
  });

  it('cryptographer lens: the formula with ROTR notation, all terms, no bit strips', () => {
    const { store } = render('cryptographer');
    act(() => store.getState().seek(0));
    expect(formula()).toContain('ROTR');
    expect(termLabels()).toHaveLength(ROUND_TERMS.length);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('story lens: register shift plus T1, T2 and results only', () => {
    const { store } = render('story');
    act(() => store.getState().seek(0));
    expect(formula()).toBeUndefined();
    expect(shiftList()).not.toBeNull();
    expect(termLabels()).toEqual(['T1', 'T2', 'a (new)']);
    act(() => store.getState().seek(2));
    expect(termLabels()).toEqual(['H0']);
  });

  it('publishes a term ValueRef as the lab selection on hover and focus, and highlights it', () => {
    const { store } = render('engineer', sha32, { [facetKey('values')]: values });
    act(() => store.getState().seek(0));
    const w = within(row('W')!).getByRole('button');
    expect(w.textContent).toContain('(value: message word 0)');
    fireEvent.mouseEnter(w);
    expect(store.getState().selection.valueRefId).toBe('w/0');
    expect(row('W')!.hasAttribute('data-selected')).toBe(true);
    fireEvent.mouseLeave(w);
    expect(store.getState().selection.valueRefId).toBeNull();
    act(() => w.focus());
    expect(store.getState().selection.valueRefId).toBe('w/0');
    act(() => store.getState().select('k/0'));
    act(() => w.blur());
    expect(store.getState().selection.valueRefId).toBe('k/0');
    expect(row('K')!.hasAttribute('data-selected')).toBe(true);
    expect(within(row('T1')!).queryByRole('button')).toBeNull();
  });

  it('moves the published selection with the focused term when the step changes, and releases it on unmount', () => {
    const nextRound = { ...sha32.steps[0]!, step: 1, terms: ROUND_TERMS.map((each) => (each.id === 'W' ? { ...each, valueRef: 'w/1' } : each)) };
    const twoRounds: WordopsFacet = { ...sha32, steps: [sha32.steps[0]!, nextRound, sha32.steps[1]!] };
    const { store } = render('engineer', twoRounds);
    act(() => store.getState().seek(0));
    const w = within(row('W')!).getByRole('button');
    act(() => w.focus());
    expect(store.getState().selection.valueRefId).toBe('w/0');
    act(() => store.getState().seek(1));
    expect(within(row('W')!).getByRole('button')).toBe(w);
    expect(store.getState().selection.valueRefId).toBe('w/1');
    act(() => store.getState().seek(2));
    expect(row('W')).toBeNull();
    expect(store.getState().selection.valueRefId).toBeNull();
  });

  it('does not keep a stale selection when the step changes without focus', () => {
    const nextRound = { ...sha32.steps[0]!, step: 1, terms: ROUND_TERMS.map((each) => (each.id === 'W' ? { ...each, valueRef: 'w/1' } : each)) };
    const { store } = render('engineer', { ...sha32, steps: [sha32.steps[0]!, nextRound] });
    act(() => store.getState().seek(0));
    const w = within(row('W')!).getByRole('button');
    fireEvent.mouseEnter(w);
    fireEvent.mouseLeave(w);
    act(() => store.getState().select('k/0'));
    act(() => store.getState().seek(1));
    expect(store.getState().selection.valueRefId).toBe('k/0');
  });

  it('previews the first step as a labelled, non-interactive frame', () => {
    const { store } = render('engineer', sha32, { [facetKey('values')]: values });
    act(() => store.getState().seek(-1));
    const upcoming = document.querySelector<HTMLElement>('[data-upcoming]')!;
    expect(upcoming).not.toBeNull();
    expect(upcoming.textContent).toContain(english['view.wordops.previewTag']!);
    expect(within(upcoming).queryAllByRole('button')).toHaveLength(0);
    fireEvent.mouseEnter(within(row('W')!).getByText('W_0'));
    expect(store.getState().selection.valueRefId).toBeNull();
  });

  it('names each term role in words, not by colour only', () => {
    const { store } = render('engineer');
    act(() => store.getState().seek(0));
    expect(row('K')!.querySelector('.cv-wordops__label')!.textContent).toContain(english['view.wordops.role.constant']!);
    expect(row('W')!.querySelector('.cv-wordops__label')!.textContent).toContain(english['view.wordops.role.operand']!);
    expect(row('a')!.querySelector('.cv-wordops__label')!.textContent).toContain(english['view.wordops.role.result']!);
  });

  it('makes the scroll regions focusable only when they overflow', () => {
    const { store } = render('engineer');
    act(() => store.getState().seek(0));
    const regions = () => screen.getAllByRole('region').filter((region) => region.classList.contains('cv-wordops__scroll'));
    expect(regions()).toHaveLength(2);
    for (const region of regions()) expect(region.hasAttribute('tabindex')).toBe(false);
    const widths = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 500 });
    try {
      act(() => window.dispatchEvent(new Event('resize')));
      for (const region of regions()) expect(region.getAttribute('tabindex')).toBe('0');
    } finally {
      if (widths) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', widths);
      else delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    }
  });

  it('explains when the facet is missing', () => {
    renderLab(<WordopsView labId="fixture" lens="story" />, { bundle: { ...createFixtureBundle(), facets: {} }, messages: english });
    expect(screen.getByRole('status').textContent).toBe(english['view.wordops.missing']);
  });
});
