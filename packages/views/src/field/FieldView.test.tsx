import type { Lens, Locale } from '@cryventure/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import FieldView from './FieldView.tsx';
import { fieldBundle, fieldCase, fieldLabels, type FieldCaseId } from './testFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...fieldLabels[locale] });

function render(id: FieldCaseId, lens: Lens = 'engineer', locale: Locale = 'en') {
  return renderLab(<FieldView labId="fixture" lens={lens} />, { bundle: fieldBundle(id), messages: messagesIn(locale) });
}

const term = (id: string) => document.querySelector<HTMLElement>(`[data-term="${id}"]`)!;
const formula = () => document.querySelector('.cv-field__formula')?.textContent;
const byteLabels = (id: string) =>
  within(term(id))
    .getByRole('group', { name: /16 bytes|16 Byte/ })
    .querySelectorAll('[role="img"]');
const bitStripOf = (id: string) => term(id).querySelector('.cv-field__bits');

/** The first bit-detail step that reduces by R (a term with op `reduce`). */
const reduceStep = () => fieldCase('ghash/one-block-bits').field.steps.find((step) => step.terms.some((t) => t.op === 'reduce'))!.step;

describe('FieldView', () => {
  it('shows the formula and each term as a 16-byte strip at the playhead', () => {
    const { store } = render('ghash/mcgrew-viega-tc2');
    expect(formula()).toContain('Y₀ = 0');
    act(() => store.getState().seek(1));
    expect(formula()).toBe('Y1 = (Y0 ⊕ B1) • H');
    const terms = screen.getByRole('list', { name: 'Terms of the current equation' });
    expect(within(terms).getAllByRole('listitem').map((item) => item.dataset['term'])).toEqual(['x', 'h', 'y']);
    const h = byteLabels('h');
    expect(h).toHaveLength(16);
    expect(h[0]?.getAttribute('aria-label')).toBe('byte 0 = 66');
    expect(term('h').textContent).toContain('multiply in GF(2¹²⁸)');
    expect(term('h').textContent).toContain('⊗');
  });

  it('keeps the latest equation between field steps (GHASH xorBlock has none)', () => {
    const { store } = render('ghash/mcgrew-viega-tc2');
    act(() => store.getState().seek(2));
    expect(formula()).toBe('Y1 = (Y0 ⊕ B1) • H');
    act(() => store.getState().seek(3));
    expect(formula()).toBe('Y2 = (Y1 ⊕ B2) • H');
  });

  it('opens a term’s 128 bits on request in the engineer lens', () => {
    const { store } = render('ghash/mcgrew-viega-tc2');
    act(() => store.getState().seek(1));
    expect(bitStripOf('h')).toBeNull();
    const toggle = within(term('h')).getByRole('button', { name: 'Show bits' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const groups = bitStripOf('h')!.querySelectorAll('[role="img"]');
    expect(groups).toHaveLength(16);
    // H = 66e9…: byte 0 = 0x66 = 01100110, bit 0 (x⁰) first.
    expect(groups[0]?.getAttribute('aria-label')).toBe('bits 0 to 7 = 01100110');
    expect(toggle.getAttribute('aria-controls')).toBe(bitStripOf('h')!.id);
    fireEvent.click(within(term('h')).getByRole('button', { name: 'Hide bits' }));
    expect(bitStripOf('h')).toBeNull();
  });

  it('marks emphasised bits with an outline marker and in words, not by colour alone', () => {
    const { store } = render('ghash/one-block-bits');
    act(() => store.getState().seek(reduceStep()));
    const x = byteLabels('x');
    expect(x[0]?.getAttribute('aria-label')).toMatch(/, highlighted bit 1$/);
    expect(x[0]?.hasAttribute('data-emphasised')).toBe(true);
    expect(x[0]?.textContent).toContain('•');
    expect(byteLabels('r')[0]?.getAttribute('aria-label')).toBe('byte 0 = e1, highlighted bits 0, 1, 2, 7');
    expect(screen.getByText('outlined, underlined: highlighted bits')).toBeTruthy();
  });

  it('adds polynomial notation, the modulus and R in the cryptographer lens', () => {
    const { store } = render('ghash/one-block-bits', 'cryptographer');
    act(() => store.getState().seek(reduceStep()));
    expect(document.querySelector('.cv-field__modulus')?.textContent).toContain('x¹²⁸ + x⁷ + x² + x + 1');
    expect(document.querySelector('.cv-field__reduction')?.textContent).toContain('R = e1 ‖ 0¹²⁰');
    expect(term('r').querySelector('.cv-field__poly')?.textContent).toBe('x⁰ + x¹ + x² + x⁷');
    expect(bitStripOf('r')).not.toBeNull();
    expect(within(term('r')).queryByRole('button')).toBeNull();
    const more = [...document.querySelectorAll('.cv-field__more')].map((node) => node.textContent);
    expect(more.length).toBeGreaterThan(0);
    expect(more[0]).toMatch(/^\+ \d+ more$/);
  });

  it('hides R where the step does not reduce', () => {
    const { store } = render('ghash/mcgrew-viega-tc2', 'cryptographer');
    act(() => store.getState().seek(1));
    expect(document.querySelector('.cv-field__reduction')).toBeNull();
  });

  it('hides hex and bits in the story lens', () => {
    const { store } = render('ghash/mcgrew-viega-tc2', 'story');
    act(() => store.getState().seek(1));
    expect(byteLabels('h')[0]?.getAttribute('aria-label')).toBe('byte 0');
    expect(term('h').textContent).not.toContain('66');
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.cv-field__poly')).toBeNull();
  });

  it('explains GHASH at the start of a GCM run (its step −1 entry), then shows the first multiply', () => {
    const { store } = render('gcm/mcgrew-viega-tc4');
    const [initial, firstMultiply] = fieldCase('gcm/mcgrew-viega-tc4').field.steps;
    expect(initial!.step).toBe(-1);
    expect(document.querySelector('[data-upcoming]')).toBeNull();
    expect(formula()).toBe('Y₀ = 0. GHASH starts once the setup has derived H: Yᵢ = (Yᵢ₋₁ ⊕ Bᵢ) • H in GF(2¹²⁸)');
    act(() => store.getState().seek(firstMultiply!.step));
    expect(document.querySelector('[data-upcoming]')).toBeNull();
    expect(formula()).toBe('Y1 = (Y0 ⊕ B1) • H');
    expect(term('product').dataset['role']).toBe('result');
  });

  it('speaks German', () => {
    const { store } = render('ghash/mcgrew-viega-tc2', 'engineer', 'de');
    act(() => store.getState().seek(1));
    expect(screen.getByRole('region', { name: 'Körper GF(2¹²⁸)' })).toBeTruthy();
    expect(byteLabels('h')[0]?.getAttribute('aria-label')).toBe('Byte 0 = 66');
    expect(within(term('h')).getByRole('button', { name: 'Bits zeigen' })).toBeTruthy();
  });

  it('says when nothing is recorded yet', () => {
    const empty = { ...fieldCase('ghash/mcgrew-viega-tc2').field, steps: [] };
    renderLab(<FieldView labId="fixture" lens="engineer" />, { bundle: fieldBundle('ghash/mcgrew-viega-tc2', empty), messages: messagesIn('en') });
    expect(screen.getByText('No equation yet – step forward to start the calculation.')).toBeTruthy();
  });

  it('explains when the required facet is missing', () => {
    renderLab(<FieldView labId="fixture" lens="engineer" />, { bundle: { ...createFixtureBundle(), facets: {} }, messages: messagesIn('en') });
    expect(screen.getByRole('status').textContent).toBe(loadViewMessages('en')['view.field.missing']);
  });
});
