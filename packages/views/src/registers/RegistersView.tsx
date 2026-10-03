import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { registersAt, type RegistersFacet } from '@cryventure/core';
import {
  ByteGrid,
  ViewStatus,
  useLab,
  useT,
  type GridHighlight,
  type GridRowHeader,
  type ViewProps,
} from '@cryventure/viz';
import {
  BYTE_ORDER_VIEWS,
  displayOrder,
  inFlightAt,
  laneValues,
  registerFileBytes,
  sharedLanes,
  writtenAt,
  type ByteOrderView,
} from './registerModel.ts';
import { VariantPicker, useVariantChoice } from '../_lib/VariantPicker.tsx';
import './registers.css';

/**
 * The registers a listing uses (`registers` facet), each as a row of byte cells at the playhead
 * (core `registersAt`: a write is visible once `p ≥ align.last`, so an instruction in flight still
 * shows the value from before it). A lane switch groups the bytes (and lists the lane values for
 * lanes wider than a byte); a byte-order toggle flips between memory order and register notation
 * (MSB first). Registers written at this step are flagged (▸ and write glyphs), registers an
 * instruction in flight is about to write get ⧗, unwritten registers show `··`.
 */
const STATUS_KEYS = {
  loading: 'view.registers.loading',
  missing: 'view.registers.missing',
} as const;

const IN_FLIGHT_GLYPH = '⧗';
/** Placeholder of a register never written (the grid's convention for unwritten cells). */
const UNWRITTEN_TEXT = '··';

interface RadioOption<V extends string | number> {
  value: V;
  label: string;
}

