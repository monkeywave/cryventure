import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
