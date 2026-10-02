import {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { TableFacet, TableMark, TableMarkRole } from '@cryventure/core';
import {
  ViewStatus,
  useFacet,
  useGridNavigation,
  useLabActions,
  useT,
  type GridShape,
  type ViewProps,
} from '@cryventure/viz';
import { cellHex, indexToHex, marksByIndex, tableHeaders } from './lookupTableModel.ts';
import './lookupTable.css';

/**
 * Lookup table (any `table` facet, e.g. the AES S-box): a rows×cols ARIA grid with nibble headers
 * (`5x` / `x3`), the selected input strongly marked with its row and column (crosshair), and marked
 * cells styled per role with a glyph. With `selectParam`, click / Enter / Space asks the host to re-run
 * with that input (`requestParams`) and shows the choice at once. A caption names the hovered or
 * focused cell (`53 → ed`), else the selected one; right after a click it names the clicked cell until
 * the pointer really moves (a re-run may shift the layout under a resting pointer). Cells scale with the
 * panel (`lookupTable.css`), scrolling sideways only on very narrow phones.
 */
const STATUS_KEYS = {
  loading: 'view.lookup-table.loading',
  missing: 'view.lookup-table.missing',
} as const;

/** Non-colour cue per mark role (decorative; the role is also in the cell's label). */
const MARK_GLYPHS: Readonly<Record<TableMarkRole, string>> = {
  input: '▸',
  output: '◂',
  'fixed-point': '=',
  'opposite-fixed-point': '≠',
};

const NO_MARKS: readonly TableMark[] = [];

interface CellProps {
  index: number;
  row: number;
  col: number;
  input: string;
  output: string;
  marks: readonly TableMark[];
  selected: boolean;
  tabbable: boolean;
  selectable: boolean;
  onFocusCell: (row: number, col: number, index: number) => void;
  onHover: (index: number | null) => void;
  onChoose: (index: number, pointer?: PointerPosition) => void;
}

interface PointerPosition {
  x: number;
  y: number;
}

function useCellLabel({
  input,
  output,
  marks,
}: Pick<CellProps, 'input' | 'output' | 'marks'>): string {
  const t = useT();
  const cell = t('view.lookup-table.cell', { input, output });
  if (marks.length === 0) return cell;
  const names = marks
    .map((mark) =>
      mark.label === undefined ? t(`view.lookup-table.mark.${mark.role}`) : t(mark.label),
    )
    .join(', ');
  return t('view.lookup-table.cellMarked', { cell, marks: names });
}

const Cell = memo(function Cell(props: CellProps) {
  const {
    index,
    row,
    col,
    output,
    marks,
    selected,
    tabbable,
    selectable,
    onFocusCell,
    onHover,
    onChoose,
  } = props;
  const label = useCellLabel(props);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onChoose(index);
  };
  return (
    <div
      role="gridcell"
      className="cv-lookup-table__cell"
      aria-label={label}
      aria-selected={selected}
      aria-readonly={selectable ? undefined : true}
      tabIndex={tabbable ? 0 : -1}
      data-row={row}
      data-col={col}
      data-index={index}
      data-marks={marks.length === 0 ? undefined : marks.map((mark) => mark.role).join(' ')}
      onFocus={() => onFocusCell(row, col, index)}
      onBlur={() => onHover(null)}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={
        selectable
          ? (event: MouseEvent) => onChoose(index, { x: event.clientX, y: event.clientY })
          : undefined
      }
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true">{output}</span>
      {marks.length > 0 && (
        <span className="cv-lookup-table__glyph" aria-hidden="true">
          {marks.map((mark) => MARK_GLYPHS[mark.role]).join('')}
        </span>
      )}
    </div>
  );
});

/**
 * The shown selection: a click shows its input at once (optimistic) until the host's re-run delivers
 * a new facet, which then decides (`facet.selected`).
 */
function usePendingSelection(facet: TableFacet) {
  const { requestParams } = useLabActions();
  const [pending, setPending] = useState<{ facet: TableFacet; index: number } | null>(null);
  const param = facet.selectParam;
  const size = facet.entries.length;
  const choose = useCallback(
    (index: number) => {
      if (param === undefined) return;
      setPending({ facet, index });
      requestParams({ [param]: indexToHex(index, size) });
    },
    [facet, param, size, requestParams],
  );
  const selected = pending !== null && pending.facet === facet ? pending.index : facet.selected;
  return { selected, choose };
}

/** Pointer travel (px) that counts as a real move rather than a layout shift under a resting pointer. */
const POINTER_SLOP = 2;

/**
 * The cell the caption names: the hovered or focused cell (last one wins), else the selection. A click
 * pins the clicked cell until the pointer really moves, so a re-run that shifts the layout under the
 * resting pointer cannot swap in a neighbour.
 */
function useCaptionCell(selected: number | undefined) {
  const [pointed, setPointed] = useState<number | null>(null);
  const pinnedAt = useRef<PointerPosition | null>(null);
  const onHover = useCallback((index: number | null) => {
    if (pinnedAt.current === null) setPointed(index);
  }, []);
  const onFocus = useCallback((index: number) => setPointed(index), []);
  const pin = useCallback((index: number, pointer: PointerPosition) => {
    pinnedAt.current = pointer;
    setPointed(index);
  }, []);
  const onPointerMove = useCallback((event: MouseEvent<HTMLElement>) => {
    const pin = pinnedAt.current;
    if (pin === null) return;
    if (Math.abs(event.clientX - pin.x) + Math.abs(event.clientY - pin.y) <= POINTER_SLOP) return;
    pinnedAt.current = null;
    const cell = (event.target as Element).closest('[data-index]');
    setPointed(cell === null ? null : Number(cell.getAttribute('data-index')));
  }, []);
  return { captionIndex: pointed ?? selected, onHover, onFocus, pin, onPointerMove };
}