interface RadioGroupProps<V extends string | number> {
  legend: string;
  options: readonly RadioOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

/** A labelled radio group (one tab stop, arrow keys switch); used for the lane and byte-order switches. */
function RadioGroup<V extends string | number>({
  legend,
  options,
  value,
  onChange,
}: RadioGroupProps<V>) {
  const name = useId();
  return (
    <fieldset className="cv-registers__switch">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

interface RegisterRows {
  values: number[];
  unwritten: Set<number>;
  highlights: GridHighlight[];
  headers: GridRowHeader[];
}

type RegisterStatus = 'written' | 'inFlight' | 'unchanged' | 'unwritten';

function registerStatus(
  name: string,
  contents: number[] | undefined,
  written: Set<string>,
  inFlight: Set<string>,
): RegisterStatus {
  if (written.has(name)) return 'written';
  if (inFlight.has(name)) return 'inFlight';
  return contents === undefined ? 'unwritten' : 'unchanged';
}

/** Flat grid values (rows = registers, cells in display order) with unwritten cells, write highlights and row headers. */
function useRegisterRows(facet: RegistersFacet, view: ByteOrderView): RegisterRows {
  const t = useT();
  const step = useLab((state) => state.step);
  return useMemo(() => {
    const cols = registerFileBytes(facet.file);
    const order = displayOrder(cols, facet.file.byteOrder, view);
    const contents = registersAt(facet, step);
    const [written, inFlight] = [writtenAt(facet, step), inFlightAt(facet, step)];
    const rows: RegisterRows = { values: [], unwritten: new Set(), highlights: [], headers: [] };
    facet.file.registers.forEach((spec, row) => {
      const bytes = contents.get(spec.name);
      const status = registerStatus(spec.name, bytes, written, inFlight);
      order.forEach((byteIndex, col) => {
        const value = bytes?.[byteIndex];
        rows.values.push(value ?? 0);
        if (value === undefined) rows.unwritten.add(row * cols + col);
      });
      if (status === 'written')
        rows.highlights.push({ kind: 'write', indices: order.map((_, col) => row * cols + col) });
      const text = status === 'inFlight' ? `${spec.name} ${IN_FLIGHT_GLYPH}` : spec.name;
      rows.headers.push({
        text,
        label: t(`view.registers.row.${status}`, { name: spec.name }),
        current: status === 'written',
      });
    });
    return rows;
  }, [facet, view, step, t]);
}

function useColumnHeaders(facet: RegistersFacet, view: ByteOrderView): GridRowHeader[] {
  const t = useT();
  return useMemo(
    () =>
      displayOrder(registerFileBytes(facet.file), facet.file.byteOrder, view).map((index) => ({
        text: String(index),
        label: t('view.registers.byteColumn', { index }),
      })),
    [facet, view, t],
  );
}

interface LaneTableProps {
  facet: RegistersFacet;
  laneBits: number;
  view: ByteOrderView;
}

/** The lane values (numbers, MSB first within each lane) of every register, in display order. */
function LaneTable({ facet, laneBits, view }: LaneTableProps) {
  const t = useT();
  const step = useLab((state) => state.step);
  const contents = registersAt(facet, step);
  const cols = registerFileBytes(facet.file);
  const header = laneValues(new Array<number>(cols).fill(0), laneBits, facet.file.byteOrder, view);
  return (
    <div className="cv-registers__lanes-scroll">
      <table className="cv-registers__lanes">
        <caption>{t('view.registers.lanesCaption', { bits: laneBits })}</caption>
        <thead>
          <tr>
            <td />
            {header.map((lane) => (
              <th key={lane.index} scope="col">
                {t('view.registers.lane', { index: lane.index })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {facet.file.registers.map((spec) => {
            const bytes = contents.get(spec.name);
            const lanes =
              bytes === undefined
                ? undefined
                : laneValues(bytes, laneBits, facet.file.byteOrder, view);
            return (
              <tr key={spec.name}>
                <th scope="row">{spec.name}</th>
                {header.map((lane, position) => (
                  <td key={lane.index}>{lanes?.[position]?.hex ?? UNWRITTEN_TEXT}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface RegistersProps {
  facet: RegistersFacet;
  picker: ReactNode;
}

function Registers({ facet, picker }: RegistersProps) {
  const t = useT();
  const lanes = useMemo(() => sharedLanes(facet.file), [facet]);
  const [laneChoice, setLaneBits] = useState(lanes[0] ?? 8);
  const laneBits = lanes.includes(laneChoice) ? laneChoice : (lanes[0] ?? 8);
  const [view, setView] = useState<ByteOrderView>('memory');
  const rows = useRegisterRows(facet, view);
  const columnHeaders = useColumnHeaders(facet, view);
  const cols = registerFileBytes(facet.file);
  return (
    <section
      className="cv-view cv-registers"
      aria-label={t('view.registers.title')}
      data-lane-bytes={laneBits / 8}
      data-order={view}
      style={{ '--cv-registers-cols': cols } as CSSProperties}
    >
      <div className="cv-registers__controls">
        {picker}
        <RadioGroup
          legend={t('view.registers.laneLegend')}
          options={lanes.map((bits) => ({
            value: bits,
            label: t('view.registers.laneOption', { bits }),
          }))}
          value={laneBits}
          onChange={setLaneBits}
        />
        <RadioGroup
          legend={t('view.registers.orderLegend')}
          options={BYTE_ORDER_VIEWS.map((value) => ({
            value,
            label: t(`view.registers.order.${value}`),
          }))}
          value={view}
          onChange={setView}
        />
      </div>
      <ByteGrid
        values={rows.values}
        shape={[facet.file.registers.length, cols]}
        label={t('view.registers.grid', { order: t(`view.registers.order.${view}`) })}
        rowHeaders={rows.headers}
        columnHeaders={columnHeaders}
        highlights={rows.highlights}
        unwritten={rows.unwritten}
      />
      {laneBits > 8 && <LaneTable facet={facet} laneBits={laneBits} view={view} />}
      <p className="cv-registers__legend">
        <span data-written="">{t('view.registers.legendWritten')}</span>
        <span>{t('view.registers.legendInFlight', { glyph: IN_FLIGHT_GLYPH })}</span>
        <span>{t('view.registers.legendUnwritten', { placeholder: UNWRITTEN_TEXT })}</span>
      </p>
    </section>
  );
}

/** Register contents of the chosen ISA variant at the playhead. */
export default function RegistersView(_props: ViewProps) {
  const t = useT();
  const { facet, options, chosen, choose } = useVariantChoice<RegistersFacet>('registers');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  const chosenLabel = options.find((option) => option.variant === chosen)?.label;
  // Compact: the instructions view of the same lab shows this picker in full, so here the label is
  // visually hidden (still the select's name) and a long variant name ellipsises, whole in the title.
  const picker = options.length > 1 && (
    <span className="cv-registers__variant-wrap" title={chosenLabel === undefined ? undefined : t(chosenLabel)}>
      <VariantPicker
        className="cv-registers__variant"
        label={t('view.registers.variant')}
        options={options}
        chosen={chosen}
        onChoose={choose}
      />
    </span>
  );
  return <Registers facet={facet.data} picker={picker} />;
}
