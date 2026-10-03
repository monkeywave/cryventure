import type { Lens, Locale, TraceBundle } from '@cryventure/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, renderLab } from '@cryventure/viz/testing';
import { loadViewMessages } from '../messages.ts';
import MemoryView from './MemoryView.tsx';
import {
  X86_AESNI,
  X86_CREF,
  KEY_STEP,
  OUTPUT_STEP,
  deriverLabels,
  memoryBundle,
  memoryFacet,
  memoryFacets,
} from './testFixture.ts';

const messagesIn = (locale: Locale) => ({ ...loadViewMessages(locale), ...deriverLabels[locale] });

function render(
  options: { lens?: Lens; locale?: Locale; bundle?: TraceBundle; step?: number } = {},
) {
  const { lens = 'engineer', locale = 'en', bundle = memoryBundle(), step = KEY_STEP } = options;
  const result = renderLab(<MemoryView labId="fixture" lens={lens} />, {
    bundle,
    messages: messagesIn(locale),
  });
  act(() => result.store.getState().seek(step));
  return result;
}

const allocation = (id: string) =>
  document.querySelector<HTMLElement>(`[data-allocation="${id}"]`)!;
const unitsOf = (id: string) => [
  ...allocation(id).querySelectorAll<HTMLElement>('[role="gridcell"]'),
];
const unitAt = (id: string, offset: number) =>
  allocation(id).querySelector<HTMLElement>(`[role="gridcell"][data-offset="${offset}"]`)!;
const texts = (cells: HTMLElement[]) => cells.map((cell) => cell.firstElementChild?.textContent);
const legendOf = (id: string) =>
  allocation(id).querySelector('.cv-memory__legend')?.textContent ?? '';
const pickers = () => ({
  triple: screen.getByRole<HTMLSelectElement>('combobox', { name: 'Target' }),
  impl: screen.getByRole<HTMLSelectElement>('combobox', { name: 'Implementation' }),
});
const optionValues = (select: HTMLSelectElement) =>
  [...select.options].map((option) => option.value);
const wordsToggle = () => screen.getByRole('button', { name: 'u32 words' });

