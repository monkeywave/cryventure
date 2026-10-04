import { useCallback, useMemo, type CSSProperties } from 'react';
import type { ElemType, HighlightKind } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { ByteCell } from './ByteCell.tsx';
import { formatOffset } from './hex.ts';
import { cellIndex, highlightMap, type GridHighlight, type GridOrder, type GridShape } from './gridLayout.ts';
import type { GridMotion } from './gridMotion.ts';
import { useGridMotion } from './useGridMotion.ts';
import { useGridNavigation } from './useGridNavigation.ts';
import { useRevealCurrentRow } from './useRevealCurrentRow.ts';
import { useScrollEdges } from './useScrollRegion.ts';

export type { GridMotion } from './gridMotion.ts';

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
  /** Optional column headers (already translated), e.g. per-byte addresses `+0`, `+1`, … above a memory row. */
  columnHeaders?: readonly GridRowHeader[];
  /** `wrap`: rows flow side by side and wrap to the available width (e.g. key-schedule words). */
  layout?: GridLayoutMode;
  /**
   * `wrap` layout: rows per visual line when the container is wide enough (e.g. a producer's
   * `wordsPerGroup`); narrow containers show one row per line. Default 1.
   */
  wrapColumns?: number;
  /** The current step's choreography for this grid (cells animate between `before` and `values`). */
  motion?: GridMotion;
  /** Flat indices in the current beat's focus (marked focused); every other cell is dimmed. */
  focus?: ReadonlySet<number>;
  /** Flat index of the selected (watched) cell. */
  selectedIndex?: number;
  /** Makes cells selectable (click / Enter). */
  onSelectCell?: (index: number) => void;
  /** Flat indices not yet written at the playhead: drawn as placeholders, not as their (meaningless) value. */
  unwritten?: ReadonlySet<number>;
  /**
   * Caps the grid's height (a CSS length, e.g. `20rem`): a long grid then scrolls vertically on its
   * own, fades the hidden edge and keeps the current row in view, instead of stretching its panel.
   */
  maxBlockSize?: string;
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
  shown: number;
  highlight: HighlightKind | undefined;
  dimmed: boolean;
  focused: boolean;
  selected: boolean | undefined;
  blank: boolean;
}

interface RowProps {
  row: number;
  /** First row of a visual line in the `wrap` layout (only it shows its header there). */
  lineStart: boolean;
  cols: number;
  header: GridRowHeader | undefined;
  cellAt: (row: number, col: number) => CellModel;
  elem: ElemType;
  isActive: (row: number, col: number) => boolean;
  onFocusCell: (row: number, col: number) => void;
  onSelectCell: ((index: number) => void) | undefined;
}

/** Header row above the cells; keeps an empty corner when the rows have headers too. */
function ColumnHeaderRow({ headers, corner }: { headers: readonly GridRowHeader[]; corner: boolean }) {
  return (
    <div role="row" className="cv-grid__row cv-grid__head">
      {corner && <div className="cv-grid__offset" aria-hidden="true" />}
      {headers.map((header, col) => (
        <div key={col} role="columnheader" className="cv-grid__colhead" aria-label={header.label}>
          {header.text}
        </div>
      ))}
    </div>
  );
}

function RowHeader({ header }: { header: GridRowHeader }) {
  return (
    <div role="rowheader" className="cv-grid__offset" aria-label={header.label}>
      {header.text}
    </div>
  );
}

/** Explicit headers win; otherwise the offset gutter is translated into headers (memoised). */
function useRowHeaders(rowOffsets: readonly number[] | undefined, rowHeaders: readonly GridRowHeader[] | undefined): readonly GridRowHeader[] | undefined {
  const t = useT();
  return useMemo(() => {
    if (rowHeaders !== undefined) return rowHeaders;
    return rowOffsets?.map((offset) => {
      const text = formatOffset(offset);
      return { text, label: t('ui.grid.offset', { offset: text }) };
    });
  }, [rowOffsets, rowHeaders, t]);
}

