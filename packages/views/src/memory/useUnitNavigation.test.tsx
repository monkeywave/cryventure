import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUnitNavigation } from './useUnitNavigation.ts';

/** Rows of focusable units laid out as the memory grid does (`data-row` / `data-col`, roving tabindex). */
function Grid({ rowLengths }: { rowLengths: readonly number[] }) {
  const { gridRef, onKeyDown, isActive, setActive } = useUnitNavigation(rowLengths);
  return (
    <div ref={gridRef} role="grid" onKeyDown={onKeyDown}>
      {rowLengths.map((length, row) => (
        <div key={row} role="row">
          {Array.from({ length }, (_, col) => (
            <span
              key={col}
              role="gridcell"
              data-row={row}
              data-col={col}
              tabIndex={isActive(row, col) ? 0 : -1}
              onFocus={() => setActive({ row, col })}
            >
              {`${row}:${col}`}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const tabbable = () => [...document.querySelectorAll<HTMLElement>('[tabindex="0"]')].map((cell) => cell.textContent);
const press = (key: string) => fireEvent.keyDown(screen.getByRole('grid'), { key });

describe('useUnitNavigation', () => {
  it('starts with exactly one tabbable unit, the first', () => {
    render(<Grid rowLengths={[4, 4]} />);
    expect(tabbable()).toEqual(['0:0']);
  });

  it('moves focus and the tabbable unit with arrows, Home and End, clamping at the edges', () => {
    render(<Grid rowLengths={[4, 2]} />);
    press('ArrowRight');
    expect(document.activeElement?.textContent).toBe('0:1');
    press('End');
    expect(document.activeElement?.textContent).toBe('0:3');
    press('ArrowRight');
    expect(document.activeElement?.textContent).toBe('0:3');
    press('ArrowDown');
    expect(document.activeElement?.textContent).toBe('1:1');
    press('ArrowDown');
    expect(document.activeElement?.textContent).toBe('1:1');
    press('Home');
    expect(document.activeElement?.textContent).toBe('1:0');
    expect(tabbable()).toEqual(['1:0']);
  });

  it('handles (preventDefault) only navigation keys, leaving the rest to the lab shortcuts', () => {
    render(<Grid rowLengths={[4]} />);
    expect(fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowRight', cancelable: true })).toBe(false);
    expect(fireEvent.keyDown(screen.getByRole('grid'), { key: ' ', cancelable: true })).toBe(true);
    expect(tabbable()).toEqual(['0:1']);
  });

  it('keeps one unit tabbable when the rows shrink (bytes → u32 words)', () => {
    const { rerender } = render(<Grid rowLengths={[16, 16]} />);
    act(() => screen.getByText('1:13').focus());
    expect(tabbable()).toEqual(['1:13']);
    rerender(<Grid rowLengths={[4]} />);
    expect(tabbable()).toEqual(['0:3']);
  });
});
