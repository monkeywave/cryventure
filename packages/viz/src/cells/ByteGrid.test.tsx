import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { motionValue } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '@cryventure/core';
import { renderLab } from '../testing/renderLab.tsx';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { ByteGrid, cellMotion, type ByteGridProps, type GridMotion } from './ByteGrid.tsx';

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
  it('renders a labelled grid of rows and gridcells', () => {
    renderGrid();
    expect(screen.getByRole('grid', { name: 'State' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
    expect(screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x01' })).toBeTruthy();
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

  it('uses the stacked layout by default', () => {
    renderGrid();
    expect(screen.getByRole('grid').className).toBe('cv-grid');
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

describe('cellMotion', () => {
  const progress = motionValue(0);
  const track: Track = { target: { region: 'state', index: 1 }, prop: 'emphasis', keyframes: [{ at: 0, value: 1 }] };
  const motion: GridMotion = { progress, before: [0, 9, 2], tracks: new Map([[1, [track]]]) };

  it('is undefined without grid motion', () => {
    expect(cellMotion(undefined, 0, 0)).toBeUndefined();
  });

  it('is undefined for an unchanged cell without tracks', () => {
    expect(cellMotion(motion, 0, 0)).toBeUndefined();
    expect(cellMotion(motion, 5, 7)).toBeUndefined();
  });

  it('animates a changed cell without tracks from its before value', () => {
    expect(cellMotion(motion, 2, 3)).toEqual({ progress, tracks: [], before: 2 });
  });

  it('animates a cell with tracks even when unchanged', () => {
    expect(cellMotion(motion, 1, 9)).toEqual({ progress, tracks: [track], before: 9 });
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

  it('dims every cell outside the focus set', () => {
    renderInLab({ focus: new Set([0, 5]) });
    const dimmed = screen.getAllByRole('gridcell').filter((cell) => cell.hasAttribute('data-dimmed'));
    expect(dimmed).toHaveLength(14);
    expect(cellAtIndex(0).hasAttribute('data-dimmed')).toBe(false);
    expect(cellAtIndex(5).hasAttribute('data-dimmed')).toBe(false);
  });

  it('dims nothing without a focus', () => {
    renderInLab({});
    expect(document.querySelectorAll('[data-dimmed]')).toHaveLength(0);
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
