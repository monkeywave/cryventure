import { useMemo } from 'react';
import type { MotionValue } from 'motion/react';
import type { ElemType, HighlightKind, Track } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { ByteCell } from './ByteCell.tsx';
import { formatOffset } from './hex.ts';
import { cellIndex, highlightMap, type GridHighlight, type GridOrder, type GridShape } from './gridLayout.ts';
import type { CellMotion } from './useCellMotion.ts';
import { useGridNavigation } from './useGridNavigation.ts';

export interface ByteGridProps {
  values: readonly number[];
  shape: GridShape;
  /** How flat `values` map onto rows/columns (AES state is col-major). */
  order?: GridOrder;
  elem?: ElemType;
  /** Indices refer to flat positions in `values`. */
  highlights?: readonly GridHighlight[];
  /** Accessible name of the grid (already translated). */
  label: string;
  /** Optional offset gutter: the flat value offset of each row's first cell, rendered as row headers. */
  rowOffsets?: readonly number[];
  /** Optional custom row headers (already translated); takes precedence over `rowOffsets`. */
  rowHeaders?: readonly GridRowHeader[];
  /** `wrap`: rows flow side by side and wrap to the available width (e.g. key-schedule words). */
  layout?: GridLayoutMode;
  /** The current step's choreography for this grid (cells animate between `before` and `values`). */
  motion?: GridMotion;
  /** Flat indices in the current beat's focus (marked focused); every other cell is dimmed. */
  focus?: ReadonlySet<number>;
  /** Flat index of the selected (watched) cell. */
  selectedIndex?: number;
  /** Makes cells selectable (click / Enter). */
  onSelectCell?: (index: number) => void;
}

/** Per-grid choreography: the shared progress playhead, the values before the step and tracks per flat index. */
export interface GridMotion {
  progress: MotionValue<number>;
  before: readonly number[];
  tracks: ReadonlyMap<number, readonly Track[]>;
}

const NO_TRACKS: readonly Track[] = [];

/** A cell animates when it has tracks or its value changes in this step. */
export function cellMotion(motion: GridMotion | undefined, index: number, value: number): CellMotion | undefined {
  if (motion === undefined) return undefined;
  const tracks = motion.tracks.get(index) ?? NO_TRACKS;
  const before = motion.before[index] ?? value;
  if (tracks.length === 0 && before === value) return undefined;
  return { progress: motion.progress, tracks, before };
}

export type GridLayoutMode = 'stack' | 'wrap';

/** A row header: visible `text`, accessible `label`, and whether the row is in focus of the current step. */
export interface GridRowHeader {
  text: string;
  label: string;
  current?: boolean;
}

/** Camera-lite: with a beat focus, cells inside it are focused and every other cell is dimmed. */
function beatFocus(focus: ReadonlySet<number> | undefined, index: number): Pick<CellModel, 'dimmed' | 'focused'> {
  if (focus === undefined) return { dimmed: false, focused: false };
  const inFocus = focus.has(index);
  return { dimmed: !inFocus, focused: inFocus };
}

const NO_HIGHLIGHTS: readonly GridHighlight[] = [];

interface CellModel {
  index: number;
  value: number;
  highlight: HighlightKind | undefined;
  motion: CellMotion | undefined;
  dimmed: boolean;
  focused: boolean;
  selected: boolean | undefined;
}

interface RowProps {
  row: number;
  cols: number;
  header: GridRowHeader | undefined;
  cellAt: (row: number, col: number) => CellModel;
  elem: ElemType;
  isActive: (row: number, col: number) => boolean;
  activate: (row: number, col: number) => void;
  onSelectCell: ((index: number) => void) | undefined;
}

function RowHeader({ header }: { header: GridRowHeader }) {
  return (
    <div role="rowheader" className="cv-grid__offset" aria-label={header.label}>
      {header.text}
    </div>
  );
}

/** Explicit headers win; otherwise the offset gutter is translated into headers. */
function useRowHeaders(rowOffsets: readonly number[] | undefined, rowHeaders: readonly GridRowHeader[] | undefined): readonly GridRowHeader[] | undefined {
  const t = useT();
  if (rowHeaders !== undefined) return rowHeaders;
  return rowOffsets?.map((offset) => {
    const text = formatOffset(offset);
    return { text, label: t('ui.grid.offset', { offset: text }) };
  });
}

function GridRow({ row, cols, header, cellAt, elem, isActive, activate, onSelectCell }: RowProps) {
  return (
    <div role="row" className="cv-grid__row" data-current={header?.current ? '' : undefined}>
      {header !== undefined && <RowHeader header={header} />}
      {Array.from({ length: cols }, (_, col) => {
        const cell = cellAt(row, col);
        return (
          <ByteCell
            key={col}
            row={row}
            col={col}
            index={cell.index}
            value={cell.value}
            elem={elem}
            highlight={cell.highlight}
            tabbable={isActive(row, col)}
            onFocus={() => activate(row, col)}
            motion={cell.motion}
            dimmed={cell.dimmed}
            focused={cell.focused}
            selected={cell.selected}
            onSelect={onSelectCell === undefined ? undefined : () => onSelectCell(cell.index)}
          />
        );
      })}
    </div>
  );
}

/**
 * Generic labelled byte grid (`role="grid"`) with highlight classes, glyph fallbacks, roving focus,
 * optional choreography (`motion`), beat focus dimming and cell selection.
 */
export function ByteGrid(props: ByteGridProps) {
  const { values, shape, order = 'row-major', elem = 'u8', highlights = NO_HIGHLIGHTS, label, rowOffsets, rowHeaders, layout = 'stack' } = props;
  const { motion, focus, selectedIndex, onSelectCell } = props;
  const [rows, cols] = shape;
  const headers = useRowHeaders(rowOffsets, rowHeaders);
  const byIndex = useMemo(() => highlightMap(highlights), [highlights]);
  const { gridRef, onKeyDown, isActive, setActive } = useGridNavigation(shape);
  const cellAt = (row: number, col: number): CellModel => {
    const index = cellIndex(row, col, shape, order);
    const value = values[index] ?? 0;
    return {
      index,
      value,
      highlight: byIndex.get(index),
      motion: cellMotion(motion, index, value),
      ...beatFocus(focus, index),
      selected: onSelectCell === undefined ? undefined : index === selectedIndex,
    };
  };

  return (
    <div ref={gridRef} role="grid" className={layout === 'wrap' ? 'cv-grid cv-grid--wrap' : 'cv-grid'} aria-label={label} data-order={order} onKeyDown={onKeyDown}>
      {Array.from({ length: rows }, (_, row) => (
        <GridRow
          key={row}
          row={row}
          cols={cols}
          header={headers?.[row]}
          cellAt={cellAt}
          elem={elem}
          isActive={isActive}
          activate={(r, c) => setActive({ row: r, col: c })}
          onSelectCell={onSelectCell}
        />
      ))}
    </div>
  );
}
