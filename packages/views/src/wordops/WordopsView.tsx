import { Fragment, memo, useId, useMemo, type CSSProperties } from 'react';
import type { Lens, WordBits, WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { MathText, ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { chunk } from '../_lib/chunk.ts';
import { ScrollRegion } from '../_lib/ScrollRegion.tsx';
import { useSelectionPreviewHandlers } from '../_lib/useSelectionPreview.ts';
import { useValueLabel } from '../_lib/useValueLabel.ts';
import {
  NIBBLE,
  arrowTermText,
  opGlyphKey,
  opNameKey,
  TERM_ROLE_GLYPHS,
  hexChunks,
  lensParts,
  nibbleGroups,
  registerArrows,
  registerChunksPerLine,
  showsBitStrip,
  storyTerms,
  wordBitsOf,
  wordopsStepAt,
  type LensParts,
  type ShiftArrow,
} from './wordopsModel.ts';
import './wordops.css';

/**
 * Word operations (`wordops` facet, docs/M5.md §4): the 32/64-bit word equation of the latest wordops
 * step at the playhead (as the math view: sparse steps keep the latest one; before the first, that one
 * is previewed in a dashed frame tagged "preview" under a start hint, not linked: its values are not
 * computed yet). With `registerNames`: the registers before and after the
 * step, with arrows for how each after-register comes about (dashed + bold for the computed ones,
 * listed in words for screen readers): schema v2 draws the step's `transfers` (a term arrow carries
 * the right-hand side of the term's label); v1 keeps the structural SHA-2 shift b ← a, …,
 * e ← d + T1, a ← T1 + T2 (docs/M6.md §3b). With `registerColumns` the registers form a grid (the
 * BLAKE2 4 × 4 matrix) whose `touched` cells (the G column or diagonal) are highlighted with a ◆ in
 * both grids; the transfers are then listed in words only. Without arrows, changed registers get a •.
 * Then the terms in dataflow order: label, operator glyph (√ / ∛ for a root's `degree`), hex in
 * 4-digit chunks. Lenses: story = registers + the story terms (`storyTerms`: v2 `emphasis`, v1
 * results and T1/T2; a hint when a step has none); engineer = all terms, 32-bit rotation/shift terms
 * also as bit strips (64-bit stays hex); cryptographer = the formula + all terms.
 * Terms with a ValueRef publish it as the lab selection on hover/focus. Each term shows its role as a
 * glyph and in words, not by colour only. Both blocks scroll horizontally inside the panel on a phone,
 * never the page (focusable only while they overflow). 64-bit register words wrap onto two lines.
 */
const STATUS_KEYS = { loading: 'view.wordops.loading', missing: 'view.wordops.missing' } as const;

export default function WordopsView({ lens }: ViewProps) {
  const facet = useFacet<WordopsFacet>('wordops');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <WordopsPanel facet={facet.data} lens={lens} />;
}

function WordopsPanel({ facet, lens }: { facet: WordopsFacet; lens: Lens }) {
  const t = useT();
  const parts = lensParts(lens);
  const step = useLab((state) => state.step);
  const current = wordopsStepAt(facet, step);
  const upcoming = current === undefined ? facet.steps[0] : undefined;
  return (
    <section className="cv-view cv-wordops" aria-label={t('view.wordops.title')} data-lens={lens} data-bits={facet.wordBits}>
      {current !== undefined && <WordStep facet={facet} wordStep={current} parts={parts} linked />}
      {upcoming !== undefined && (
        <div className="cv-wordops__upcoming" data-upcoming="">
          <p className="cv-wordops__hint">
            <strong className="cv-wordops__tag">{t('view.wordops.previewTag')}</strong> {t('view.wordops.upcoming')}
          </p>
          <WordStep facet={facet} wordStep={upcoming} parts={parts} linked={false} />
        </div>
      )}
      {current === undefined && upcoming === undefined && <p className="cv-wordops__empty">{t('view.wordops.notYet')}</p>}
    </section>
  );
}

interface WordStepProps {
  facet: WordopsFacet;
  wordStep: WordopsStep;
  parts: LensParts;
  /** Whether terms publish their ValueRef (false for the not-yet-computed preview). */
  linked: boolean;
}

function WordStep({ facet, wordStep, parts, linked }: WordStepProps) {
  const t = useT();
  const terms = parts.storyTermsOnly ? storyTerms(facet.schemaVersion, wordStep.terms) : wordStep.terms;
  const nothingToTell = parts.storyTermsOnly && terms.length === 0 && wordStep.terms.length > 0;
  return (
    <>
      {parts.formula && (
        <p className="cv-wordops__formula">
          <MathText text={t(wordStep.formula)} />
        </p>
      )}
      {facet.registerNames !== undefined && wordStep.registers !== undefined && (
        <Registers facet={facet} names={facet.registerNames} wordStep={wordStep} />
      )}
      {terms.length > 0 && <TermTable terms={terms} wordBits={facet.wordBits} bitStrips={parts.bitStrips} linked={linked} />}
      {nothingToTell && <p className="cv-wordops__hint">{t('view.wordops.storyNone')}</p>}
    </>
  );
}

/** Both blocks scroll horizontally inside the panel (keyboard-focusable while they overflow). */
const SCROLL_CLASS = 'cv-wordops__scroll cv-scroll-shadow';

/** Space-separated spans, keyed by position (the spaces keep the copied / read text "6a09 e667"). */
function Spaced({ items, className }: { items: readonly string[]; className: string }) {
  return items.map((text, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      <span className={className}>{text}</span>
    </Fragment>
  ));
}

/** A hex word in 4-digit chunks; with `chunksPerLine`, the chunks break onto lines of that many. */
function HexWord({ hex, chunksPerLine }: { hex: string; chunksPerLine?: number }) {
  const chunks = hexChunks(hex);
  if (chunksPerLine === undefined) {
    return (
      <code className="cv-wordops__word">
        <Spaced items={chunks} className="cv-wordops__chunk" />
      </code>
    );
  }
  return (
    <code className="cv-wordops__word">
      {chunk(chunks, chunksPerLine).map((line, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="cv-wordops__line">
            <Spaced items={line} className="cv-wordops__chunk" />
          </span>
        </Fragment>
      ))}
    </code>
  );
}

/* ---------- registers and their arrows ---------- */

function Registers({ facet, names, wordStep }: { facet: WordopsFacet; names: string[]; wordStep: WordopsStep }) {
  const t = useT();
  const registers = wordStep.registers!;
  const arrows = useMemo(() => registerArrows(facet.schemaVersion, wordStep), [facet.schemaVersion, wordStep]);
  const rowProps = { names, touched: new Set(registers.touched), chunksPerLine: registerChunksPerLine(facet.wordBits) };
  const before = arrows === undefined ? registers.before : undefined;
  if (facet.registerColumns !== undefined) {
    return (
      <ScrollRegion className={SCROLL_CLASS} label={t('view.wordops.registers')}>
        <div className="cv-wordops__grids" style={{ '--cv-wordops-cols': facet.registerColumns } as CSSProperties}>
          <RegisterGrid side="before" words={registers.before} columns={facet.registerColumns} {...rowProps} />
          <RegisterGrid side="after" words={registers.after} before={before} columns={facet.registerColumns} {...rowProps} />
        </div>
        {rowProps.touched.size > 0 && <p className="cv-wordops__legend">{t('view.wordops.touchedLegend')}</p>}
        {arrows !== undefined && <ArrowList names={names} arrows={arrows} terms={wordStep.terms} />}
      </ScrollRegion>
    );
  }
  return (
    <ScrollRegion className={SCROLL_CLASS} label={t('view.wordops.registers')}>
      <div className="cv-wordops__registers" style={{ '--cv-wordops-regs': names.length } as CSSProperties} data-shift={arrows !== undefined || undefined}>
        <RegisterRow side="before" words={registers.before} {...rowProps} />
        {arrows !== undefined && <ShiftArrows names={names} arrows={arrows} terms={wordStep.terms} />}
        <RegisterRow side="after" words={registers.after} before={before} {...rowProps} />
      </div>
      {rowProps.touched.size > 0 && <p className="cv-wordops__legend">{t('view.wordops.touchedLegend')}</p>}
    </ScrollRegion>
  );
}

interface RegisterRowProps {
  side: 'before' | 'after';
  names: string[];
  words: string[];
  /** The words before the step, to mark changed registers (only without arrows). */
  before?: string[] | undefined;
  /** Register indices the step reads and writes (v2), marked ◆ on both sides. */
  touched: ReadonlySet<number>;
  chunksPerLine: number | undefined;
}

/** The registers of one side as a grid of `columns` columns (the BLAKE2 matrix), its label above. */
function RegisterGrid({ columns, ...row }: RegisterRowProps & { columns: number }) {
  const t = useT();
  return (
    <div className="cv-wordops__grid" role="group" aria-label={t(`view.wordops.${row.side}`)} data-side={row.side} data-columns={columns}>
      <span className="cv-wordops__gridside" aria-hidden="true">
        {t(`view.wordops.${row.side}`)}
      </span>
      <RegisterCells {...row} />
    </div>
  );
}

function RegisterRow(row: RegisterRowProps) {
  const t = useT();
  return (
    <div className="cv-wordops__regrow" role="group" aria-label={t(`view.wordops.${row.side}`)} data-side={row.side}>
      <span className="cv-wordops__regside" aria-hidden="true">
        {t(`view.wordops.${row.side}`)}
      </span>
      <RegisterCells {...row} />
    </div>
  );
}

function RegisterCells({ names, words, before, touched, chunksPerLine }: RegisterRowProps) {
  return names.map((name, index) => (
    <RegisterCell
      key={name}
      name={name}
      hex={words[index] ?? ''}
      changed={before !== undefined && before[index] !== words[index]}
      touched={touched.has(index)}
      chunksPerLine={chunksPerLine}
    />
  ));
}

interface RegisterCellProps {
  name: string;
  hex: string;
  changed: boolean;
  touched: boolean;
  chunksPerLine: number | undefined;
}

/** One register: its name (plus a ◆ when touched, a • when changed, each also in words) and its word. */
function RegisterCell({ name, hex, changed, touched, chunksPerLine }: RegisterCellProps) {
  return (
    <span className="cv-wordops__reg" data-register={name} data-changed={changed || undefined} data-touched={touched || undefined}>
      <span className="cv-wordops__regname">
        {name}
        {touched && <RegisterMark glyph=" ◆" textKey="view.wordops.touched" />}
        {changed && <RegisterMark glyph=" •" textKey="view.wordops.changed" />}
      </span>
      <HexWord hex={hex} chunksPerLine={chunksPerLine} />
    </span>
  );
}

function RegisterMark({ glyph, textKey }: { glyph: string; textKey: 'view.wordops.touched' | 'view.wordops.changed' }) {
  const t = useT();
  return (
    <>
      <span aria-hidden="true">{glyph}</span>
      <span className="cv-visually-hidden">{t(textKey)}</span>
    </>
  );
}

const COLUMN = 100;
const ARROW_TOP = 4;
const ARROW_BOTTOM = 44;
const ARROW_HEIGHT = 48;
/** The T1 + T2 arrow starts below its label (baseline at `SUM_LABEL_BASELINE`), with a clear gap. */
const SUM_LABEL_BASELINE = ARROW_TOP + 11;
const SUM_START = SUM_LABEL_BASELINE + 7;
/**
 * A term arrow's label ends just left of its target column's centre: it then stays clear of the
 * arrow that leaves that column (the register's old value moving on, e.g. MD5's c ← b).
 */
const TERM_LABEL_END = -4;

function arrowPath(arrow: ShiftArrow): { x1: number; y1: number; x2: number; y2: number } {
  const x2 = arrow.to * COLUMN + COLUMN / 2;
  if (arrow.from === undefined) return { x1: x2 - COLUMN / 4, y1: SUM_START, x2, y2: ARROW_BOTTOM };
  return { x1: arrow.from * COLUMN + COLUMN / 2, y1: ARROW_TOP, x2, y2: ARROW_BOTTOM };
}

/** The translated label of the step's term `id` ('' when absent; validation guarantees it exists). */
function termLabel(terms: readonly WordTerm[], id: string | undefined, t: ReturnType<typeof useT>): string {
  const term = terms.find((each) => each.id === id);
  return term === undefined ? '' : t(term.label);
}

function arrowText(arrow: ShiftArrow, names: string[], terms: readonly WordTerm[], t: ReturnType<typeof useT>): string {
  const to = names[arrow.to] ?? '';
  if (arrow.source === 'term') return t('view.wordops.shift.term', { to, term: termLabel(terms, arrow.term, t) });
  const from = arrow.from === undefined ? '' : (names[arrow.from] ?? '');
  return t(`view.wordops.shift.${arrow.source}`, { to, from });
}

interface ArrowsProps {
  names: string[];
  arrows: readonly ShiftArrow[];
  /** The step's terms, for the labels of term arrows. */
  terms: readonly WordTerm[];
}

/** The arrows in words (screen readers; the grid layout draws no SVG arrows). */
function ArrowList({ names, arrows, terms }: ArrowsProps) {
  const t = useT();
  return (
    <ul className="cv-visually-hidden" aria-label={t('view.wordops.shift.title')}>
      {arrows.map((arrow) => (
        <li key={arrow.to}>{arrowText(arrow, names, terms, t)}</li>
      ))}
    </ul>
  );
}

/** Arrowheads: plain for copies, the computed colour for e ← d + T1 and a ← T1 + T2. */
const ARROW_HEADS = ['copy', 'calc'] as const;

/** The labelled shift arrows (decorative SVG) plus the same arrows in words for screen readers. */
function ShiftArrows({ names, arrows, terms }: ArrowsProps) {
  const t = useT();
  const markerId = useId();
  return (
    <div className="cv-wordops__shift">
      <svg
        className="cv-wordops__arrows"
        viewBox={`0 0 ${names.length * COLUMN} ${ARROW_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {ARROW_HEADS.map((head) => (
            <marker key={head} id={`${markerId}-${head}`} className="cv-wordops__head" data-source={head} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          ))}
        </defs>
        {arrows.map((arrow) => (
          <ShiftLine key={arrow.to} arrow={arrow} markerId={`${markerId}-${arrow.source === 'copy' ? 'copy' : 'calc'}`} termText={arrowTermText(termLabel(terms, arrow.term, t))} />
        ))}
      </svg>
      <ArrowList names={names} arrows={arrows} terms={terms} />
    </div>
  );
}

function ShiftLine({ arrow, markerId, termText }: { arrow: ShiftArrow; markerId: string; termText: string }) {
  const t = useT();
  const { x1, y1, x2, y2 } = arrowPath(arrow);
  return (
    <g className="cv-wordops__arrow" data-source={arrow.source}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#${markerId})`} />
      {arrow.source === 'plusT1' && (
        <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 - 2} className="cv-wordops__arrowlabel">
          {t('view.wordops.arrow.plusT1')}
        </text>
      )}
      {arrow.source === 'sum' && (
        <text x={x1} y={SUM_LABEL_BASELINE} textAnchor="middle" className="cv-wordops__arrowlabel">
          {t('view.wordops.arrow.sum')}
        </text>
      )}
      {arrow.source === 'term' && (
        <text x={x2 + TERM_LABEL_END} y={SUM_LABEL_BASELINE} textAnchor="end" className="cv-wordops__arrowlabel">
          {termText}
        </text>
      )}
    </g>
  );
}

/* ---------- terms ---------- */

interface TermTableProps {
  terms: WordTerm[];
  wordBits: WordBits;
  bitStrips: boolean;
  linked: boolean;
}

function TermTable({ terms, wordBits, bitStrips, linked }: TermTableProps) {
  const t = useT();
  const showBits = bitStrips && terms.some((term) => showsBitStrip(term, wordBits));
  const selected = useLab((state) => state.selection.valueRefId);
  const valueLabel = useValueLabel();
  return (
    <ScrollRegion className={SCROLL_CLASS} label={t('view.wordops.terms')}>
      <table role="table" className="cv-wordops__table" data-bits={showBits || undefined}>
        <caption className="cv-visually-hidden">{t('view.wordops.terms')}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              {t('view.wordops.col.term')}
            </th>
            <th scope="col" role="columnheader">
              {t('view.wordops.col.op')}
            </th>
            <th scope="col" role="columnheader">
              {t('view.wordops.col.hex')}
            </th>
            {showBits && (
              <th scope="col" role="columnheader">
                {t('view.wordops.col.bits')}
              </th>
            )}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {terms.map((term) => (
            <TermRow
              key={term.id}
              term={term}
              bits={showBits ? showsBitStrip(term, wordBits) : undefined}
              linked={linked}
              selected={linked && term.valueRef !== undefined && term.valueRef === selected}
              valueLabel={valueLabel}
            />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

interface TermRowProps {
  term: WordTerm;
  /** `undefined` = no bits column; false = an empty cell in it. */
  bits: boolean | undefined;
  /** Whether a ValueRef is a hover/focus link (false in the preview). */
  linked: boolean;
  selected: boolean;
  valueLabel: (id: string) => string | undefined;
}

/** Memoised: a hover or selection change re-renders only the rows whose `selected` flips. */
const TermRow = memo(function TermRow({ term, bits, linked, selected, valueLabel }: TermRowProps) {
  const t = useT();
  return (
    <tr role="row" className="cv-wordops__row" data-role={term.role} data-term={term.id} data-selected={selected || undefined}>
      <th scope="row" role="rowheader" className="cv-wordops__label">
        <span className="cv-wordops__roleglyph" aria-hidden="true">
          {TERM_ROLE_GLYPHS[term.role]}
        </span>
        {!linked || term.valueRef === undefined ? (
          <span className="cv-wordops__name">
            <MathText text={t(term.label)} />
          </span>
        ) : (
          <LinkedLabel term={term} valueRef={term.valueRef} valueLabel={valueLabel} />
        )}
        <span className="cv-visually-hidden">{t('view.wordops.roleSuffix', { role: t(`view.wordops.role.${term.role}`) })}</span>
      </th>
      <td role="cell" className="cv-wordops__op">
        {term.op !== undefined && (
          <>
            <span aria-hidden="true">{t(opGlyphKey({ op: term.op, degree: term.degree }))}</span>
            <span className="cv-visually-hidden">{t(opNameKey({ op: term.op, degree: term.degree }))}</span>
          </>
        )}
      </td>
      <td role="cell" className="cv-wordops__hex">
        <HexWord hex={term.hex} />
      </td>
      {bits !== undefined && (
        <td role="cell" className="cv-wordops__bitcell">
          {bits && <BitStrip hex={term.hex} />}
        </td>
      )}
    </tr>
  );
});

/** Hover/focus publishes the term's ValueRef; it follows the ref across steps and is released on leave. */
function LinkedLabel({ term, valueRef, valueLabel }: { term: WordTerm; valueRef: string; valueLabel: TermRowProps['valueLabel'] }) {
  const t = useT();
  const handlers = useSelectionPreviewHandlers(valueRef);
  const linked = valueLabel(valueRef);
  return (
    <button type="button" className="cv-wordops__link cv-wordops__name" data-value-ref={valueRef} {...handlers}>
      <MathText text={t(term.label)} />
      {linked !== undefined && <span className="cv-visually-hidden">{t('view.wordops.linked', { label: linked })}</span>}
    </button>
  );
}

/** A 32-bit word as one strip of cells MSB → LSB, grouped by nibble; one accessible name for the whole strip. */
function BitStrip({ hex }: { hex: string }) {
  const t = useT();
  const bits = wordBitsOf(hex);
  return (
    <span className="cv-wordops__bits" role="img" aria-label={t('view.wordops.bits', { bits: nibbleGroups(bits) })}>
      {bits.map((bit, index) => (
        <span key={index} className="cv-wordops__bit" data-set={bit || undefined} data-nibble-end={(index + 1) % NIBBLE === 0 || undefined} aria-hidden="true">
          {bit ? '1' : '0'}
        </span>
      ))}
    </span>
  );
}
