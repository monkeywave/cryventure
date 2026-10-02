import { useEffect, useRef, type KeyboardEvent } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { ElemType, HighlightKind } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { HIGHLIGHT_GLYPHS } from './glyphs.ts';
import { formatHex, toHex } from './hex.ts';
import { useNodeStyle, useShowsAfter, type CellMotion } from './useCellMotion.ts';

export interface ByteCellProps {
  value: number;
  row: number;
  col: number;
  /** Flat value index inside the region. */
  index: number;
  elem?: ElemType;
  highlight?: HighlightKind;
  tabbable?: boolean;
  onFocus?: () => void;
  /** Choreography of the current step (moves, pulses, value switch); static without it. */
  motion?: CellMotion;
  /** Outside the current beat's focus: recedes, but stays legible. */
  dimmed?: boolean;
  /** Inside the current beat's focus: stands out (weight, ring, lift). */
  focused?: boolean;
  /** The selected (watched) cell. */
  selected?: boolean;
  /** Click / Enter selects the cell. */
  onSelect?: () => void;
}

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

function useCellLabel({ value, row, col, elem = 'u8', highlight }: ByteCellProps): string {
  const t = useT();
  const params = { row: row + 1, column: col + 1, value: formatHex(value, elem) };
  if (highlight === undefined) return t('ui.grid.cell', params);
  return t('ui.grid.cellHighlighted', { ...params, highlight: t(`ui.grid.highlight.${highlight}`) });
}

function cellClassName(highlight: HighlightKind | undefined): string {
  return highlight === undefined ? 'cv-cell' : `cv-cell cv-cell--${highlight}`;
}

/**
 * One labelled grid cell. With `motion` it follows the step's choreography (CSS custom properties
 * written per frame, value switching from `before` to `value`); a changed value flashes briefly
 * unless reduced motion is requested (then CSS only cross-fades). The label always states the end value.
 */
export function ByteCell(props: ByteCellProps) {
  const { value, row, col, index, elem = 'u8', highlight, tabbable = false, onFocus, motion, dimmed = false, focused = false, selected, onSelect } = props;
  const label = useCellLabel(props);
  const cellRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const animateChange = useHasMounted() && !reduceMotion;
  const shown = useShowsAfter(motion) ? value : (motion?.before ?? value);
  useNodeStyle(cellRef, motion);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || onSelect === undefined) return;
    event.preventDefault();
    onSelect();
  };

  return (
    <div
      ref={cellRef}
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
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <m.span key={shown} className="cv-cell__value" aria-hidden="true" initial={animateChange ? FLASH_FROM : false} animate={FLASH_TO} transition={FLASH_TRANSITION}>
        {toHex(shown, elem)}
      </m.span>
      {highlight !== undefined && (
        <span className="cv-cell__glyph" aria-hidden="true">
          {HIGHLIGHT_GLYPHS[highlight]}
        </span>
      )}
    </div>
  );
}
