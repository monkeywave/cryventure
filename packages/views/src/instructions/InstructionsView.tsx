import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { I18nRef, Instruction, InstructionsFacet, Lens, ValuesFacet } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useLabStore, useT, type ViewProps } from '@cryventure/viz';
import {
  listingProgress,
  operandValueRefs,
  rowStatus,
  type RowStatus,
} from './instructionsModel.ts';
import { VariantPicker, useVariantChoice } from '../_lib/VariantPicker.tsx';
import './instructions.css';

/**
 * The assembly listing of one ISA variant (`instructions` facet): address, mnemonic, operands and the
 * AES operations each instruction performs (chips), aligned to the playhead (docs/M4.md §1e). The
 * current instruction gets ▶ and a heavy border, executed ones ✓, pending ones are dimmed; the
 * current row scrolls into view inside the listing's own scroller, never the page. Operands backed
 * by a ValueRef publish it as the lab selection on hover/focus (linked brushing) and show the value's
 * name in the cryptographer lens. Story lens: mnemonic and operation chips only.
 */
const STATUS_KEYS = {
  loading: 'view.instructions.loading',
  missing: 'view.instructions.missing',
} as const;

const STATUS_GLYPHS: Readonly<Record<RowStatus, string>> = {
  current: '▶',
  executed: '✓',
  pending: '',
};
const NOTE_GLYPH = '※';
const OPERAND_SEPARATOR = ', ';

/** Translated names of the ValueRefs (from the optional `values` facet; the id when it is absent). */
function useValueLabel(): (id: string) => string {
  const t = useT();
  const values = useFacet<ValuesFacet>('values');
  return useCallback(
    (id: string) => {
      const value =
        values.status === 'ready'
          ? values.data.values.find((candidate) => candidate.id === id)
          : undefined;
      return value === undefined
        ? id
        : t('view.instructions.valueRef', { label: t(value.labelKey), id });
    },
    [values, t],
  );
}

/** Hover/focus publishes the operand's ValueRef; leaving clears it unless another view changed it meanwhile. */
function useOperandSelection(valueRef: string) {
  const store = useLabStore();
  const enter = useCallback(() => store.getState().select(valueRef), [store, valueRef]);
  const leave = useCallback(() => {
    if (store.getState().selection.valueRefId === valueRef) store.getState().select(null);
  }, [store, valueRef]);
  return {
    onMouseEnter: enter,
    onFocus: enter,
    onClick: enter,
    onMouseLeave: leave,
    onBlur: leave,
  };
}

type ValueLabel = (id: string) => string;

interface OperandProps {
  text: string;
  valueRefs: readonly string[];
  showLabels: boolean;
  /** Whether one of `valueRefs` is the lab selection (looked up once by the listing). */
  selected: boolean;
  valueLabel: ValueLabel;
}

function LinkedOperand({ text, valueRefs, showLabels, selected, valueLabel }: OperandProps) {
  const handlers = useOperandSelection(valueRefs[0] ?? '');
  const names = valueRefs.map(valueLabel).join(OPERAND_SEPARATOR);
  return (
    <button
      type="button"
      className="cv-instructions__operand"
      data-value-ref={valueRefs[0]}
      data-selected={selected ? '' : undefined}
      {...handlers}
    >
      <code>{text}</code>
      <span className={showLabels ? 'cv-instructions__ref' : 'cv-visually-hidden'}>{names}</span>
    </button>
  );
}

function Operand(props: OperandProps) {
  if (props.valueRefs.length === 0)
    return <code className="cv-instructions__operand">{props.text}</code>;
  return <LinkedOperand {...props} />;
}

interface OperandsProps {
  instruction: Instruction;
  refs: readonly (readonly string[])[];
  lens: Lens;
  selectedRef: string | null;
  valueLabel: ValueLabel;
}

