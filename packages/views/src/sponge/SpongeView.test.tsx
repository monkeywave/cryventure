import { facetKey, type Lens, type Messages, type SpongeFacet, type SpongeStep, type TraceBundle } from '@cryventure/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import SpongeView from './SpongeView.tsx';

/*
 * Synthetic Keccak-f[1600]-shaped facets on the shared fixture bundle (state steps −1 … 2): sponge step
 * 0 holds BEFORE (lane i = i + 1), step 1 the phase under test with AFTER (lane 0 and lane 7 changed).
 */
const hex16 = (value: number) => value.toString(16).padStart(16, '0');
const BEFORE = Array.from({ length: 25 }, (_, index) => hex16(index + 1));
const AFTER = BEFORE.map((lane, index) => (index === 0 || index === 7 ? 'ff00000000000000' : lane));
const PI_SOURCE = [0, 6, 12, 18, 24, 3, 9, 10, 16, 22, 1, 7, 13, 19, 20, 4, 5, 11, 17, 23, 2, 8, 14, 15, 21];
const RHO = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

function spongeFacet(phaseStep: Omit<SpongeStep, 'step' | 'lanes'>): SpongeFacet {
  return {
    kind: 'sponge',
    schemaVersion: 1,
    label: { key: 'test.sponge.label' },
    width: 5,
    height: 5,
    laneBits: 64,
    rounds: 24,
    rateLanes: 17,
    rhoOffsets: RHO,
    piSource: PI_SOURCE,
    steps: [
      { step: 0, phase: 'pad', lanes: BEFORE },
      { step: 1, lanes: AFTER, ...phaseStep },
    ],
  };
}

const english: Messages = { ...loadViewMessages('en'), 'test.sponge.label': 'Keccak-f[1600]' };

function bundleWith(facet: SpongeFacet | undefined): TraceBundle {
  const bundle = createFixtureBundle();
  return { ...bundle, facets: { ...bundle.facets, ...(facet === undefined ? {} : { [facetKey('sponge')]: facet }) } };
}

function render(phaseStep: Omit<SpongeStep, 'step' | 'lanes'>, lens: Lens = 'engineer', messages: Messages = english) {
  const result = renderLab(<SpongeView labId="fixture" lens={lens} />, { bundle: bundleWith(spongeFacet(phaseStep)), messages });
  act(() => result.store.getState().seek(1));
  return result;
}

const lane = (x: number, y: number) => document.querySelector<HTMLElement>(`[data-col="${x}"][data-row="${y}"]`)!;
const badges = (kind: string) => [...document.querySelectorAll(`.cv-sponge__lane [data-badge="${kind}"]`)].map((badge) => badge.textContent);
const values = () => [...document.querySelectorAll('.cv-sponge__value')].map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]);
const formula = () => document.querySelector('.cv-sponge__formula')?.textContent;