describe('MemoryView', () => {
  it('keeps the modeled badge visible in every lens', () => {
    for (const lens of ['story', 'engineer', 'cryptographer'] as const) {
      const { unmount } = render({ lens });
      expect(document.querySelector('.cv-memory__badge')?.firstChild?.textContent).toBe('Modeled');
      expect(document.querySelector('.cv-memory__badge')?.getAttribute('data-provenance')).toBe(
        'modeled',
      );
      unmount();
    }
  });

  it('shows each allocation with sizeof/alignof, an address ruler and hex rows of 16 with an address gutter', () => {
    render();
    const key = allocation('key');
    expect(key.querySelector('[data-counter="sizeof"]')?.textContent).toBe(
      'sizeof(struct aes_key_st) = 244',
    );
    expect(key.querySelector('[data-counter="alignof"]')?.textContent).toBe('alignof = 4');
    expect(allocation('in').querySelector('[data-counter="sizeof"]')?.textContent).toBe(
      'sizeof = 16',
    );
    const grid = within(key).getByRole('grid');
    expect(grid.getAttribute('aria-label')).toBe(
      'key – expanded key (AES_KEY) at 0x7ffc5e3a0ee0, 244 bytes',
    );
    const columnHeaders = within(grid).getAllByRole('columnheader');
    expect(columnHeaders.map((header) => header.textContent).slice(1)).toEqual([
      '+0',
      '+1',
      '+2',
      '+3',
      '+4',
      '+5',
      '+6',
      '+7',
      '+8',
      '+9',
      '+a',
      '+b',
      '+c',
      '+d',
      '+e',
      '+f',
    ]);
    const rowHeaders = within(grid).getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(16);
    expect(rowHeaders[1]?.textContent).toBe('0x7ffc5e3a0ef0');
    expect(rowHeaders[1]?.getAttribute('aria-label')).toBe('Address 0x7ffc5e3a0ef0');
    expect(unitsOf('key')).toHaveLength(244);
  });

  it('heads the second half of each full row with its own address (narrow panels wrap rows of 8)', () => {
    render();
    const halves = [...allocation('key').querySelectorAll('.cv-memory__gutter--half')];
    // 244 bytes: 15 full rows plus a 4-byte tail, which has no second half.
    expect(halves).toHaveLength(15);
    expect(halves[0]?.textContent).toBe('0x7ffc5e3a0ee8');
    expect(halves[1]?.textContent).toBe('0x7ffc5e3a0ef8');
    expect(halves.every((half) => half.getAttribute('aria-hidden') === 'true')).toBe(true);
    // The half gutter sits right before the unit at offset +8, and stays out of the grid's cells.
    const firstRow = halves[0]!.parentElement!;
    expect(halves[0]?.nextElementSibling?.getAttribute('data-offset')).toBe('8');
    expect(within(firstRow).getAllByRole('gridcell')).toHaveLength(16);
  });

  it('heads the second half of word rows too (u32 words span four columns)', async () => {
    render();
    await userEvent.click(wordsToggle());
    const halves = [...allocation('key').querySelectorAll('.cv-memory__gutter--half')];
    expect(halves[0]?.textContent).toBe('0x7ffc5e3a0ee8');
    expect(halves[0]?.nextElementSibling?.getAttribute('data-offset')).toBe('8');
  });

  it('shows c-ref words byte-reversed in RAM, ·· for bytes never written, and the field overlay', () => {
    render();
    expect(texts(unitsOf('key').slice(0, 4))).toEqual(['03', '02', '01', '00']);
    expect(unitAt('key', 176).textContent).toBe('··');
    expect(unitAt('key', 176).hasAttribute('data-unwritten')).toBe(true);
    expect(unitAt('key', 0).hasAttribute('data-field-start')).toBe(true);
    expect(unitAt('key', 4).hasAttribute('data-elem-start')).toBe(true);
    expect(unitAt('key', 5).hasAttribute('data-elem-start')).toBe(false);
    expect(unitAt('key', 240).dataset['field']).toBe('rounds');
    expect(unitAt('key', 5).getAttribute('aria-label')).toBe(
      '0x7ffc5e3a0ee5: 06, rd_key[1], round key 0, written in this step',
    );
    expect(unitAt('key', 200).getAttribute('aria-label')).toBe(
      '0x7ffc5e3a0fa8: never written, rd_key[50]',
    );
    expect(legendOf('key')).toContain('rd_key: unsigned int[60] at +0, 240 bytes');
    expect(legendOf('key')).toContain('host-endian u32 words');
    expect(legendOf('key')).toContain('rounds = 10');
    expect(allocation('key').querySelector('[data-padding]')).toBeNull();
  });

  it('flags the bytes written at the current step with a glyph', () => {
    const { store } = render();
    const flagged = () => unitsOf('key').filter((cell) => cell.hasAttribute('data-written'));
    expect(flagged()).toHaveLength(180);
    expect(flagged()[0]?.querySelector('.cv-memory__glyph')?.textContent).toBe('✎');
    act(() => store.getState().seek(KEY_STEP + 1));
    expect(flagged()).toHaveLength(0);
    act(() => store.getState().seek(OUTPUT_STEP));
    expect(unitsOf('out').every((cell) => cell.hasAttribute('data-written'))).toBe(true);
  });

  it('builds the pickers from facet metadata and only offers existing combinations', async () => {
    const user = userEvent.setup();
    render();
    expect(optionValues(pickers().triple)).toEqual(['x86_64-linux-gnu', 'aarch64-linux-gnu']);
    expect(optionValues(pickers().impl)).toEqual(['c-ref', 'aesni']);
    expect([...pickers().impl.options].map((option) => option.textContent)).toEqual([
      'OpenSSL C reference',
      'OpenSSL AES-NI',
    ]);
    await user.selectOptions(pickers().impl, 'aesni');
    await user.selectOptions(pickers().triple, 'aarch64-linux-gnu');
    expect(optionValues(pickers().impl)).toEqual(['c-ref', 'armv8']);
    expect(pickers().impl.value).toBe('c-ref');
    expect(allocation('key').querySelector('[role="grid"]')?.getAttribute('aria-label')).toMatch(
      /at 0xffff/,
    );
  });

  it('labels the target options with translated data model and byte order, not the bare triple', () => {
    render();
    expect([...pickers().triple.options].map((option) => option.textContent)).toEqual([
      'x86_64-linux-gnu (LP64, little-endian)',
      'aarch64-linux-gnu (LP64, little-endian)',
    ]);
  });

  it('names an address space without its own key through a translated fallback', () => {
    const facet = memoryFacet(X86_CREF);
    facet.allocations = facet.allocations.map((entry) => ({ ...entry, space: 'tls' }));
    for (const [locale, text] of [['en', 'tls region · '], ['de', 'Bereich tls · ']] as const) {
      const { unmount } = render({ locale, bundle: memoryBundle({ [X86_CREF]: facet }) });
      expect(document.querySelector('.cv-memory__addr')?.textContent).toContain(text);
      unmount();
    }
  });

  it('changes bytes and rounds when the implementation changes', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(pickers().impl, 'aesni');
    expect(texts(unitsOf('key').slice(0, 4))).toEqual(['00', '01', '02', '03']);
    expect(legendOf('key')).toContain('rounds = 9');
    expect(legendOf('key')).toContain('raw bytes');
    await user.selectOptions(pickers().impl, 'c-ref');
    expect(legendOf('key')).toContain('rounds = 10');
  });

  it('reads host-endian u32 fields as numbers with u32 words on (the endianness flip)', async () => {
    const user = userEvent.setup();
    render();
    expect(wordsToggle().getAttribute('aria-pressed')).toBe('false');
    await user.click(wordsToggle());
    expect(wordsToggle().getAttribute('aria-pressed')).toBe('true');
    expect(texts(unitsOf('key').slice(0, 4))).toEqual([
      '00010203',
      '04050607',
      '08090a0b',
      '0c0d0e0f',
    ]);
    expect(unitsOf('key')[0]?.dataset['kind']).toBe('word');
    expect(unitAt('key', 240).textContent).toContain('10');
    expect(unitAt('key', 240).dataset['kind']).toBe('int');
    expect(texts(unitsOf('in').slice(0, 2))).toEqual(['00', '11']);
    expect(screen.getByText(/in RAM each word's bytes run in reverse/)).toBeTruthy();
    await user.selectOptions(pickers().impl, 'aesni');
    expect(texts(unitsOf('key').slice(0, 4))).toEqual(['00', '01', '02', '03']);
    expect(screen.getByText(/stores its round keys as raw bytes/)).toBeTruthy();
    await user.click(wordsToggle());
    expect(screen.queryByText(/stores its round keys as raw bytes/)).toBeNull();
  });

  it('highlights the range of the selected value and keeps it across a variant switch', async () => {
    const user = userEvent.setup();
    const { store } = render();
    act(() => store.getState().select('3/roundKey'));
    const linked = () =>
      unitsOf('key')
        .filter((cell) => cell.hasAttribute('data-linked'))
        .map((cell) => Number(cell.dataset['offset']));
    expect(linked()).toEqual(Array.from({ length: 16 }, (_, index) => 48 + index));
    expect(allocation('key').hasAttribute('data-linked')).toBe(true);
    expect(allocation('in').hasAttribute('data-linked')).toBe(false);
    expect(unitAt('key', 48).getAttribute('aria-label')).toMatch(/linked to the selection$/);
    await user.selectOptions(pickers().impl, 'aesni');
    expect(linked()).toHaveLength(16);
    act(() => store.getState().select('plaintext'));
    expect(unitsOf('in').every((cell) => cell.hasAttribute('data-linked'))).toBe(true);
    act(() => store.getState().select(null));
    expect(linked()).toEqual([]);
  });

  it('publishes the round key of a hovered or focused ref range', () => {
    const { store } = render();
    fireEvent.mouseEnter(unitAt('key', 20));
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    act(() => unitAt('key', 170).focus());
    expect(store.getState().selection.valueRefId).toBe('10/roundKey');
    fireEvent.mouseEnter(unitAt('key', 200));
    fireEvent.mouseEnter(unitAt('in', 0));
    expect(store.getState().selection.valueRefId).toBe('10/roundKey');
  });

  it('clears the published round key when the pointer leaves or focus moves away', () => {
    const { store } = render();
    fireEvent.mouseEnter(unitAt('key', 20));
    expect(store.getState().selection.valueRefId).toBe('1/roundKey');
    fireEvent.mouseLeave(unitAt('key', 20));
    expect(store.getState().selection.valueRefId).toBeNull();
    act(() => unitAt('key', 170).focus());
    expect(store.getState().selection.valueRefId).toBe('10/roundKey');
    act(() => unitAt('key', 170).blur());
    expect(store.getState().selection.valueRefId).toBeNull();
  });

  it('leaves a selection another view made meanwhile when the pointer leaves', () => {
    const { store } = render();
    fireEvent.mouseEnter(unitAt('key', 20));
    act(() => store.getState().select('2/roundKey'));
    fireEvent.mouseLeave(unitAt('key', 20));
    expect(store.getState().selection.valueRefId).toBe('2/roundKey');
  });

  it('moves focus with roving tabindex inside the grid (bytes and words)', async () => {
    const user = userEvent.setup();
    render();
    const tabbable = () => unitsOf('key').filter((cell) => cell.tabIndex === 0);
    expect(tabbable()).toHaveLength(1);
    act(() => unitAt('key', 0).focus());
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(unitAt('key', 1));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(unitAt('key', 17));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(unitAt('key', 31));
    expect(tabbable()).toEqual([unitAt('key', 31)]);
    await user.click(wordsToggle());
    expect(tabbable()).toEqual([unitAt('key', 28)]);
  });

  it('story lens: allocations as labelled blocks without hex', () => {
    render({ lens: 'story' });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('button', { name: 'u32 words' })).toBeNull();
    const segments = [...allocation('key').querySelectorAll<HTMLElement>('.cv-memory__segment')];
    expect(segments.map((segment) => segment.textContent)).toEqual([
      'rd_key · 240 bytes176 of 240 written',
      'rounds · 4 bytes4 of 4 written',
    ]);
    expect(segments.map((segment) => segment.dataset['written'])).toEqual(['some', 'all']);
    expect(allocation('out').querySelector('.cv-memory__segment')?.textContent).toBe(
      '16 bytes0 of 16 written',
    );
    expect(allocation('key').querySelector('[data-counter="sizeof"]')?.textContent).toBe(
      'sizeof(struct aes_key_st) = 244',
    );
  });

  it('cryptographer lens: labels each round key in the address gutter', () => {
    render({ lens: 'cryptographer' });
    const tags = [...allocation('key').querySelectorAll('.cv-memory__reftag')].map(
      (tag) => tag.textContent,
    );
    expect(tags).toEqual([
      'rk0',
      'rk1',
      'rk2',
      'rk3',
      'rk4',
      'rk5',
      'rk6',
      'rk7',
      'rk8',
      'rk9',
      'rk10',
    ]);
    expect(within(allocation('key')).getAllByRole('rowheader')[3]?.getAttribute('aria-label')).toBe(
      'Address 0x7ffc5e3a0f10, round key 3',
    );
    expect(screen.getByText(/^Round keys in memory/)).toBeTruthy();
  });

  it('engineer lens has no round-key labels', () => {
    render();
    expect(document.querySelector('.cv-memory__reftag')).toBeNull();
  });

  it('hatches padding when the layout has gaps', () => {
    const facet = memoryFacet(X86_CREF);
    const key = facet.allocations.find((item) => item.id === 'key')!;
    key.layout!.fields = [
      key.layout!.fields[0]!,
      { ...key.layout!.fields[1]!, offset: 242, size: 2, type: 'short', encoding: undefined },
    ];
    render({ bundle: memoryBundle({ [X86_CREF]: facet }) });
    expect([240, 241].map((offset) => unitAt('key', offset).hasAttribute('data-padding'))).toEqual([
      true,
      true,
    ]);
    expect(unitAt('key', 242).hasAttribute('data-padding')).toBe(false);
    expect(allocation('key').querySelector('.cv-memory__legend [data-padding]')?.textContent).toBe(
      'Padding (hatched): bytes no field uses',
    );
  });

  it('uses the derived cache when the bundle has no memory facet', () => {
    const bundle = createFixtureBundle();
    const { store } = renderLab(<MemoryView labId="fixture" lens="engineer" />, {
      bundle,
      messages: messagesIn('en'),
    });
    expect(screen.getByRole('status').textContent).toBe(
      'This lab does not model memory for this run.',
    );
    act(() =>
      store.getState().setDerivedFacets(bundle, {
        [X86_AESNI]: memoryFacets[X86_AESNI],
        [X86_CREF]: memoryFacets[X86_CREF],
      }),
    );
    expect(pickers().impl.value).toBe('aesni');
    expect(optionValues(pickers().impl)).toEqual(['aesni', 'c-ref']);
  });

  it('renders in German', () => {
    render({ locale: 'de', lens: 'cryptographer' });
    expect(document.querySelector('.cv-memory__badge')?.firstChild?.textContent).toBe('Modelliert');
    expect(screen.getByRole('button', { name: 'u32-Wörter' })).toBeTruthy();
    expect(allocation('key').querySelector('.cv-memory__legend')?.getAttribute('aria-label')).toBe(
      'Struct-Layout',
    );
    expect(screen.getByText(/^Rundenschlüssel im Speicher/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/view\.memory\./);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Ziel' }).options[0]?.textContent).toBe(
      'x86_64-linux-gnu (LP64, Little-Endian)',
    );
  });
});
