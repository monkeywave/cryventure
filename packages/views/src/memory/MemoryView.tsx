import { Fragment, memo, useCallback, useId, useMemo, useState } from 'react';
import {
  type Allocation,
  type Lens,
  type MemoryFacet,
  type TargetSpec,
} from '@cryventure/core';
import { ViewStatus, useLab, useLabActions, useT, useVariantChoice, useVariantFacets, type ViewProps } from '@cryventure/viz';
import {
  BYTES_PER_ROW,
  UNWRITTEN_TEXT,
  addressAt,
  byteRoles,
  choiceOf,
  hasHostEndianWords,
  hasPadding,
  implOptions,
  intFieldValue,
  linkedByAllocation,
  memoryRows,
  memoryTimeline,
  resolveChoice,
  rulerLabels,
  segmentsOf,
  targetOptions,
  unitText,
  unitTouches,
  writtenCount,
  type ByteRole,
  type MemoryUnit,
  type MemoryVariant,
  type Segment,
  type VariantChoice,
} from './memoryModel.ts';
import { useUnitNavigation } from './useUnitNavigation.ts';
import './memory.css';

/**
 * Memory (`memory` facet, docs/M4.md §6): the modeled stack frame of one target + implementation.
 * Pickers for the triple and the impl come from the variants' facet metadata (only existing
 * combinations). Each allocation shows `sizeof`/`alignof`, an address ruler and hex rows of 16
 * bytes with an address gutter, the struct-layout overlay (field and `rd_key[i]` word boundaries,
 * padding hatched), `··` for bytes never written and ✎ on bytes written at the playhead. "u32
 * words" reads host-endian u32 fields as numbers (the endianness flip). Ranges linked to
 * `selection.valueRefId` (e.g. a round key) are highlighted; hovering or focusing one publishes it.
 * Lenses: story = labelled blocks without hex; engineer = full; cryptographer = + round-key labels.
 */
const STATUS_KEYS = { loading: 'view.memory.loading', missing: 'view.memory.missing' } as const;

const WRITTEN_GLYPH = '✎';
const NO_OFFSETS: ReadonlySet<number> = new Set();
const NO_BYTES: readonly (number | undefined)[] = [];
/** Address spaces with a translated name; any other space goes through `view.memory.space.other`. */
const KNOWN_SPACES = new Set(['stack', 'heap', 'data', 'rodata']);

type Translate = ReturnType<typeof useT>;

/* ---------- Header: pickers, badge, words toggle ---------- */

interface PickersProps {
  variants: readonly MemoryVariant[];
  facet: MemoryFacet;
  onChoose: (choice: VariantChoice) => void;
}