function Operands({ instruction, refs, lens, selectedRef, valueLabel }: OperandsProps) {
  return (
    <span className="cv-instructions__operands">
      {instruction.operands.map((text, index) => (
        <span key={index} className="cv-instructions__operand-item">
          <Operand
            text={text}
            valueRefs={refs[index] ?? []}
            showLabels={lens === 'cryptographer'}
            selected={selectedRef !== null && (refs[index] ?? []).includes(selectedRef)}
            valueLabel={valueLabel}
          />
          {index < instruction.operands.length - 1 && OPERAND_SEPARATOR}
        </span>
      ))}
    </span>
  );
}

function Note({ note, current }: { note: I18nRef; current: boolean }) {
  const t = useT();
  if (current) return <p className="cv-instructions__note">{t(note)}</p>;
  return (
    <span className="cv-instructions__note-mark">
      <span aria-hidden="true">{NOTE_GLYPH}</span>
      <span className="cv-visually-hidden">{t('view.instructions.hasNote')}</span>
    </span>
  );
}

function Covers({
  instruction,
  lens,
  current,
}: {
  instruction: Instruction;
  lens: Lens;
  current: boolean;
}) {
  const t = useT();
  const covers = instruction.covers ?? [];
  return (
    <>
      {covers.length > 0 && (
        <ul className="cv-instructions__covers" aria-label={t('view.instructions.coversLabel')}>
          {covers.map((cover, index) => (
            <li key={index}>{t(cover)}</li>
          ))}
        </ul>
      )}
      {lens !== 'story' && instruction.note !== undefined && (
        <Note note={instruction.note} current={current} />
      )}
    </>
  );
}

interface RowProps {
  index: number;
  instruction: Instruction;
  /** The ValueRefs behind each operand (`operandValueRefs`), computed once per facet. */
  operandRefs: readonly (readonly string[])[];
  status: RowStatus;
  lens: Lens;
  /** The lab selection when one of this row's operands carries it, else `null` (keeps other rows memoised). */
  selectedRef: string | null;
  valueLabel: ValueLabel;
}

/** One listing row; memoised, so a step or a selection re-renders only the rows it changes. */
const Row = memo(function Row({ index, instruction, operandRefs, status, lens, selectedRef, valueLabel }: RowProps) {
  const t = useT();
  const story = lens === 'story';
  return (
    <tr
      role="row"
      className="cv-instructions__row"
      data-index={index}
      data-status={status}
      aria-current={status === 'current' ? 'step' : undefined}
    >
      <td role="cell" className="cv-instructions__status">
        <span aria-hidden="true">{STATUS_GLYPHS[status]}</span>
        <span className="cv-visually-hidden">{t(`view.instructions.status.${status}`)}</span>
      </td>
      {!story && (
        <td role="cell" className="cv-instructions__address">
          <code>{instruction.address}</code>
        </td>
      )}
      <td role="cell" className="cv-instructions__mnemonic">
        <code>{instruction.mnemonic}</code>
      </td>
      {!story && (
        <td role="cell">
          <Operands
            instruction={instruction}
            refs={operandRefs}
            lens={lens}
            selectedRef={selectedRef}
            valueLabel={valueLabel}
          />
        </td>
      )}
      <td role="cell" className="cv-instructions__does">
        <Covers instruction={instruction} lens={lens} current={status === 'current'} />
      </td>
    </tr>
  );
});

/** `selected` when one of the row's operands carries it, else `null`. */
function rowSelection(refs: readonly (readonly string[])[] | undefined, selected: string | null): string | null {
  if (selected === null || refs === undefined) return null;
  return refs.some((operand) => operand.includes(selected)) ? selected : null;
}

/** Scrolls `row` into view inside `scroller` only (adjusting its scrollTop; the page never moves). */
function revealInScroller(scroller: HTMLElement, row: HTMLElement): void {
  const box = scroller.getBoundingClientRect();
  const target = row.getBoundingClientRect();
  const header = scroller.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  if (target.top < box.top + header) scroller.scrollTop -= box.top + header - target.top;
  else if (target.bottom > box.bottom) scroller.scrollTop += target.bottom - box.bottom;
}

