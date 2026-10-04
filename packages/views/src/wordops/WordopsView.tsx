import { Fragment, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Lens, WordBits, WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { MathText, ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { useScrollFocusable } from '../_lib/useScrollFocusable.ts';
import { useSelectionPreviewHandlers } from '../_lib/useSelectionPreview.ts';
import { useValueLabel } from '../_lib/useValueLabel.ts';
import {
  OP_GLYPHS,
  TERM_ROLE_GLYPHS,
  hexChunks,
  isStoryTerm,
  lensParts,
  nibbleGroups,
  sha2RegisterShift,
  showsBitStrip,
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
 * step; on a SHA-2 round (eight registers, T1/T2 and data that agree) the shift b ← a, …, e ← d + T1,
 * a ← T1 + T2 is drawn as labelled arrows (dashed + bold for the computed ones, listed in words for
 * screen readers). Then the terms in dataflow order: label, operator glyph, hex in 4-digit chunks.
 * Lenses: story = registers + results and T1/T2 only (`isStoryTerm`); engineer = all terms, 32-bit
 * rotation/shift terms also as bit strips (64-bit stays hex); cryptographer = the formula + all terms.
 * Terms with a ValueRef publish it as the lab selection on hover/focus. Each term shows its role as a
 * glyph and in words, not by colour only. Both blocks scroll horizontally inside the panel on a phone,
 * never the page (focusable only while they overflow). 64-bit register words wrap onto two lines.
 */
const STATUS_KEYS = { loading: 'view.wordops.loading', missing: 'view.wordops.missing' } as const;

export default function WordopsView({ lens }: ViewProps) {
  const facet = useFacet<WordopsFacet>('wordops');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <WordopsPanel facet={facet.data} parts={lensParts(lens)} lens={lens} />;
}

function WordopsPanel({ facet, parts, lens }: { facet: WordopsFacet; parts: LensParts; lens: Lens }) {
  const t = useT();
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
  const terms = parts.storyTermsOnly ? wordStep.terms.filter(isStoryTerm) : wordStep.terms;
  return (
    <>
      {parts.formula && (
        <p className="cv-wordops__formula">
          <MathText text={t(wordStep.formula)} />
        </p>
      )}
      {facet.registerNames !== undefined && wordStep.registers !== undefined && (
        <Registers names={facet.registerNames} wordStep={wordStep} wordBits={facet.wordBits} />
      )}
      {terms.length > 0 && <TermTable terms={terms} wordBits={facet.wordBits} bitStrips={parts.bitStrips} linked={linked} />}
    </>
  );
}

/** A horizontal scroll region, in the tab order unless measured as fitting (keyboard scrolling). */
function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusable = useScrollFocusable(ref);
  return (
    <div ref={ref} className="cv-wordops__scroll cv-scroll-shadow" role="region" tabIndex={focusable ? 0 : undefined} aria-label={label}>
      {children}
    </div>
  );
}

function HexWord({ hex }: { hex: string }) {
  return (
    <code className="cv-wordops__word">
      {hexChunks(hex).map((chunk, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="cv-wordops__chunk">{chunk}</span>
        </Fragment>
      ))}
    </code>
  );
}

/* ---------- registers and the SHA-2 shift ---------- */

function Registers({ names, wordStep, wordBits }: { names: string[]; wordStep: WordopsStep; wordBits: WordBits }) {
  const t = useT();
  const registers = wordStep.registers!;
  const arrows = sha2RegisterShift(wordStep, wordBits);
  return (
    <ScrollRegion label={t('view.wordops.registers')}>
      <div className="cv-wordops__registers" style={{ '--cv-wordops-regs': names.length } as CSSProperties} data-shift={arrows !== undefined || undefined}>
        <RegisterRow side="before" names={names} words={registers.before} />
        {arrows !== undefined && <ShiftArrows names={names} arrows={arrows} />}
        <RegisterRow side="after" names={names} words={registers.after} before={arrows === undefined ? registers.before : undefined} />
      </div>
    </ScrollRegion>
  );
}

function RegisterRow({ side, names, words, before }: { side: 'before' | 'after'; names: string[]; words: string[]; before?: string[] }) {
  const t = useT();
  return (
    <div className="cv-wordops__regrow" role="group" aria-label={t(`view.wordops.${side}`)} data-side={side}>
      <span className="cv-wordops__regside" aria-hidden="true">
        {t(`view.wordops.${side}`)}
      </span>
      {names.map((name, index) => {
        const changed = before !== undefined && before[index] !== words[index];
        return (
          <span key={name} className="cv-wordops__reg" data-register={name} data-changed={changed || undefined}>
            <span className="cv-wordops__regname">
              {name}
              {changed && (
                <>
                  <span aria-hidden="true">{' •'}</span>
                  <span className="cv-visually-hidden">{t('view.wordops.changed')}</span>
                </>
              )}
            </span>
            <HexWord hex={words[index] ?? ''} />
          </span>
        );
      })}
    </div>
  );
}

const COLUMN = 100;
const ARROW_TOP = 4;
const ARROW_BOTTOM = 44;
const ARROW_HEIGHT = 48;
/** The T1 + T2 arrow starts below its label (baseline at `SUM_LABEL_BASELINE`), with a clear gap. */
const SUM_LABEL_BASELINE = ARROW_TOP + 11;
const SUM_START = SUM_LABEL_BASELINE + 7;

function arrowPath(arrow: ShiftArrow): { x1: number; y1: number; x2: number; y2: number } {
  const x2 = arrow.to * COLUMN + COLUMN / 2;
  if (arrow.from === undefined) return { x1: x2 - COLUMN / 4, y1: SUM_START, x2, y2: ARROW_BOTTOM };
  return { x1: arrow.from * COLUMN + COLUMN / 2, y1: ARROW_TOP, x2, y2: ARROW_BOTTOM };
}

function arrowText(arrow: ShiftArrow, names: string[], t: ReturnType<typeof useT>): string {
  const to = names[arrow.to] ?? '';
  const from = arrow.from === undefined ? '' : (names[arrow.from] ?? '');
  return t(`view.wordops.shift.${arrow.source}`, { to, from });
}

/** The labelled shift arrows (decorative SVG) plus the same arrows in words for screen readers. */
function ShiftArrows({ names, arrows }: { names: string[]; arrows: ShiftArrow[] }) {
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
          <marker id={`${markerId}-copy`} className="cv-wordops__head" data-source="copy" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" />
          </marker>
          <marker id={`${markerId}-calc`} className="cv-wordops__head" data-source="calc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>
        {arrows.map((arrow) => (
          <ShiftLine key={arrow.to} arrow={arrow} markerId={`${markerId}-${arrow.source === 'copy' ? 'copy' : 'calc'}`} />
        ))}
      </svg>
      <ul className="cv-visually-hidden" aria-label={t('view.wordops.shift.title')}>
        {arrows.map((arrow) => (
          <li key={arrow.to}>{arrowText(arrow, names, t)}</li>
        ))}
      </ul>
    </div>
  );
}

function ShiftLine({ arrow, markerId }: { arrow: ShiftArrow; markerId: string }) {
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
    <ScrollRegion label={t('view.wordops.terms')}>
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

function TermRow({ term, bits, linked, selected, valueLabel }: TermRowProps) {
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
            <span aria-hidden="true">{OP_GLYPHS[term.op]}</span>
            <span className="cv-visually-hidden">{t(`view.wordops.op.${term.op}`)}</span>
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
}

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

const NIBBLE_BITS = 4;

/** A 32-bit word as one strip of cells MSB → LSB, grouped by nibble; one accessible name for the whole strip. */
function BitStrip({ hex }: { hex: string }) {
  const t = useT();
  const bits = wordBitsOf(hex);
  return (
    <span className="cv-wordops__bits" role="img" aria-label={t('view.wordops.bits', { bits: nibbleGroups(bits) })}>
      {bits.map((bit, index) => (
        <span key={index} className="cv-wordops__bit" data-set={bit || undefined} data-nibble-end={(index + 1) % NIBBLE_BITS === 0 || undefined} aria-hidden="true">
          {bit ? '1' : '0'}
        </span>
      ))}
    </span>
  );
}