function VariantPickers({ variants, facet, onChoose }: PickersProps) {
  const t = useT();
  const id = useId();
  const { triple, implId } = choiceOf(facet);
  return (
    <div className="cv-memory__pickers" role="group" aria-label={t('view.memory.pickers')}>
      <label className="cv-memory__picker" htmlFor={`${id}-triple`}>
        <span>{t('view.memory.triple')}</span>
        <select
          id={`${id}-triple`}
          value={triple}
          onChange={(event) => onChoose({ triple: event.target.value, implId })}
        >
          {targetOptions(variants).map((target) => (
            <option key={target.triple} value={target.triple}>
              {t('view.memory.tripleOption', {
                triple: target.triple,
                dataModel: target.dataModel,
                endian: t(`view.memory.endian.${target.endian}`),
              })}
            </option>
          ))}
        </select>
      </label>
      <label className="cv-memory__picker" htmlFor={`${id}-impl`}>
        <span>{t('view.memory.impl')}</span>
        <select
          id={`${id}-impl`}
          value={implId}
          onChange={(event) => onChoose({ triple, implId: event.target.value })}
        >
          {implOptions(variants, triple).map((option) => (
            <option key={option.id} value={option.id}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ProvenanceBadge({ provenance }: { provenance: MemoryFacet['provenance'] }) {
  const t = useT();
  const noteId = useId();
  return (
    <span
      className="cv-memory__badge"
      data-provenance={provenance}
      aria-describedby={noteId}
      title={t(`view.memory.provenanceNote.${provenance}`)}
    >
      {t(`view.memory.provenance.${provenance}`)}
      <span id={noteId} className="cv-visually-hidden">
        {t(`view.memory.provenanceNote.${provenance}`)}
      </span>
    </span>
  );
}

function WordsToggle({
  on,
  onToggle,
  facet,
}: {
  on: boolean;
  onToggle: () => void;
  facet: MemoryFacet;
}) {
  const t = useT();
  const numeric = hasHostEndianWords(facet.allocations);
  return (
    <div className="cv-memory__words">
      <button
        type="button"
        className="cv-memory__toggle"
        aria-pressed={on}
        onClick={onToggle}
        title={t('view.memory.wordsHint')}
      >
        {t('view.memory.words')}
      </button>
      {on && (
        <span className="cv-memory__note">
          {numeric
            ? t(
                facet.target.endian === 'little'
                  ? 'view.memory.endianNote'
                  : 'view.memory.endianNoteBig',
                { endian: t(`view.memory.endian.${facet.target.endian}`) },
              )
            : t('view.memory.wordsNone')}
        </span>
      )}
    </div>
  );
}

/* ---------- Allocation header and legend ---------- */

function Counters({ allocation }: { allocation: Allocation }) {
  const t = useT();
  const { layout } = allocation;
  const sizeof =
    layout === undefined
      ? t('view.memory.sizeof', { size: allocation.size })
      : t('view.memory.sizeofType', { type: layout.name, size: layout.size });
  return (
    <span className="cv-memory__counters">
      <span data-counter="sizeof">{sizeof}</span>
      <span data-counter="alignof">
        {t('view.memory.alignof', { align: layout?.align ?? allocation.align })}
      </span>
    </span>
  );
}

function FieldLegend({
  allocation,
  contents,
  endian,
  padding,
}: {
  allocation: Allocation;
  contents: readonly (number | undefined)[];
  endian: TargetSpec['endian'];
  padding: boolean;
}) {
  const t = useT();
  const fields = allocation.layout?.fields ?? [];
  if (fields.length === 0) return null;
  return (
    <ul className="cv-memory__legend" aria-label={t('view.memory.structLayout')}>
      {fields.map((field) => {
        const value = field.encoding === 'int' ? intFieldValue(contents, field, endian) : undefined;
        return (
          <li key={field.name} data-field={field.name}>
            {t('view.memory.field', {
              name: field.name,
              type: field.type,
              offset: field.offset,
              size: field.size,
            })}
            {field.encoding !== undefined && (
              <span className="cv-memory__encoding">
                {t(`view.memory.encoding.${field.encoding}`)}
              </span>
            )}
            {value !== undefined && (
              <strong className="cv-memory__value">
                {t('view.memory.intValue', { name: field.name, value })}
              </strong>
            )}
          </li>
        );
      })}
      {padding && <li data-padding="">{t('view.memory.legendPadding')}</li>}
    </ul>
  );
}

/* ---------- Hex grid ---------- */

function fieldName(t: Translate, role: ByteRole): string | undefined {
  if (role.field === undefined) return undefined;
  return role.elem === undefined
    ? role.field.name
    : t('view.memory.fieldElem', { name: role.field.name, index: role.elem });
}

interface UnitFlags {
  written: boolean;
  linked: boolean;
}

function useUnitLabel(unit: MemoryUnit, address: string, { written, linked }: UnitFlags): string {
  const t = useT();
  let label = t('view.memory.cell', {
    address,
    value: unit.value === undefined ? t('view.memory.unwritten') : unitText(unit),
  });
  const field = fieldName(t, unit.role);
  if (field !== undefined) label = t('view.memory.cellField', { cell: label, field });
  if (unit.role.padding) label = t('view.memory.cellPadding', { cell: label });
  if (unit.role.ref !== undefined)
    label = t('view.memory.cellRef', { cell: label, round: unit.role.ref });
  if (written) label = t('view.memory.cellWritten', { cell: label });
  if (linked) label = t('view.memory.cellLinked', { cell: label });
  return label;
}

interface UnitCellProps extends UnitFlags {
  unit: MemoryUnit;
  address: string;
  row: number;
  col: number;
  tabbable: boolean;
  onFocusUnit: (row: number, col: number) => void;
  onPreviewRef: (ref: number | undefined) => void;
}

const UnitCell = memo(function UnitCell(props: UnitCellProps) {
  const { unit, address, row, col, tabbable, written, linked, onFocusUnit, onPreviewRef } = props;
  const label = useUnitLabel(unit, address, props);
  const { role } = unit;
  const preview = () => onPreviewRef(role.ref);
  return (
    <div
      role="gridcell"
      className="cv-memory__unit"
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      data-row={row}
      data-col={col}
      data-offset={unit.offset}
      data-kind={unit.kind}
      data-field={role.field?.name}
      data-field-start={role.fieldStart ? '' : undefined}
      data-elem-start={role.elemStart && !role.fieldStart ? '' : undefined}
      data-padding={role.padding ? '' : undefined}
      data-ref={role.ref}
      data-unwritten={unit.value === undefined ? '' : undefined}
      data-written={written ? '' : undefined}
      data-linked={linked ? '' : undefined}
      onFocus={() => {
        onFocusUnit(row, col);
        preview();
      }}
      onMouseEnter={preview}
    >
      <span aria-hidden="true">{unit.value === undefined ? UNWRITTEN_TEXT : unitText(unit)}</span>
      {written && (
        <span className="cv-memory__glyph" aria-hidden="true">
          {WRITTEN_GLYPH}
        </span>
      )}
    </div>
  );
});

function RulerRow() {
  const t = useT();
  return (
    <div role="row" className="cv-memory__row cv-memory__ruler">
      <div
        role="columnheader"
        className="cv-memory__gutter"
        aria-label={t('view.memory.addressColumn')}
      />
      {rulerLabels().map((text) => (
        <div
          key={text}
          role="columnheader"
          className="cv-memory__colhead"
          aria-label={t('view.memory.column', { offset: text })}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

function RowHeader({ address, refIndex }: { address: string; refIndex: number | undefined }) {
  const t = useT();
  const label =
    refIndex === undefined
      ? t('view.memory.address', { address })
      : t('view.memory.addressRef', { address, round: refIndex });
  return (
    <div role="rowheader" className="cv-memory__gutter" aria-label={label}>
      <span aria-hidden="true">{address}</span>
      {refIndex !== undefined && (
        <span className="cv-memory__reftag" aria-hidden="true">
          {t('view.memory.refTag', { round: refIndex })}
        </span>
      )}
    </div>
  );
}

const HALF_ROW = BYTES_PER_ROW / 2;

/**
 * The second half of a 16-byte row starts a visual line of its own on narrow panels (memory.css);
 * this address label heads that line and stays hidden otherwise. The row header keeps the address
 * for assistive technology, so it is decorative.
 */
function HalfRowGutter({ address }: { address: string }) {
  return (
    <div className="cv-memory__gutter cv-memory__gutter--half" aria-hidden="true">
      {address}
    </div>
  );
}

/** The ref starting in a row (round-key labels of the cryptographer lens). */
function refStartingIn(
  allocation: Allocation,
  rowStart: number,
  rowEnd: number,
): number | undefined {
  const index = (allocation.refs ?? []).findIndex(
    (ref) => ref.offset >= rowStart && ref.offset < rowEnd,
  );
  return index === -1 ? undefined : index;
}

interface GridProps {
  allocation: Allocation;
  rows: readonly MemoryUnit[][];
  written: ReadonlySet<number>;
  linked: ReadonlySet<number>;
  refLabels: boolean;
  onPreviewRef: (ref: number | undefined) => void;
}

function HexGrid({ allocation, rows, written, linked, refLabels, onPreviewRef }: GridProps) {
  const t = useT();
  const rowLengths = useMemo(() => rows.map((row) => row.length), [rows]);
  const { gridRef, onKeyDown, isActive, setActive } = useUnitNavigation(rowLengths);
  const onFocusUnit = useCallback(
    (row: number, col: number) => setActive({ row, col }),
    [setActive],
  );
  return (
    <div className="cv-memory__scroll cv-scroll-shadow">
      <div
        ref={gridRef}
        role="grid"
        className="cv-memory__grid"
        aria-label={t('view.memory.grid', {
          label: t(allocation.label),
          address: allocation.addr,
          size: allocation.size,
        })}
        onKeyDown={onKeyDown}
      >
        <RulerRow />
        {rows.map((row, rowIndex) => {
          const start = row[0]?.offset ?? 0;
          const refIndex = refLabels ? refStartingIn(allocation, start, start + 16) : undefined;
          return (
            <div key={start} role="row" className="cv-memory__row">
              <RowHeader address={addressAt(allocation.addr, start)} refIndex={refIndex} />
              {row.map((unit, col) => (
                <Fragment key={unit.offset}>
                  {unit.offset === start + HALF_ROW && (
                    <HalfRowGutter address={addressAt(allocation.addr, unit.offset)} />
                  )}
                  <UnitCell
                    unit={unit}
                    address={addressAt(allocation.addr, unit.offset)}
                    row={rowIndex}
                    col={col}
                    tabbable={isActive(rowIndex, col)}
                    written={unitTouches(unit, written)}
                    linked={unitTouches(unit, linked)}
                    onFocusUnit={onFocusUnit}
                    onPreviewRef={onPreviewRef}
                  />
                </Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- One allocation ---------- */

interface AllocationProps {
  allocation: Allocation;
  contents: readonly (number | undefined)[];
  written: ReadonlySet<number>;
  /** Offsets linked to the lab selection (`NO_OFFSETS` for allocations it does not touch). */
  linked: ReadonlySet<number>;
  endian: TargetSpec['endian'];
  words: boolean;
  lens: Lens;
  onSelectValue: (valueRef: string) => void;
}

const AllocationPanel = memo(function AllocationPanel({
  allocation,
  contents,
  written,
  linked,
  endian,
  words,
  lens,
  onSelectValue,
}: AllocationProps) {
  const t = useT();
  const roles = useMemo(() => byteRoles(allocation), [allocation]);
  const rows = useMemo(
    () => memoryRows(contents, roles, endian, words),
    [contents, roles, endian, words],
  );
  const onPreviewRef = useCallback(
    (ref: number | undefined) => {
      const valueRef = ref === undefined ? undefined : allocation.refs?.[ref]?.valueRef;
      if (valueRef !== undefined) onSelectValue(valueRef);
    },
    [allocation, onSelectValue],
  );
  return (
    <figure
      className="cv-memory__allocation"
      data-allocation={allocation.id}
      data-linked={linked.size > 0 ? '' : undefined}
    >
      <figcaption className="cv-memory__caption">
        <span className="cv-memory__label">{t(allocation.label)}</span>
        <span className="cv-memory__addr">
          {t('view.memory.at', {
            address: allocation.addr,
            space: KNOWN_SPACES.has(allocation.space)
              ? t(`view.memory.space.${allocation.space}`)
              : t('view.memory.space.other', { space: allocation.space }),
          })}
        </span>
        <Counters allocation={allocation} />
      </figcaption>
      <FieldLegend
        allocation={allocation}
        contents={contents}
        endian={endian}
        padding={hasPadding(roles)}
      />
      <HexGrid
        allocation={allocation}
        rows={rows}
        written={written}
        linked={linked}
        refLabels={lens === 'cryptographer'}
        onPreviewRef={onPreviewRef}
      />
    </figure>
  );
});

function segmentText(t: Translate, segment: Segment): string {
  if (segment.field !== undefined)
    return t('view.memory.segment', { name: segment.field.name, size: segment.size });
  return t('view.memory.segmentPadding', { count: segment.size });
}

function writtenState(count: number, size: number): 'none' | 'some' | 'all' {
  if (count === 0) return 'none';
  return count === size ? 'all' : 'some';
}

/** Story lens: an allocation as a labelled block of its fields, without hex. */
const AllocationBlock = memo(function AllocationBlock({
  allocation,
  contents,
  linked,
}: Pick<AllocationProps, 'allocation' | 'contents' | 'linked'>) {
  const t = useT();
  const segments = segmentsOf(allocation);
  const plain = allocation.layout === undefined;
  return (
    <figure
      className="cv-memory__block"
      data-allocation={allocation.id}
      data-linked={linked.size > 0 ? '' : undefined}
    >
      <figcaption className="cv-memory__caption">
        <span className="cv-memory__label">{t(allocation.label)}</span>
        <Counters allocation={allocation} />
      </figcaption>
      <ol className="cv-memory__segments">
        {segments.map((segment) => {
          const count = writtenCount(contents, segment.offset, segment.size);
          return (
            <li
              key={segment.offset}
              className="cv-memory__segment"
              style={{ flexGrow: segment.size }}
              data-padding={segment.field === undefined && !plain ? '' : undefined}
              data-written={writtenState(count, segment.size)}
            >
              {plain
                ? t('view.memory.segmentBytes', { count: segment.size })
                : segmentText(t, segment)}
              <span className="cv-memory__fill">
                {t('view.memory.writtenOf', { written: count, size: segment.size })}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
});

/* ---------- The view ---------- */

interface MemoryProps {
  /** Every memory variant with data (the pickers are built from their facet metadata). */
  variants: readonly MemoryVariant[];
  /** The variant shown: the lab-wide choice. */
  facet: MemoryFacet;
  /** Records a variant as the lab-wide choice (viz `useVariantChoice`). */
  chooseVariant: (variant: string) => void;
  lens: Lens;
}

function Memory({ variants, facet, chooseVariant, lens }: MemoryProps) {
  const t = useT();
  const [words, setWords] = useState(false);
  const step = useLab((state) => state.step);
  const valueRefId = useLab((state) => state.selection.valueRefId);
  const { select } = useLabActions();
  const choose = useCallback(
    (choice: VariantChoice) => {
      const picked = resolveChoice(variants, choice);
      if (picked !== undefined) chooseVariant(picked.variant);
    },
    [variants, chooseVariant],
  );
  const timeline = useMemo(() => memoryTimeline(facet), [facet]);
  const contents = timeline.contentsAt(step);
  const written = timeline.writtenAt(step);
  const linked = useMemo(() => linkedByAllocation(facet.allocations, valueRefId), [facet, valueRefId]);
  const story = lens === 'story';
  return (
    <section className="cv-view cv-memory" aria-label={t('view.memory.title')} data-lens={lens}>
      <header className="cv-memory__header">
        <ProvenanceBadge provenance={facet.provenance} />
        <VariantPickers variants={variants} facet={facet} onChoose={choose} />
        {!story && <WordsToggle on={words} onToggle={() => setWords((on) => !on)} facet={facet} />}
      </header>
      {lens === 'cryptographer' && (
        <p className="cv-memory__note">{t('view.memory.roundKeysNote')}</p>
      )}
      <div className="cv-memory__allocations">
        {facet.allocations.map((allocation) =>
          story ? (
            <AllocationBlock
              key={allocation.id}
              allocation={allocation}
              contents={contents.get(allocation.id) ?? NO_BYTES}
              linked={linked.get(allocation.id) ?? NO_OFFSETS}
            />
          ) : (
            <AllocationPanel
              key={allocation.id}
              allocation={allocation}
              contents={contents.get(allocation.id) ?? NO_BYTES}
              written={written.get(allocation.id) ?? NO_OFFSETS}
              linked={linked.get(allocation.id) ?? NO_OFFSETS}
              endian={facet.target.endian}
              words={words}
              lens={lens}
              onSelectValue={select}
            />
          ),
        )}
      </div>
      {!story && (
        <p className="cv-memory__legend-line">
          <span data-unwritten="">
            {t('view.memory.legendUnwritten', { placeholder: UNWRITTEN_TEXT })}
          </span>
          <span data-written="">{t('view.memory.legendWritten', { glyph: WRITTEN_GLYPH })}</span>
          {valueRefId !== null && <span data-linked="">{t('view.memory.legendLinked')}</span>}
        </p>
      )}
    </section>
  );
}

/** Every memory variant that has data, in variant order (bundle first, then derived). */
function useVariantsWithData(names: readonly string[]): MemoryVariant[] {
  const entries = useVariantFacets<MemoryFacet>('memory', names);
  return useMemo(
    () => entries.flatMap(({ variant, data }) => (data === undefined ? [] : [{ variant, facet: data }])),
    [entries],
  );
}

/** The modeled memory of one AES run: allocations, struct layout and the bytes at the playhead. */
export default function MemoryView({ lens }: ViewProps) {
  const { variants: names, facet, choose } = useVariantChoice<MemoryFacet>('memory');
  const variants = useVariantsWithData(names);
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <Memory variants={variants} facet={facet.data} chooseVariant={choose} lens={lens} />;
}