function GridRow({ row, lineStart, cols, header, cellAt, elem, isActive, onFocusCell, onSelectCell }: RowProps) {
  return (
    <div role="row" className="cv-grid__row" data-current={header?.current ? '' : undefined} data-line-start={lineStart ? '' : undefined}>
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
            shown={cell.shown}
            elem={elem}
            highlight={cell.highlight}
            tabbable={isActive(row, col)}
            onFocusCell={onFocusCell}
            dimmed={cell.dimmed}
            focused={cell.focused}
            selected={cell.selected}
            onSelect={onSelectCell}
            blank={cell.blank}
          />
        );
      })}
    </div>
  );
}

function gridClassName(wrap: boolean, capped: boolean): string {
  return ['cv-grid', wrap && 'cv-grid--wrap', capped && 'cv-grid--capped'].filter(Boolean).join(' ');
}

/** CSS custom properties of the layout: wrap columns and the height cap (none: no inline style). */
function gridStyle(wrapColumns: number | undefined, maxBlockSize: string | undefined): CSSProperties | undefined {
  if (wrapColumns === undefined && maxBlockSize === undefined) return undefined;
  return {
    ...(wrapColumns === undefined ? {} : { '--cv-wrap-columns': wrapColumns }),
    ...(maxBlockSize === undefined ? {} : { '--cv-grid-max-block': maxBlockSize }),
  } as CSSProperties;
}

/**
 * Generic labelled byte grid (`role="grid"`) with highlight classes, glyph fallbacks, roving focus,
 * optional choreography (`motion`), beat focus dimming and cell selection.
 */
export function ByteGrid(props: ByteGridProps) {
  const { values, shape, order = 'row-major', elem = 'u8', highlights = NO_HIGHLIGHTS, label, rowOffsets, rowHeaders, columnHeaders, layout = 'stack' } = props;
  const { motion, focus, selectedIndex, onSelectCell, wrapColumns = 1, unwritten, maxBlockSize } = props;
  const wrap = layout === 'wrap';
  const [rows, cols] = shape;
  const headers = useRowHeaders(rowOffsets, rowHeaders);
  const byIndex = useMemo(() => highlightMap(highlights), [highlights]);
  const { gridRef, onKeyDown, isActive, setActive } = useGridNavigation(shape);
  const showsAfter = useGridMotion(gridRef, motion, values);
  useScrollEdges(gridRef, cols);
  useRevealCurrentRow(gridRef, headers?.findIndex((header) => header.current) ?? -1);
  const onFocusCell = useCallback((row: number, col: number) => setActive({ row, col }), [setActive]);
  const cellAt = (row: number, col: number): CellModel => {
    const index = cellIndex(row, col, shape, order);
    const value = values[index] ?? 0;
    const after = showsAfter(index);
    return {
      index,
      value,
      shown: after ? value : (motion?.before[index] ?? value),
      blank: after ? (unwritten?.has(index) ?? false) : (motion?.unwrittenBefore?.has(index) ?? unwritten?.has(index) ?? false),
      highlight: byIndex.get(index),
      ...beatFocus(focus, index),
      selected: onSelectCell === undefined ? undefined : index === selectedIndex,
    };
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      className={gridClassName(wrap, maxBlockSize !== undefined)}
      style={gridStyle(wrap ? wrapColumns : undefined, maxBlockSize)}
      aria-label={label}
      data-order={order}
      onKeyDown={onKeyDown}
    >
      {columnHeaders !== undefined && <ColumnHeaderRow headers={columnHeaders} corner={headers !== undefined} />}
      {Array.from({ length: rows }, (_, row) => (
        <GridRow
          key={row}
          row={row}
          lineStart={wrap && row % wrapColumns === 0}
          cols={cols}
          header={headers?.[row]}
          cellAt={cellAt}
          elem={elem}
          isActive={isActive}
          onFocusCell={onFocusCell}
          onSelectCell={onSelectCell}
        />
      ))}
    </div>
  );
}