describe('SpongeView', () => {
  it('draws the 5 × 5 lanes with x left → right and y top → bottom, rate and capacity named', () => {
    render({ phase: 'round', round: 0 });
    const grid = screen.getByRole('grid', { name: 'Lanes of the state' });
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(25);
    expect(within(grid).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Row', 'x = 0', 'x = 1', 'x = 2', 'x = 3', 'x = 4']);
    expect(lane(2, 1).dataset.lane).toBe('7');
    expect(lane(1, 3).getAttribute('data-part')).toBe('rate');
    expect(lane(2, 3).getAttribute('data-part')).toBe('capacity');
    expect(lane(2, 3).getAttribute('aria-label')).toBe('Lane (2, 3), capacity, 00000000 00000012');
    expect(screen.getByText(english['view.sponge.legend.capacity']!)).toBeTruthy();
    expect(screen.getByText(english['view.sponge.orientation']!)).toBeTruthy();
    expect(screen.getByText('Rate: 17 lanes (1088 bits) · capacity: 8 lanes (512 bits)')).toBeTruthy();
  });

  it('engineer lens: each lane as 16 hex digits on two lines of 8, no formula', () => {
    render({ phase: 'round', round: 0 });
    expect([...lane(4, 0).querySelectorAll('.cv-sponge__hexline')].map((line) => line.textContent)).toEqual(['00000000', '00000005']);
    expect(formula()).toBeUndefined();
    expect(screen.getByText('Round, round 0 (of 0 … 23)')).toBeTruthy();
  });

  it('story lens: a colour-only grid (tone per lane, no hex), still named for screen readers', () => {
    render({ phase: 'round', round: 0 }, 'story');
    expect(document.querySelector('.cv-sponge__hex')).toBeNull();
    expect(lane(0, 0).style.getPropertyValue('--cv-sponge-level')).toBe('1');
    expect(lane(1, 0).style.getPropertyValue('--cv-sponge-level')).toBe('0.2');
    expect(lane(0, 0).getAttribute('aria-label')).toBe('Lane (0, 0), rate, changed');
  });

  it('cryptographer lens: the mapping in FIPS 202 notation plus hex', () => {
    render({ phase: 'pi', round: 0 }, 'cryptographer');
    expect(formula()).toBe('A′[x, y, z] = A[(x + 3y) mod 5, x, z]');
    expect(document.querySelector('.cv-sponge__hex')).not.toBeNull();
  });

  it('marks changed lanes with a flash, a • glyph and in words', () => {
    const { store } = render({ phase: 'round', round: 0 });
    expect(lane(0, 0).hasAttribute('data-changed')).toBe(true);
    expect(lane(2, 1).querySelector('.cv-sponge__flash')).not.toBeNull();
    expect(lane(2, 1).textContent).toContain('•');
    expect(lane(1, 0).hasAttribute('data-changed')).toBe(false);
    expect(lane(2, 1).getAttribute('aria-label')).toContain('changed');
    act(() => store.getState().seek(0));
    expect(document.querySelectorAll('[data-changed]')).toHaveLength(0);
  });

  it('absorb: "⊕ block" on the rate lanes only, and before ⊕ block = after for the selected lane', () => {
    render({ phase: 'absorb', input: AFTER.slice(0, 17) });
    expect(badges('absorb')).toHaveLength(17);
    expect(lane(2, 3).querySelector('[data-badge]')).toBeNull();
    expect(values()).toEqual([
      ['before', '00000000 00000001'],
      ['⊕ block', 'ff000000 00000000'],
      ['after', 'ff000000 00000000'],
    ]);
    fireEvent.mouseEnter(lane(2, 3));
    expect(screen.getByText('Lane (2, 3) is part of the capacity: the block never touches it.')).toBeTruthy();
  });

  it('θ: C and D under the grid; the selected column with x − 1 and x + 1 marked; arrow keys move it', () => {
    const c = Array.from({ length: 5 }, (_, x) => hex16(0xc0 + x));
    const d = Array.from({ length: 5 }, (_, x) => hex16(0xd0 + x));
    render({ phase: 'theta', round: 0, theta: { c, d } });
    const rows = screen.getByRole('group', { name: 'Column parities C and the values D' });
    const marks = () => [...rows.querySelectorAll('[data-row="c"] .cv-sponge__parity')].map((cell) => cell.getAttribute('data-mark'));
    expect(within(rows).getAllByRole('img')).toHaveLength(10);
    expect(marks()).toEqual(['selected', 'right', null, null, 'left']);
    expect(lane(0, 3).hasAttribute('data-in-column')).toBe(true);
    expect(screen.getByText(/Column 0: D\[0\] = C\[4\] ⊕ ROT\(C\[1\], 1\)/)).toBeTruthy();
    act(() => lane(0, 0).focus());
    fireEvent.keyDown(lane(0, 0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(lane(1, 0));
    expect(marks()).toEqual(['left', 'selected', 'right', null, null]);
    expect(lane(1, 4).hasAttribute('data-in-column')).toBe(true);
    expect(values()).toEqual([
      ['C[0]', '00000000 000000c0'],
      ['C[2]', '00000000 000000c2'],
      ['D[1]', '00000000 000000d1'],
    ]);
  });

  it('ρ: an offset badge per lane', () => {
    render({ phase: 'rho', round: 0 });
    expect(badges('rho')).toHaveLength(25);
    expect(lane(1, 0).querySelector('[data-badge="rho"]')!.textContent).toBe('≪ 1');
    expect(lane(1, 0).getAttribute('aria-label')).toContain('rotated left by 1 bit,');
    expect(lane(0, 1).getAttribute('aria-label')).toContain('rotated left by 36 bits');
  });

  it('ρ: the detail line uses the singular for a 1-bit rotation (EN and DE)', () => {
    render({ phase: 'rho', round: 0 });
    fireEvent.mouseEnter(lane(1, 0));
    expect(screen.getByText('Lane (1, 0) rotated left by 1 bit')).toBeTruthy();
    fireEvent.mouseEnter(lane(0, 1));
    expect(screen.getByText('Lane (0, 1) rotated left by 36 bits')).toBeTruthy();
  });

  it('the most recent input wins: arrow keys move the selection while the mouse rests on a lane', () => {
    render({ phase: 'theta', round: 0, theta: { c: BEFORE.slice(0, 5), d: BEFORE.slice(0, 5) } });
    fireEvent.mouseEnter(lane(3, 2));
    expect(lane(3, 0).hasAttribute('data-in-column')).toBe(true);
    act(() => lane(0, 0).focus());
    fireEvent.keyDown(lane(0, 0), { key: 'ArrowRight' });
    expect(lane(1, 0).hasAttribute('data-in-column')).toBe(true);
    expect(lane(3, 0).hasAttribute('data-in-column')).toBe(false);
    fireEvent.mouseEnter(lane(4, 4));
    expect(lane(4, 0).hasAttribute('data-in-column')).toBe(true);
  });

  it('names the selected column (θ) and row (χ) in the lanes’ accessible names', () => {
    const { store } = render({ phase: 'theta', round: 0, theta: { c: BEFORE.slice(0, 5), d: BEFORE.slice(0, 5) } });
    expect(lane(0, 3).getAttribute('aria-label')).toContain('in the selected column');
    expect(lane(1, 3).getAttribute('aria-label')).not.toContain('selected column');
    act(() => store.getState().seek(0));
    expect(lane(0, 3).getAttribute('aria-label')).not.toContain('selected');
  });

  it('χ: lanes of the selected row say so in their accessible names', () => {
    render({ phase: 'chi', round: 0 });
    expect(lane(2, 0).getAttribute('aria-label')).toContain('in the selected row');
    expect(lane(2, 1).getAttribute('aria-label')).not.toContain('selected row');
  });

  it('the selection hint mentions tapping, too', () => {
    render({ phase: 'chi', round: 0 });
    expect(document.querySelector('.cv-sponge__hint')!.textContent).toMatch(/\btap\b/i);
  });

  it('π: a source label per lane and an arrow per moved lane, the selected one bold', () => {
    render({ phase: 'pi', round: 0 });
    expect(lane(1, 0).querySelector('[data-badge="pi"]')!.textContent).toBe('← (1, 1)');
    expect(lane(0, 1).getAttribute('aria-label')).toContain('comes from lane (3, 0)');
    const arrows = document.querySelectorAll('.cv-sponge__arrow');
    expect(arrows).toHaveLength(24);
    expect(document.querySelector('.cv-sponge__arrows')!.getAttribute('aria-hidden')).toBe('true');
    fireEvent.mouseEnter(lane(1, 0));
    expect(document.querySelectorAll('.cv-sponge__arrow[data-selected]')).toHaveLength(1);
    expect(screen.getByText('Lane (1, 0) now holds what lane (1, 1) held')).toBeTruthy();
    fireEvent.mouseEnter(lane(0, 0));
    expect(screen.getByText('Lane (0, 0) stays where it is')).toBeTruthy();
  });

  it('χ: the selected row with a, b, c and a ⊕ (¬b ∧ c)', () => {
    render({ phase: 'chi', round: 0 });
    fireEvent.mouseEnter(lane(4, 2));
    expect(lane(0, 2).hasAttribute('data-in-row')).toBe(true);
    expect(lane(0, 1).hasAttribute('data-in-row')).toBe(false);
    expect([lane(4, 2), lane(0, 2), lane(1, 2)].map((cell) => cell.querySelector('[data-badge^="chi"]')?.textContent)).toEqual(['a', 'b', 'c']);
    expect(screen.getByText('Row 2: A′[4, 2] = a ⊕ (¬b ∧ c) with a = (4, 2), b = (0, 2), c = (1, 2)')).toBeTruthy();
    expect(values().map(([label]) => label)).toEqual(['a', 'b', 'c', '¬b ∧ c', 'after']);
    expect(values()[4]![1]).toBe('00000000 0000000b');
  });

  it('ι: lane (0, 0) ⊕ RC', () => {
    render({ phase: 'iota', round: 3, iota: { rc: '8000000080008000' } });
    expect(badges('iota')).toEqual(['⊕ RC']);
    expect(lane(0, 0).querySelector('[data-badge="iota"]')).not.toBeNull();
    expect(values()).toEqual([
      ['before', '00000000 00000001'],
      ['⊕ RC', '80000000 80008000'],
      ['after', 'ff000000 00000000'],
    ]);
  });

  it('squeeze: the rate bytes flow into the output, grouped by the lane they come from', () => {
    render({ phase: 'squeeze', output: '6162630600000000' + 'ff'.repeat(8) });
    expect(badges('output')).toHaveLength(17);
    const groups = [...document.querySelectorAll('.cv-sponge__group')];
    expect(groups.map((group) => group.textContent)).toEqual(['from (0, 0)61 62 63 06 00 00 00 00', 'from (1, 0)ff ff ff ff ff ff ff ff']);
    expect(groups[0]!.hasAttribute('data-selected')).toBe(true);
    fireEvent.mouseEnter(lane(1, 0));
    expect(groups[1]!.hasAttribute('data-selected')).toBe(true);
    expect(screen.getByText(english['view.sponge.output.endianness']!)).toBeTruthy();
  });

  it('output in the story lens: byte swatches instead of hex', () => {
    render({ phase: 'output', output: 'ff'.repeat(4) }, 'story');
    expect(document.querySelector('.cv-sponge__bytes')).toBeNull();
    expect(document.querySelectorAll('.cv-sponge__swatch')).toHaveLength(4);
  });

  it('keeps one lane in the tab order (roving focus); Home and End stay in the row', () => {
    render({ phase: 'round', round: 0 });
    expect(document.querySelectorAll('.cv-sponge__lane[tabindex="0"]')).toHaveLength(1);
    act(() => lane(0, 0).focus());
    fireEvent.keyDown(lane(0, 0), { key: 'ArrowDown' });
    fireEvent.keyDown(lane(0, 1), { key: 'End' });
    expect(document.activeElement).toBe(lane(4, 1));
    expect(lane(4, 1).getAttribute('tabindex')).toBe('0');
    expect(lane(0, 0).getAttribute('tabindex')).toBe('-1');
  });

  it('before the first sponge step: a hint and the initial lanes without overlays', () => {
    const { store } = render({ phase: 'absorb', input: AFTER.slice(0, 17) });
    act(() => store.getState().seek(-1));
    expect(screen.getByText(english['view.sponge.notYet']!)).toBeTruthy();
    expect(document.querySelectorAll('[data-badge]')).toHaveLength(0);
    expect(screen.getAllByRole('gridcell')).toHaveLength(25);
  });

  it('renders in German', () => {
    render({ phase: 'squeeze', output: '00' }, 'engineer', { ...loadViewMessages('de'), 'test.sponge.label': 'Keccak-f[1600]' });
    expect(screen.getByRole('region', { name: 'Sponge-Zustand' })).toBeTruthy();
    expect(badges('output')[0]).toBe('→ Ausgabe');
  });

  it('German: ρ in the singular for 1 bit, the glossary term „Rotationsweite“, the hint mentions tapping', () => {
    const german = { ...loadViewMessages('de'), 'test.sponge.label': 'Keccak-f[1600]' };
    render({ phase: 'rho', round: 0 }, 'engineer', german);
    expect(lane(1, 0).getAttribute('aria-label')).toContain('um 1 Bit nach links rotiert');
    expect(screen.getByText(/ρ rotiert jede Lane um ihre eigene feste Rotationsweite/)).toBeTruthy();
    expect(document.querySelector('.cv-sponge__hint')!.textContent).toMatch(/tipp/i);
  });

  it('explains when the facet is missing', () => {
    renderLab(<SpongeView labId="fixture" lens="story" />, { bundle: bundleWith(undefined), messages: english });
    expect(screen.getByRole('status').textContent).toBe(english['view.sponge.missing']);
  });
});
