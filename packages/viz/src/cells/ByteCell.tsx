import { useEffect, useRef } from 'react';
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
  onFocus?: () => void;
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

/** One labelled grid cell; a changed value flashes briefly unless reduced motion is requested. */
export function ByteCell(props: ByteCellProps) {
  const { value, row, col, index, elem = 'u8', highlight, tabbable = false, onFocus } = props;
  const label = useCellLabel(props);
  const reduceMotion = useReducedMotion() ?? false;
  const animateChange = useHasMounted() && !reduceMotion;

  return (
    <div
      role="gridcell"
      className={highlight === undefined ? 'cv-cell' : `cv-cell cv-cell--${highlight}`}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      data-row={row}
      data-col={col}
      data-index={index}
      data-highlight={highlight}
      onFocus={onFocus}
    >
      <m.span key={value} className="cv-cell__value" aria-hidden="true" initial={animateChange ? FLASH_FROM : false} animate={FLASH_TO} transition={FLASH_TRANSITION}>
        {toHex(value, elem)}
      </m.span>
      {highlight !== undefined && (
        <span className="cv-cell__glyph" aria-hidden="true">
          {HIGHLIGHT_GLYPHS[highlight]}
        </span>
      )}
    </div>
  );
}