/** Roving tabindex entry: the last focused cell, else the selection, else the first cell. */
function useRovingEntry(
  shape: GridShape,
  selected: number | undefined,
  onFocus: (index: number) => void,
) {
  const { gridRef, onKeyDown, isActive, setActive } = useGridNavigation(shape);
  const [touched, setTouched] = useState(false);
  const onFocusCell = useCallback(
    (row: number, col: number, index: number) => {
      setTouched(true);
      setActive({ row, col });
      onFocus(index);
    },
    [setActive, onFocus],
  );
  const cols = shape[1];
  const entry = selected ?? 0;
  const isTabbable = (row: number, col: number) =>
    touched ? isActive(row, col) : row * cols + col === entry;
  return { gridRef, onKeyDown, isTabbable, onFocusCell };
}

function Caption({
  facet,
  index,
  id,
}: {
  facet: TableFacet;
  index: number | undefined;
  id: string;
}) {
  const t = useT();
  const text =
    index === undefined
      ? t('view.lookup-table.hint')
      : t('view.lookup-table.caption', cellHex(facet, index));
  return (
    <p
      id={id}
      className="cv-lookup-table__caption"
      data-empty={index === undefined ? '' : undefined}
    >
      {text}
    </p>
  );
}

function HeaderRow({
  cols,
  activeCol,
}: {
  cols: readonly string[];
  activeCol: number | undefined;
}) {
  const t = useT();
  return (
    <div role="row" className="cv-lookup-table__row">
      <div
        role="columnheader"
        className="cv-lookup-table__corner"
        aria-label={t('view.lookup-table.corner')}
      />
      {cols.map((text, col) => (
        <div
          key={text}
          role="columnheader"
          className="cv-lookup-table__colheader"
          aria-label={t('view.lookup-table.column', { label: text })}
          data-active={col === activeCol ? '' : undefined}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

function LookupTable({ facet }: { facet: TableFacet }) {
  const t = useT();
  const captionId = useId();
  const { rows, cols } = facet;
  const shape = useMemo<GridShape>(() => [rows, cols], [rows, cols]);
  const headers = useMemo(() => tableHeaders(rows, cols), [rows, cols]);
  const marks = useMemo(() => marksByIndex(facet.marks), [facet.marks]);
  const { selected, choose } = usePendingSelection(facet);
  const caption = useCaptionCell(selected);
  const { gridRef, onKeyDown, isTabbable, onFocusCell } = useRovingEntry(
    shape,
    selected,
    caption.onFocus,
  );
  const { pin } = caption;
  const onChoose = useCallback(
    (index: number, pointer?: PointerPosition) => {
      if (pointer !== undefined) pin(index, pointer);
      choose(index);
    },
    [pin, choose],
  );
  const selectable = facet.selectParam !== undefined;
  const activeRow = selected === undefined ? undefined : Math.floor(selected / cols);
  const activeCol = selected === undefined ? undefined : selected % cols;
  const title = t(facet.title);
  return (
    <section className="cv-view cv-lookup-table" aria-label={title}>
      <h3 className="cv-lookup-table__title">{title}</h3>
      <div className="cv-lookup-table__scroll">
        <div
          ref={gridRef}
          role="grid"
          className="cv-lookup-table__grid"
          aria-label={title}
          aria-describedby={captionId}
          aria-readonly={selectable ? undefined : true}
          style={{ '--cv-lookup-cols': cols } as CSSProperties}
          onKeyDown={onKeyDown}
          onMouseMove={caption.onPointerMove}
          data-selectable={selectable ? '' : undefined}
        >
          <HeaderRow cols={headers.cols} activeCol={activeCol} />
          {headers.rows.map((rowText, row) => (
            <div key={rowText} role="row" className="cv-lookup-table__row">
              <div
                role="rowheader"
                className="cv-lookup-table__rowheader"
                aria-label={t('view.lookup-table.row', { label: rowText })}
                data-active={row === activeRow ? '' : undefined}
              >
                {rowText}
              </div>
              {Array.from({ length: cols }, (_, col) => {
                const index = row * cols + col;
                const { input, output } = cellHex(facet, index);
                return (
                  <Cell
                    key={col}
                    index={index}
                    row={row}
                    col={col}
                    input={input}
                    output={output}
                    marks={marks.get(index) ?? NO_MARKS}
                    selected={index === selected}
                    tabbable={isTabbable(row, col)}
                    selectable={selectable}
                    onFocusCell={onFocusCell}
                    onHover={caption.onHover}
                    onChoose={onChoose}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <Caption facet={facet} index={caption.captionIndex} id={captionId} />
    </section>
  );
}

/** The `table` facet as a clickable lookup grid. */
export default function LookupTableView(_props: ViewProps) {
  const facet = useFacet<TableFacet>('table');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <LookupTable facet={facet.data} />;
}
