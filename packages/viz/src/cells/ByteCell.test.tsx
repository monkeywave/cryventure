import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { ByteCell } from './ByteCell.tsx';

const renderCell = (ui: React.ReactNode, messages = vizMessages.en) =>
  render(
    <I18nProvider messages={messages}>
      <div role="grid">
        <div role="row">{ui}</div>
      </div>
    </I18nProvider>,
  );

describe('ByteCell', () => {
  it('shows hex and a 1-based, translated aria-label', () => {
    renderCell(<ByteCell value={0x3a} row={0} col={1} index={4} />);
    const cell = screen.getByRole('gridcell', { name: 'row 1, column 2, value 0x3a' });
    expect(cell.textContent).toBe('3a');
    expect(cell.getAttribute('data-index')).toBe('4');
    expect(cell.tabIndex).toBe(-1);
  });

  it('marks highlights with class, data attribute, glyph and label', () => {
    renderCell(<ByteCell value={1} row={2} col={3} index={0} highlight="xor" tabbable />);
    const cell = screen.getByRole('gridcell', { name: 'row 3, column 4, value 0x01, XOR-combined' });
    expect(cell.className).toContain('cv-cell--xor');
    expect(cell.getAttribute('data-highlight')).toBe('xor');
    expect(cell.querySelector('.cv-cell__glyph')?.textContent).toBe('⊕');
    expect(cell.tabIndex).toBe(0);
  });

  it('translates to German', () => {
    renderCell(<ByteCell value={0xff} row={0} col={0} index={0} highlight="sbox" />, vizMessages.de);
    expect(screen.getByRole('gridcell', { name: 'Zeile 1, Spalte 1, Wert 0xff, durch die S-Box ersetzt' })).toBeTruthy();
  });

  it('keeps showing the latest value after a change', () => {
    const { rerender } = renderCell(<ByteCell value={1} row={0} col={0} index={0} />);
    rerender(
      <I18nProvider messages={vizMessages.en}>
        <div role="grid">
          <div role="row">
            <ByteCell value={2} row={0} col={0} index={0} />
          </div>
        </div>
      </I18nProvider>,
    );
    expect(screen.getByRole('gridcell').textContent).toBe('02');
  });
});