function useRevealCurrent(current: number | undefined) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const row =
      current === undefined
        ? null
        : scroller?.querySelector<HTMLElement>(`tr[data-index="${current}"]`);
    if (scroller && row) revealInScroller(scroller, row);
  }, [current]);
  return scrollerRef;
}

function HeaderRow({ lens }: { lens: Lens }) {
  const t = useT();
  const story = lens === 'story';
  return (
    <tr role="row">
      <th role="columnheader" scope="col">
        <span className="cv-visually-hidden">{t('view.instructions.column.status')}</span>
      </th>
      {!story && (
        <th role="columnheader" scope="col">
          {t('view.instructions.column.address')}
        </th>
      )}
      <th role="columnheader" scope="col">
        {t('view.instructions.column.mnemonic')}
      </th>
      {!story && (
        <th role="columnheader" scope="col">
          {t('view.instructions.column.operands')}
        </th>
      )}
      <th role="columnheader" scope="col" className="cv-instructions__does">
        {t('view.instructions.column.does')}
      </th>
    </tr>
  );
}

function Source({ source }: { source: InstructionsFacet['source'] }) {
  const t = useT();
  return (
    <p className="cv-instructions__source">
      <span>
        {t('view.instructions.source', {
          compiler: source.compiler,
          flags: source.flags,
          triple: source.triple,
          function: source.function,
        })}
      </span>
      {source.compilerExplorerUrl !== undefined && (
        <a
          href={source.compilerExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('view.instructions.compilerExplorerNewTab')}
        >
          {t('view.instructions.compilerExplorer')}
        </a>
      )}
    </p>
  );
}

function Listing({
  facet,
  lens,
  picker,
}: {
  facet: InstructionsFacet;
  lens: Lens;
  picker: ReactNode;
}) {
  const t = useT();
  const step = useLab((state) => state.step);
  const selected = useLab((state) => state.selection.valueRefId);
  const valueLabel = useValueLabel();
  const operandRefs = useMemo(() => facet.instructions.map((instruction) => operandValueRefs(instruction)), [facet]);
  const progress = listingProgress(facet, step);
  const scrollerRef = useRevealCurrent(progress.current);
  return (
    <section
      className="cv-view cv-instructions"
      aria-label={t('view.instructions.title')}
      data-lens={lens}
    >
      {picker}
      {lens !== 'story' && <Source source={facet.source} />}
      <div ref={scrollerRef} className="cv-instructions__scroll">
        <table role="table" className="cv-instructions__table">
          <caption className="cv-visually-hidden">
            {t('view.instructions.caption', {
              label: t(facet.label),
              count: facet.instructions.length,
            })}
          </caption>
          <thead role="rowgroup">
            <HeaderRow lens={lens} />
          </thead>
          <tbody role="rowgroup">
            {facet.instructions.map((instruction, index) => (
              <Row
                key={index}
                index={index}
                instruction={instruction}
                operandRefs={operandRefs[index] ?? []}
                status={rowStatus(index, progress)}
                lens={lens}
                selectedRef={rowSelection(operandRefs[index], selected)}
                valueLabel={valueLabel}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="cv-instructions__legend">{t('view.instructions.legend')}</p>
    </section>
  );
}

/** The chosen ISA variant's listing at the playhead. */
export default function InstructionsView({ lens }: ViewProps) {
  const t = useT();
  const { facet, options, chosen, choose } = useVariantChoice<InstructionsFacet>('instructions');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  const picker = (
    <VariantPicker
      className="cv-instructions__variant"
      label={t('view.instructions.variant')}
      options={options}
      chosen={chosen}
      onChoose={choose}
    />
  );
  return <Listing facet={facet.data} lens={lens} picker={picker} />;
}
