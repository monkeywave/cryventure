import { memo, useEffect, useRef, type KeyboardEvent } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { ElemType, HighlightKind } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { HIGHLIGHT_GLYPHS } from './glyphs.ts';
import { formatHex, toHex } from './hex.ts';

export interface ByteCellProps {
  value: number;
  row: number;
  col: number;
  /** Flat value index inside the region. */
  index: number;
  elem?: ElemType;
  highlight?: HighlightKind;
  tabbable?: boolean;
  /** Focus moved onto this cell (index-based, so one stable callback serves every cell). */
  onFocusCell?: (row: number, col: number) => void;
  /** Displayed value while a step animates (the value before its switch); defaults to `value`. */
  shown?: number;
  /** Outside the current beat's focus: recedes, but stays legible. */
  dimmed?: boolean;
  /** Inside the current beat's focus: stands out (weight, ring, lift). */
  focused?: boolean;
  /** The selected (watched) cell. */
  selected?: boolean;
  /** Click / Enter selects the cell (called with its flat `index`). */
  onSelect?: (index: number) => void;
  /** The displayed element is not yet written (a placeholder, not a real value): shows `UNWRITTEN_TEXT`. */
  blank?: boolean;
}

/** Placeholder text of a not-yet-written cell (a symbol, not prose; the accessible name says it in words). */
export const UNWRITTEN_TEXT = '··';

const FLASH_FROM = { scale: 1.25, opacity: 0.5 };
const FLASH_TO = { scale: 1, opacity: 1 };
const FLASH_TRANSITION = { duration: 0.3 };

function useHasMounted(): boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  // Intentional: the first render must not flash; a stale `false` only affects that first render,
  // and every later value change remounts the keyed <m.span>, which re-reads this ref.
  // eslint-disable-next-line react-hooks/refs
  return mounted.current;
}

function useCellLabel({ value, row, col, elem = 'u8', highlight, blank = false }: ByteCellProps): string {
  const t = useT();
  const params = { row: row + 1, column: col + 1, value: blank ? t('ui.grid.unwritten') : formatHex(value, elem) };
  if (highlight === undefined) return t('ui.grid.cell', params);
  return t('ui.grid.cellHighlighted', { ...params, highlight: t(`ui.grid.highlight.${highlight}`) });
}

function cellClassName(highlight: HighlightKind | undefined): string {
  return highlight === undefined ? 'cv-cell' : `cv-cell cv-cell--${highlight}`;
}

/**
 * One labelled grid cell (memoised: it re-renders only when its own props change). Its grid drives
 * the step's choreography (CSS custom properties, `shown` switching to `value`); a changed shown
 * value flashes briefly unless reduced motion is requested (then CSS only cross-fades). The label
 * always states the end value.
 */
export const ByteCell = memo(function ByteCell(props: ByteCellProps) {
  const { value, shown = value, row, col, index, elem = 'u8', highlight, tabbable = false, onFocusCell, dimmed = false, focused = false, selected, onSelect, blank = false } = props;
  const label = useCellLabel(props);
  const reduceMotion = useReducedMotion() ?? false;
  const animateChange = useHasMounted() && !reduceMotion;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || onSelect === undefined) return;
    event.preventDefault();
    onSelect(index);
  };

  return (
    <div
      role="gridcell"
      className={cellClassName(highlight)}
      aria-label={label}
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-row={row}
      data-col={col}
      data-index={index}
      data-highlight={highlight}
      data-dimmed={dimmed ? '' : undefined}
      data-focused={focused ? '' : undefined}
      data-blank={blank ? '' : undefined}
      onFocus={onFocusCell === undefined ? undefined : () => onFocusCell(row, col)}
      onClick={onSelect === undefined ? undefined : () => onSelect(index)}
      onKeyDown={onKeyDown}
    >
      <m.span key={blank ? UNWRITTEN_TEXT : shown} className="cv-cell__value" aria-hidden="true" initial={animateChange ? FLASH_FROM : false} animate={FLASH_TO} transition={FLASH_TRANSITION}>
        {blank ? UNWRITTEN_TEXT : toHex(shown, elem)}
      </m.span>
      {highlight !== undefined && (
        <span className="cv-cell__glyph" aria-hidden="true">
          {HIGHLIGHT_GLYPHS[highlight]}
        </span>
      )}
    </div>
  );
});
