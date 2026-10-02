import { useMemo } from 'react';
import type { ElemType, HighlightKind } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { ByteCell } from './ByteCell.tsx';
import { formatOffset } from './hex.ts';
import { cellIndex, highlightMap, type GridHighlight, type GridOrder, type GridShape } from './gridLayout.ts';
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
}

export type GridLayoutMode = 'stack' | 'wrap';

/** A row header: visible `text`, accessible `label`, and whether the row is in focus of the current step. */
export interface GridRowHeader {
  text: string;
  label: string;
  current?: boolean;
}

const NO_HIGHLIGHTS: readonly GridHighlight[] = [];

interface RowProps {
  row: number;
  cols: number;
  header: GridRowHeader | undefined;
  cellAt: (row: number, col: number) => { index: number; value: number; highlight: HighlightKind | undefined };
  elem: ElemType;
  isActive: (row: number, col: number) => boolean;
  activate: (row: number, col: number) => void;
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

function GridRow({ row, cols, header, cellAt, elem, isActive, activate }: RowProps) {
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
          />
        );
      })}
    </div>
  );
}

/** Generic labelled byte grid (`role="grid"`) with highlight classes, glyph fallbacks and roving focus. */
export function ByteGrid({ values, shape, order = 'row-major', elem = 'u8', highlights = NO_HIGHLIGHTS, label, rowOffsets, rowHeaders, layout = 'stack' }: ByteGridProps) {
  const [rows, cols] = shape;
  const headers = useRowHeaders(rowOffsets, rowHeaders);
  const byIndex = useMemo(() => highlightMap(highlights), [highlights]);
  const { gridRef, onKeyDown, isActive, setActive } = useGridNavigation(shape);
  const cellAt = (row: number, col: number) => {
    const index = cellIndex(row, col, shape, order);
    return { index, value: values[index] ?? 0, highlight: byIndex.get(index) };
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
        />
      ))}
    </div>
  );
}
