import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { motionValue } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@cryventure/core';
import { renderLab } from '../testing/renderLab.tsx';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { ByteGrid, type ByteGridProps } from './ByteGrid.tsx';

const values = Array.from({ length: 16 }, (_, i) => i);

function renderGrid(props: Partial<ByteGridProps> = {}) {
  return render(
    <I18nProvider messages={vizMessages.en}>
      <ByteGrid values={values} shape={[4, 4]} label="State" {...props} />
    </I18nProvider>,
  );
}

const rowTexts = () => screen.getAllByRole('row').map((row) => within(row).getAllByRole('gridcell').map((cell) => cell.textContent));

describe('ByteGrid', () => {
  it('flags the edges where cells hide in a scrolled grid (for the edge fade)', () => {
    renderGrid({ shape: [1, 16] });
    const grid = screen.getByRole('grid');
    expect(grid.hasAttribute('data-overflow-end')).toBe(false);
    Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(grid, 'scrollWidth', { configurable: true, value: 700 });
    fireEvent.scroll(grid);
    expect(grid.hasAttribute('data-overflow-end')).toBe(true);
    expect(grid.hasAttribute('data-overflow-start')).toBe(false);
    grid.scrollLeft = 400;
    fireEvent.scroll(grid);
    expect(grid.hasAttribute('data-overflow-end')).toBe(false);
    expect(grid.hasAttribute('data-overflow-start')).toBe(true);
  });

  it('renders a labelled grid of rows and gridcells', () => {
    renderGrid();
    expect(screen.getByRole('grid', { name: 'State' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
    expect(screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x01' })).toBeTruthy();
  });

  it('draws not-yet-written cells as a muted placeholder with a spoken "not yet written"', () => {
    renderGrid({ unwritten: new Set([0, 5]) });
    expect(rowTexts()[0]).toEqual(['··', '01', '02', '03']);
    const blank = screen.getByRole('gridcell', { name: 'row 2, column 2, value not yet written' });
    expect(blank.hasAttribute('data-blank')).toBe(true);
    expect(screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x01' }).hasAttribute('data-blank')).toBe(false);
  });

  it('says "not yet written" in German', () => {
    render(
      <I18nProvider messages={vizMessages.de}>
        <ByteGrid values={values} shape={[4, 4]} label="Zustand" unwritten={new Set([0])} />
      </I18nProvider>,
    );
    expect(screen.getByRole('gridcell', { name: 'Zeile 1, Spalte 1, Wert noch nicht geschrieben' })).toBeTruthy();
  });

  it('labels each column above the cells when given column headers', () => {
    const columnHeaders = ['+0', '+1', '+2', '+3'].map((text) => ({ text, label: `offset ${text}` }));
    renderGrid({ values: values.slice(0, 4), shape: [1, 4], columnHeaders });
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['+0', '+1', '+2', '+3']);
    expect(headers[3]?.getAttribute('aria-label')).toBe('offset +3');
    expect(screen.getAllByRole('gridcell')).toHaveLength(4);
  });

  it('lays out col-major values down the columns', () => {
    renderGrid({ order: 'col-major' });
    expect(rowTexts()[0]).toEqual(['00', '04', '08', '0c']);
    expect(screen.getByRole('gridcell', { name: 'row 2, column 1, value 0x01' })).toBeTruthy();
  });

  it('applies highlights by flat value index', () => {
    renderGrid({ order: 'col-major', highlights: [{ indices: [1], kind: 'sbox' }] });
    const cell = screen.getByRole('gridcell', { name: 'row 2, column 1, value 0x01, substituted by the S-box' });
    expect(cell.getAttribute('data-highlight')).toBe('sbox');
    expect(document.querySelectorAll('[data-highlight]')).toHaveLength(1);
  });

  it('renders an offset gutter as row headers', () => {
    render(
      <I18nProvider messages={vizMessages.en}>
        <ByteGrid values={Array.from({ length: 32 }, (_, i) => i)} shape={[2, 16]} label="w" rowOffsets={[0, 16]} />
      </I18nProvider>,
    );
    const headers = screen.getAllByRole('rowheader');
    expect(headers.map((header) => header.textContent)).toEqual(['0x0000', '0x0010']);
    expect(headers[1]?.getAttribute('aria-label')).toBe('offset 0x0010');
  });

  it('prefers explicit row headers, marks current rows and supports the wrap layout', () => {
    const rowHeaders = [
      { text: 'w0', label: 'word 0' },
      { text: 'w1', label: 'word 1, current', current: true },
    ];
    renderGrid({ shape: [2, 4], rowOffsets: [0, 4], rowHeaders, layout: 'wrap' });
    const headers = screen.getAllByRole('rowheader');
    expect(headers.map((header) => header.textContent)).toEqual(['w0', 'w1']);
    expect(headers[1]?.getAttribute('aria-label')).toBe('word 1, current');
    const rows = screen.getAllByRole('row');
    expect(rows.map((row) => row.hasAttribute('data-current'))).toEqual([false, true]);
    expect(screen.getByRole('grid').classList.contains('cv-grid--wrap')).toBe(true);
  });

  it('groups wrap rows into lines of wrapColumns rows, marking each line start', () => {
    renderGrid({ shape: [4, 4], layout: 'wrap', wrapColumns: 2 });
    const grid = screen.getByRole('grid');
    expect(grid.style.getPropertyValue('--cv-wrap-columns')).toBe('2');
    expect(screen.getAllByRole('row').map((row) => row.hasAttribute('data-line-start'))).toEqual([true, false, true, false]);
  });

  it('uses the stacked layout by default', () => {
    renderGrid();
    expect(screen.getByRole('grid').className).toBe('cv-grid');
    expect(screen.getByRole('grid').hasAttribute('style')).toBe(false);
    expect(document.querySelectorAll('[data-line-start]')).toHaveLength(0);
  });

  it('uses a roving tabindex moved by arrow keys, consuming the key', () => {
    renderGrid();
    const first = screen.getByRole('gridcell', { name: 'row 1, column 1, value 0x00' });
    expect(first.tabIndex).toBe(0);
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    fireEvent(first, event);
    expect(event.defaultPrevented).toBe(true);
    const second = screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x01' });
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('row 2, column 2, value 0x05');
  });

  it('lets unrelated keys through', () => {
    renderGrid();
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    fireEvent(screen.getAllByRole('gridcell')[0]!, event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('ByteGrid height cap and current row', () => {
  afterEach(() => vi.restoreAllMocks());

  const headers = (current: number) => Array.from({ length: 8 }, (_, row) => ({ text: `w${row}`, label: `word ${row}`, current: row === current }));
  const grid = (current: number, maxBlockSize?: string) => (
    <I18nProvider messages={vizMessages.en}>
      <ByteGrid values={values} shape={[8, 2]} label="Schedule" rowHeaders={headers(current)} maxBlockSize={maxBlockSize} />
    </I18nProvider>
  );

  it('caps its height only when asked (viz owns the cap)', () => {
    const { rerender } = render(grid(0));
    expect(screen.getByRole('grid').classList.contains('cv-grid--capped')).toBe(false);
    rerender(grid(0, '20rem'));
    const capped = screen.getByRole('grid');
    expect(capped.classList.contains('cv-grid--capped')).toBe(true);
    expect(capped.style.getPropertyValue('--cv-grid-max-block')).toBe('20rem');
  });

  it('reveals the current row when its index changes, not on every new headers array', () => {
    // 8 rows of 100px in a 100px-high scroller; boxes ignore scrollTop, so reset it between checks.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = this.classList.contains('cv-grid__row') ? [...this.parentElement!.children].indexOf(this) : 0;
      return DOMRect.fromRect({ y: row * 100, height: 100 });
    });
    const { rerender } = render(grid(3, '20rem'));
    const scroller = screen.getByRole('grid');
    expect(scroller.scrollTop).toBe(300);
    scroller.scrollTop = 0;
    rerender(grid(3, '20rem'));
    expect(scroller.scrollTop).toBe(0);
    rerender(grid(5, '20rem'));
    expect(scroller.scrollTop).toBe(500);
  });
});

describe('ByteGrid choreography and selection', () => {
  const renderInLab = (props: Partial<ByteGridProps>) => renderLab(<ByteGrid values={values} shape={[4, 4]} label="State" {...props} />);
  const cellAtIndex = (index: number) => document.querySelector(`[data-index="${index}"]`) as HTMLElement;

  it('animates changed cells and tracked cells from the grid motion', () => {
    const progress = motionValue(0);
    const before = values.map((value, index) => (index === 3 ? 0x77 : value));
    const track: Track = { target: { region: 'state', index: 5 }, prop: 'scale', keyframes: [{ at: 0, value: 2 }] };
    renderInLab({ motion: { progress, before, tracks: new Map([[5, [track]]]) } });
    expect(cellAtIndex(3).textContent).toBe('77');
    expect(cellAtIndex(3).getAttribute('aria-label')).toBe('row 1, column 4, value 0x03');
    expect(cellAtIndex(5).style.getPropertyValue('--cv-scale')).toBe('2');
    expect(cellAtIndex(0).hasAttribute('data-animated')).toBe(false);
    act(() => progress.set(1));
    expect(cellAtIndex(3).textContent).toBe('03');
  });

  it('keeps a newly written cell as a placeholder until its value switches, even if it writes 00', () => {
    const progress = motionValue(0);
    renderInLab({ motion: { progress, before: values, unwrittenBefore: new Set([0, 1]), tracks: new Map() }, unwritten: new Set([1]) });
    expect(cellAtIndex(0).textContent).toBe('··');
    act(() => progress.set(1));
    expect(cellAtIndex(0).textContent).toBe('00');
    expect(cellAtIndex(1).textContent).toBe('··');
  });

  it('dims every cell outside the focus set', () => {
    renderInLab({ focus: new Set([0, 5]) });
    const dimmed = screen.getAllByRole('gridcell').filter((cell) => cell.hasAttribute('data-dimmed'));
    expect(dimmed).toHaveLength(14);
    expect(cellAtIndex(0).hasAttribute('data-dimmed')).toBe(false);
    expect(cellAtIndex(5).hasAttribute('data-dimmed')).toBe(false);
  });

  it('marks exactly the cells inside the focus set as focused', () => {
    renderInLab({ focus: new Set([0, 5]) });
    const focused = screen.getAllByRole('gridcell').filter((cell) => cell.hasAttribute('data-focused'));
    expect(focused).toEqual([cellAtIndex(0), cellAtIndex(5)]);
    expect(focused.some((cell) => cell.hasAttribute('data-dimmed'))).toBe(false);
  });

  it('dims nothing without a focus', () => {
    renderInLab({});
    expect(document.querySelectorAll('[data-dimmed]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-focused]')).toHaveLength(0);
  });

  it('has no aria-selected without onSelectCell', () => {
    renderInLab({ selectedIndex: 2 });
    expect(document.querySelectorAll('[aria-selected]')).toHaveLength(0);
  });

  it('marks the selected index and reports clicked / Enter-ed cells by flat index', () => {
    const onSelectCell = vi.fn();
    renderInLab({ order: 'col-major', selectedIndex: 4, onSelectCell });
    expect(cellAtIndex(4).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('gridcell').filter((cell) => cell.getAttribute('aria-selected') === 'false')).toHaveLength(15);
    fireEvent.click(screen.getByRole('gridcell', { name: 'row 2, column 1, value 0x01' }));
    expect(onSelectCell).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(cellAtIndex(9), { key: 'Enter' });
    expect(onSelectCell).toHaveBeenLastCalledWith(9);
  });
});
