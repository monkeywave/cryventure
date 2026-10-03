import type { Lens, MathFacet } from '@cryventure/core';
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadViewMessages } from '../messages.ts';
import MathView from './MathView.tsx';
import { gmulMath, mathBundle, mathLabels } from './testFixture.ts';

const english = { ...loadViewMessages('en'), ...mathLabels.en };

/** Renders the view with the playhead on the first step (the store starts before it, at -1). */
function render(lens: Lens = 'engineer', math: MathFacet = gmulMath, messages = english) {
  const result = renderLab(<MathView labId="fixture" lens={lens} />, {
    bundle: mathBundle(math),
    messages,
  });
  act(() => result.store.getState().seek(0));
  return result;
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-term="${id}"]`)!;
const bitLabels = (id: string) =>
  within(row(id))
    .queryAllByRole('img')
    .map((cell) => cell.getAttribute('aria-label'));

const formula = () => document.querySelector('.cv-math__formula')?.textContent;

describe('MathView', () => {
  it('shows the formula and a semantic table of terms at the playhead', () => {
    const { store } = render();
    act(() => store.getState().seek(1));
    expect(formula()).toBe('b bit 0 = 1: acc ← acc ⊕ a • x⁰');
    const table = screen.getByRole('table', { name: english['view.math.terms'] });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Term', 'Operation', 'Bits (MSB → LSB)', 'Hex']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((th) => th.textContent),
    ).toEqual(['b', 'acc (before)', 'a • x⁰', 'acc']);
    expect(row('addend').textContent).toContain('0x57');
    expect(row('addend').textContent).toContain('XOR');
  });

  it('labels each bit MSB → LSB and marks emphasised bits with a non-colour cue', () => {
    const { store } = render();
    act(() => store.getState().seek(1));
    expect(bitLabels('b')).toEqual([
      'bit 7 = 1',
      'bit 6 = 0',
      'bit 5 = 0',
      'bit 4 = 0',
      'bit 3 = 0',
      'bit 2 = 0',
      'bit 1 = 1',
      'bit 0 = 1, highlighted',
    ]);
    expect(row('b').querySelectorAll('[data-emphasised]')).toHaveLength(1);
  });

  it('follows the playhead and keeps the latest equation between math steps', () => {
    const { store } = render('engineer', {
      ...gmulMath,
      steps: gmulMath.steps.filter((mathStep) => mathStep.step !== 5),
    });
    act(() => store.getState().seek(4));
    expect(formula()).toBe('a • x² = (a • x²⁻¹ ≪ 1) ⊕ {11b}');
    expect(bitLabels('shifted')[0]).toBe('carry bit 8 = 1, highlighted');
    expect(row('shifted').querySelector('[data-carry]')).not.toBeNull();
    expect(row('modulus').textContent).toContain('0x11b');
    expect(row('modulus').querySelector('[data-carry]')).toBeNull();
    act(() => store.getState().seek(5));
    expect(formula()).toBe('a • x² = (a • x²⁻¹ ≪ 1) ⊕ {11b}');
    act(() => store.getState().seek(gmulMath.steps.at(-1)!.step));
    expect(row('result').textContent).toContain('0xc1');
  });

  it('story lens shows formula and hex only', () => {
    render('story');
    expect(screen.queryAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Term',
      'Operation',
      'Hex',
    ]);
    expect(document.querySelector('.cv-math__bit')).toBeNull();
  });

  it('cryptographer lens adds polynomial notation and the modulus', () => {
    render('cryptographer');
    expect(
      screen.getByText('Field GF(2⁸), reduced modulo m(x) = x⁸ + x⁴ + x³ + x + 1'),
    ).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Polynomial' })).toBeTruthy();
    expect(row('a').textContent).toContain('x⁶ + x⁴ + x² + x + 1');
    expect(document.querySelector('.cv-math__bit')).not.toBeNull();
  });

  it('previews the first equation, muted, under a start hint before the first step', () => {
    const { store } = render();
    act(() => store.getState().seek(-1));
    const preview = document.querySelector<HTMLElement>('[data-upcoming]')!;
    expect(within(preview).getByText(english['view.math.upcoming']!)).toBeTruthy();
    expect(within(preview).getByText(english['plugin.gf256.formula.gmulLoad']!)).toBeTruthy();
    expect(within(preview).getByRole('table')).toBeTruthy();
    expect(screen.queryByText(english['view.math.notYet']!)).toBeNull();
    act(() => store.getState().seek(0));
    expect(document.querySelector('[data-upcoming]')).toBeNull();
  });

  it('previews the first math step while the playhead is before it', () => {
    const { store } = render('engineer', {
      ...gmulMath,
      steps: gmulMath.steps.map((step) => ({ ...step, step: step.step + 1 })),
    });
    expect(document.querySelector('[data-upcoming]')).not.toBeNull();
    expect(row('a').textContent).toContain('0x57');
    act(() => store.getState().seek(1));
    expect(document.querySelector('[data-upcoming]')).toBeNull();
  });

  it('says there is no equation when the facet has no steps', () => {
    render('engineer', { ...gmulMath, steps: [] });
    expect(screen.getByText(english['view.math.notYet']!)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('raises caret exponents in formulas and term labels', () => {
    render('engineer', gmulMath, {
      ...english,
      'plugin.gf256.formula.gmulLoad': 'acc ← acc ⊕ a·x^7, from a·x^(7−1)',
      'plugin.gf256.term.a': 'a^254',
      'plugin.gf256.term.b': 'b^{k}',
    });
    expect(screen.getByText('acc ← acc ⊕ a·x⁷, from a·x⁷⁻¹')).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'a²⁵⁴' })).toBeTruthy();
    const b = within(row('b')).getByRole('rowheader');
    expect(b.querySelector('sup')?.textContent).toBe('k');
    expect(b.textContent).toBe('bk');
  });

  it('keeps table semantics explicit so the stacked narrow layout stays accessible', () => {
    render('cryptographer');
    const table = screen.getByRole('table');
    expect(table.getAttribute('role')).toBe('table');
    expect(table.hasAttribute('data-polynomial')).toBe(true);
    expect(table.hasAttribute('data-bits')).toBe(true);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(row('a')).getAllByRole('cell')).toHaveLength(4);
  });

  it('keeps the table in a focusable scroll region for narrow slots', () => {
    render();
    const region = screen.getByRole('region', { name: english['view.math.terms'] });
    expect(region.tabIndex).toBe(0);
    expect(region.classList.contains('cv-scroll-shadow')).toBe(true);
    expect(within(region).getByRole('table')).toBeTruthy();
  });

  it('renders in German', () => {
    const { store } = render('cryptographer', gmulMath, {
      ...loadVizMessages('de'),
      ...loadViewMessages('de'),
      ...mathLabels.de,
    });
    expect(screen.getByRole('columnheader', { name: 'Polynom' })).toBeTruthy();
    expect(screen.getByText(/Der endliche Körper GF\(2⁸\)/)).toBeTruthy();
    act(() => store.getState().seek(1));
    expect(row('addend').textContent).toContain('XOR-verknüpfen');
  });

  it('explains when the math facet is missing', () => {
    renderLab(<MathView labId="fixture" lens="engineer" />, {
      bundle: { ...createFixtureBundle(), facets: {} },
      messages: english,
    });
    expect(screen.getByRole('status').textContent).toBe(english['view.math.missing']);
  });
});
