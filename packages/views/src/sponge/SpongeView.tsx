import { memo, useCallback, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Lens, SpongeFacet, SpongeStep } from '@cryventure/core';
import { MathText, ViewStatus, moveGridFocus, useFacet, useLab, useT } from '@cryventure/viz';
import type { ViewProps } from '@cryventure/viz';
import { ScrollRegion } from '../_lib/ScrollRegion.tsx';
import {
  changedLanes,
  chiTerms,
  isRateLane,
  laneIndex,
  laneLevel,
  laneLines,
  lanePosition,
  lensParts,
  mod,
  outputGroups,
  piSourceOf,
  selectionUse,
  spongeMomentAt,
  spongeSizes,
  thetaNeighbours,
  type LanePosition,
  type LensParts,
} from './spongeModel.ts';
import './sponge.css';

/**
 * Sponge state (`sponge` facet, docs/M6.md §4): the lanes of the permutation state after the latest
 * sponge step at the playhead (core `latestStepAt`), as a width × height grid with x left → right and
 * y top → bottom (a note says FIPS 202 figures put (0, 0) in the centre). Rate lanes are tinted,
 * capacity lanes hatched; lanes that changed in this step flash (a static border and • under reduced
 * motion). Lenses: story = colour tiles only (tone from the lane's top byte); engineer = each lane as
 * hex on lines of 8 digits; cryptographer = hex plus the step mapping in FIPS 202 notation.
 * Per phase the view draws its own overlay: absorb "⊕ block" on the rate lanes; θ the C and D rows
 * under the grid with x − 1 and x + 1 marked for the selected column; ρ an offset badge per lane; π
 * the source per lane (arrows on wide panels, "← (x, y)" labels on narrow ones); χ the selected row
 * with a ⊕ (¬b ∧ c); ι lane (0, 0) ⊕ RC; squeeze/output the rate bytes in output order.
 * Hover or the arrow keys (roving focus) select a lane and with it its column and row. The grid
 * scrolls horizontally inside the panel on a phone, never the page.
 */
const STATUS_KEYS = { loading: 'view.sponge.loading', missing: 'view.sponge.missing' } as const;

type T = ReturnType<typeof useT>;

export default function SpongeView({ lens }: ViewProps) {
  const facet = useFacet<SpongeFacet>('sponge');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <SpongePanel facet={facet.data} lens={lens} />;
}

function SpongePanel({ facet, lens }: { facet: SpongeFacet; lens: Lens }) {
  const t = useT();
  const playhead = useLab((state) => state.step);
  const moment = useMemo(() => spongeMomentAt(facet, playhead), [facet, playhead]);
  const parts = lensParts(lens);
  const selection = useLaneSelection(facet.width);
  const shown = moment?.current ?? facet.steps[0];
  return (
    <section className="cv-view cv-sponge" aria-label={t('view.sponge.title')} data-lens={lens} data-phase={moment?.current.phase}>
      <Header facet={facet} step={moment?.current} />
      {moment === undefined && <p className="cv-sponge__hint">{t('view.sponge.notYet')}</p>}
      {moment !== undefined && parts.formula && (
        <p className="cv-sponge__formula">
          <MathText text={t(`view.sponge.formula.${moment.current.phase}`)} />
        </p>
      )}
      {shown !== undefined && (
        <ScrollRegion className="cv-sponge__scroll cv-scroll-shadow" label={t('view.sponge.scroll')}>
          <LaneGrid facet={facet} step={moment?.current} lanes={shown.lanes} before={moment?.before} parts={parts} selection={selection} />
          {moment?.current.theta !== undefined && <ThetaRows facet={facet} step={moment.current} parts={parts} selectedX={selection.position.x} />}
        </ScrollRegion>
      )}
      {moment !== undefined && <PhaseDetail facet={facet} step={moment.current} before={moment.before} parts={parts} selected={selection.position} />}
      <Legend />
    </section>
  );
}

/* ---------- header, legend ---------- */

function Header({ facet, step }: { facet: SpongeFacet; step: SpongeStep | undefined }) {
  const t = useT();
  const sizes = spongeSizes(facet);
  return (
    <div className="cv-sponge__header">
      <p className="cv-sponge__label">
        <strong>{t(facet.label)}</strong>
        {step !== undefined && (
          <>
            {' · '}
            <span className="cv-sponge__phase">{step.round === undefined ? t(`view.sponge.phase.${step.phase}`) : t('view.sponge.phaseRound', { phase: t(`view.sponge.phase.${step.phase}`), round: step.round, last: facet.rounds - 1 })}</span>
          </>
        )}
      </p>
      <p className="cv-sponge__sizes">{t('view.sponge.sizes', { rateLanes: facet.rateLanes, rateBits: sizes.rateBits, capacityLanes: sizes.capacityLanes, capacityBits: sizes.capacityBits })}</p>
    </div>
  );
}

function Legend() {
  const t = useT();
  return (
    <div className="cv-sponge__legend">
      <p className="cv-sponge__keys">
        {(['rate', 'capacity'] as const).map((part) => (
          <span key={part} className="cv-sponge__keyitem">
            <span className="cv-sponge__key" data-part={part} aria-hidden="true" />
            {t(`view.sponge.legend.${part}`)}
          </span>
        ))}
      </p>
      <p className="cv-sponge__note">{t('view.sponge.orientation')}</p>
    </div>
  );
}

/* ---------- selection ---------- */

interface LaneSelection {
  /** The selected lane: the hovered one, else the keyboard (roving focus) one; (0, 0) at first. A key press drops the hover (the latest input wins). */
  position: LanePosition;
  /** The roving-focus lane (the one in the tab order). */
  active: LanePosition;
  /** Stable across renders (the memoised lanes take it as a prop). */
  setActive: (position: LanePosition) => void;
  /** Stable across renders. */
  hover: (index: number | undefined) => void;
}

function useLaneSelection(width: number): LaneSelection {
  const [active, setActive] = useState<LanePosition>({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  const setActiveAndDropHover = useCallback((position: LanePosition) => {
    setHovered(undefined);
    setActive(position);
  }, []);
  return { position: hovered === undefined ? active : lanePosition(hovered, width), active, setActive: setActiveAndDropHover, hover: setHovered };
}

/* ---------- the lane grid ---------- */

interface LaneGridProps {
  facet: SpongeFacet;
  /** The sponge step at the playhead; undefined before the first one (the grid then shows its lanes plainly). */
  step: SpongeStep | undefined;
  lanes: string[];
  before: string[] | undefined;
  parts: LensParts;
  selection: LaneSelection;
}

function LaneGrid({ facet, step, lanes, before, parts, selection }: LaneGridProps) {
  const t = useT();
  const changed = useMemo(() => changedLanes(before, lanes), [before, lanes]);
  const { width, height } = facet;
  const { active, position, setActive, hover } = selection;
  const gridRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = moveGridFocus({ row: active.y, col: active.x }, event.key, [height, width]);
    if (next === null) return;
    event.preventDefault();
    setActive({ x: next.col, y: next.row });
    gridRef.current?.querySelector<HTMLElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)?.focus();
  };
  return (
    <div
      ref={gridRef}
      className="cv-sponge__grid"
      role="grid"
      aria-label={t('view.sponge.grid')}
      style={{ '--cv-sponge-cols': width, '--cv-sponge-rows': height } as CSSProperties}
      onKeyDown={onKeyDown}
      onMouseLeave={() => hover(undefined)}
    >
      <div className="cv-sponge__gridrow" role="row">
        <span className="cv-sponge__corner" role="columnheader" style={gridArea(0, 0)}>
          <span className="cv-visually-hidden">{t('view.sponge.corner')}</span>
        </span>
        {range(width).map((x) => (
          <span key={x} className="cv-sponge__colhead" role="columnheader" style={gridArea(0, x + 1)} data-selected-col={x === position.x || undefined}>
            {t('view.sponge.x', { x })}
          </span>
        ))}
      </div>
      {range(height).map((y) => (
        <div key={y} className="cv-sponge__gridrow" role="row">
          <span className="cv-sponge__rowhead" role="rowheader" style={gridArea(y + 1, 0)} data-selected-row={y === position.y || undefined}>
            {t('view.sponge.y', { y })}
          </span>
          {range(width).map((x) => {
            const index = laneIndex(x, y, width);
            return (
              <Lane
                key={x}
                facet={facet}
                step={step}
                index={index}
                hex={lanes[index] ?? ''}
                changed={changed.has(index)}
                showHex={parts.hex}
                tabbable={active.x === x && active.y === y}
                {...laneMarks(facet, step, index, position)}
                onHover={hover}
                onFocusLane={setActive}
              />
            );
          })}
        </div>
      ))}
      {step?.phase === 'pi' && facet.piSource !== undefined && <PiArrows facet={facet} selected={laneIndex(position.x, position.y, width)} />}
    </div>
  );
}

interface LaneProps extends LaneMarks {
  facet: SpongeFacet;
  step: SpongeStep | undefined;
  index: number;
  hex: string;
  changed: boolean;
  showHex: boolean;
  /** The roving-focus lane (in the tab order). */
  tabbable: boolean;
  onHover: LaneSelection['hover'];
  onFocusLane: LaneSelection['setActive'];
}

/** Memoised with primitive props: a hover or key press re-renders only the lanes whose marks change. */
const Lane = memo(function Lane({ facet, step, index, hex, changed, showHex, tabbable, selected, inColumn, inRow, chiLetter, onHover, onFocusLane }: LaneProps) {
  const t = useT();
  const { x, y } = lanePosition(index, facet.width);
  const rate = isRateLane(index, facet.rateLanes);
  const badges = laneBadges(facet, step, index, chiLetter);
  const lines = laneLines(hex);
  const name = [
    t('view.sponge.lane', { x, y }),
    t(rate ? 'view.sponge.part.rate' : 'view.sponge.part.capacity'),
    ...(changed ? [t('view.sponge.changed')] : []),
    ...(inColumn ? [t('view.sponge.spoken.inColumn')] : []),
    ...(inRow ? [t('view.sponge.spoken.inRow')] : []),
    ...badges.map((badge) => t(badge.spoken, badge.params)),
    ...(showHex ? [lines.join(' ')] : []),
  ].join(', ');
  return (
    <span
      role="gridcell"
      className="cv-sponge__lane"
      data-row={y}
      data-col={x}
      data-lane={index}
      data-part={rate ? 'rate' : 'capacity'}
      data-changed={changed || undefined}
      data-selected={selected || undefined}
      data-in-column={inColumn || undefined}
      data-in-row={inRow || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      aria-selected={selected}
      style={{ ...gridArea(y + 1, x + 1), '--cv-sponge-level': laneLevel(hex) } as CSSProperties}
      onMouseEnter={() => onHover(index)}
      onFocus={() => onFocusLane({ x, y })}
    >
      {changed && <span key={step?.step} className="cv-sponge__flash" aria-hidden="true" />}
      <span className="cv-sponge__lanehead" aria-hidden="true">
        <span className="cv-sponge__coord">{t('view.sponge.coord', { x, y })}</span>
        {badges.map((badge) => (
          <span key={badge.kind} className="cv-sponge__badge" data-badge={badge.kind}>
            {t(badge.text, badge.params)}
          </span>
        ))}
        {changed && <span className="cv-sponge__dot">{'•'}</span>}
      </span>
      {showHex && <LaneHex lines={lines} />}
    </span>
  );
});

/** A lane's (or parity's) hex on its lines; decorative (the hex is in the accessible name). */
function LaneHex({ lines }: { lines: readonly string[] }) {
  return (
    <code className="cv-sponge__hex" aria-hidden="true">
      {lines.map((line, index) => (
        <span key={index} className="cv-sponge__hexline">
          {line}
        </span>
      ))}
    </code>
  );
}

interface LaneMarks {
  selected: boolean;
  inColumn: boolean;
  inRow: boolean;
  chiLetter: 'a' | 'b' | 'c' | undefined;
}

/** Which selection marks a lane carries in this phase (column for θ, row for χ, the lane otherwise). */
function laneMarks(facet: SpongeFacet, step: SpongeStep | undefined, index: number, selected: LanePosition): LaneMarks {
  const { x, y } = lanePosition(index, facet.width);
  const use = step === undefined ? 'none' : selectionUse(step.phase);
  const inRow = use === 'row' && y === selected.y;
  const offset = mod(x - selected.x, facet.width);
  const chiLetter = inRow && offset < 3 ? (['a', 'b', 'c'] as const)[offset] : undefined;
  return { selected: use === 'lane' && x === selected.x && y === selected.y, inColumn: use === 'column' && x === selected.x, inRow, chiLetter };
}

interface Badge {
  kind: string;
  text: string;
  spoken: string;
  params?: Record<string, string | number>;
}

/** The phase badges of one lane: ⊕ block, ≪ n, ← (x, y), a/b/c, ⊕ RC, → output. */
function laneBadges(facet: SpongeFacet, step: SpongeStep | undefined, index: number, chiLetter: LaneMarks['chiLetter']): Badge[] {
  if (step === undefined) return [];
  const rate = isRateLane(index, facet.rateLanes);
  const badge = (kind: string, params?: Badge['params']): Badge => ({ kind, text: `view.sponge.badge.${kind}`, spoken: `view.sponge.spoken.${kind}`, ...(params === undefined ? {} : { params }) });
  switch (step.phase) {
    case 'absorb':
      return rate ? [badge('absorb')] : [];
    case 'rho': {
      const offset = facet.rhoOffsets?.[index];
      return offset === undefined ? [] : [badge('rho', { n: offset, count: offset })];
    }
    case 'pi': {
      const source = piSourceOf(facet, index);
      return source === undefined ? [] : [badge('pi', { x: source.x, y: source.y })];
    }
    case 'chi':
      return chiLetter === undefined ? [] : [badge(`chi.${chiLetter}`)];
    case 'iota':
      return index === 0 ? [badge('iota')] : [];
    case 'squeeze':
    case 'output':
      return rate ? [badge('output')] : [];
    default:
      return [];
  }
}

/** π on wide panels: an arrow from each lane's source to the lane (the selected one bold); decorative. */
function PiArrows({ facet, selected }: { facet: SpongeFacet; selected: number }) {
  const markerId = useId();
  const centre = (position: LanePosition) => ({ x: `${((position.x + 0.5) / facet.width) * 100}%`, y: `${((position.y + 0.5) / facet.height) * 100}%` });
  return (
    <svg className="cv-sponge__arrows" aria-hidden="true" focusable="false">
      <defs>
        <marker id={markerId} className="cv-sponge__arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" />
        </marker>
      </defs>
      {range(facet.width * facet.height).map((index) => {
        const source = piSourceOf(facet, index);
        if (source === undefined || facet.piSource![index] === index) return null;
        const from = centre(source);
        const to = centre(lanePosition(index, facet.width));
        return <line key={index} className="cv-sponge__arrow" data-selected={index === selected || undefined} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={`url(#${markerId})`} />;
      })}
    </svg>
  );
}

/* ---------- θ: the C and D rows ---------- */

function ThetaRows({ facet, step, parts, selectedX }: { facet: SpongeFacet; step: SpongeStep; parts: LensParts; selectedX: number }) {
  const t = useT();
  const { left, right } = thetaNeighbours(selectedX, facet.width);
  const theta = step.theta!;
  /** C row: the selected column and its two neighbours; D row: the selected column only. */
  const markOf = (row: 'c' | 'd', x: number) => (x === selectedX ? 'selected' : row === 'd' ? undefined : x === left ? 'left' : x === right ? 'right' : undefined);
  return (
    <div className="cv-sponge__theta" role="group" aria-label={t('view.sponge.theta.rows')} style={{ '--cv-sponge-cols': facet.width } as CSSProperties}>
      {(['c', 'd'] as const).map((row) => (
        <div key={row} className="cv-sponge__thetarow" data-row={row}>
          <span className="cv-sponge__rowhead">{t(`view.sponge.theta.${row}Row`)}</span>
          {theta[row].map((hex, x) => {
            const mark = markOf(row, x);
            const neighbour = mark === 'left' || mark === 'right' ? mark : undefined;
            const lines = laneLines(hex);
            return (
              <span
                key={x}
                className="cv-sponge__parity"
                data-mark={mark}
                style={{ '--cv-sponge-level': laneLevel(hex) } as CSSProperties}
                aria-label={[t(`view.sponge.theta.${row}`, { x }), ...(neighbour === undefined ? [] : [t(`view.sponge.theta.${neighbour}`)]), ...(parts.hex ? [lines.join(' ')] : [])].join(', ')}
                role="img"
              >
                <span className="cv-sponge__coord" aria-hidden="true">
                  {t(`view.sponge.theta.${row}`, { x })}
                  {neighbour !== undefined && (
                    <span className="cv-sponge__badge" data-badge="neighbour">
                      {t(`view.sponge.theta.${neighbour}`)}
                    </span>
                  )}
                </span>
                {parts.hex && <LaneHex lines={lines} />}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- the detail line(s) under the grid ---------- */

interface PhaseDetailProps {
  facet: SpongeFacet;
  step: SpongeStep;
  before: string[] | undefined;
  parts: LensParts;
  selected: LanePosition;
}

function PhaseDetail({ facet, step, before, parts, selected }: PhaseDetailProps) {
  const t = useT();
  return (
    <div className="cv-sponge__detail">
      <p className="cv-sponge__what">{t(`view.sponge.what.${step.phase}`)}</p>
      <PhaseValues facet={facet} step={step} before={before} parts={parts} selected={selected} t={t} />
      {selectionUse(step.phase) !== 'none' && <p className="cv-sponge__hint">{t('view.sponge.selectHint')}</p>}
    </div>
  );
}

function PhaseValues({ facet, step, before, parts, selected, t }: PhaseDetailProps & { t: T }) {
  const index = laneIndex(selected.x, selected.y, facet.width);
  const lane = t('view.sponge.lane', { x: selected.x, y: selected.y });
  switch (step.phase) {
    case 'absorb':
      return isRateLane(index, facet.rateLanes) && step.input !== undefined ? (
        <Equation parts={parts} title={t('view.sponge.detail.absorb', { lane })} rows={[[t('view.sponge.term.before'), before?.[index]], [t('view.sponge.term.block'), step.input[index]], [t('view.sponge.term.after'), step.lanes[index]]]} />
      ) : (
        <p className="cv-sponge__selected">{t('view.sponge.detail.absorbCapacity', { lane })}</p>
      );
    case 'theta': {
      const { left, right } = thetaNeighbours(selected.x, facet.width);
      const theta = step.theta;
      return <Equation parts={parts} title={t('view.sponge.detail.theta', { x: selected.x, left, right })} rows={theta === undefined ? [] : [[t('view.sponge.theta.c', { x: left }), theta.c[left]], [t('view.sponge.theta.c', { x: right }), theta.c[right]], [t('view.sponge.theta.d', { x: selected.x }), theta.d[selected.x]]]} />;
    }
    case 'rho':
      return <Equation parts={parts} title={t('view.sponge.detail.rho', { lane, count: facet.rhoOffsets?.[index] ?? 0 })} rows={[[t('view.sponge.term.before'), before?.[index]], [t('view.sponge.term.after'), step.lanes[index]]]} />;
    case 'pi': {
      const source = piSourceOf(facet, index);
      if (source === undefined) return null;
      const stays = source.x === selected.x && source.y === selected.y;
      return <p className="cv-sponge__selected">{t(stays ? 'view.sponge.detail.piStays' : 'view.sponge.detail.pi', { lane, x: source.x, y: source.y })}</p>;
    }
    case 'chi':
      return <ChiDetail facet={facet} step={step} before={before} parts={parts} selected={selected} t={t} />;
    case 'iota':
      return <Equation parts={parts} title={t('view.sponge.detail.iota', { round: step.round ?? 0 })} rows={[[t('view.sponge.term.before'), before?.[0]], [t('view.sponge.term.rc'), step.iota?.rc], [t('view.sponge.term.after'), step.lanes[0]]]} />;
    case 'squeeze':
    case 'output':
      return step.output === undefined ? null : <OutputBytes facet={facet} output={step.output} parts={parts} selected={index} />;
    default:
      return null;
  }
}

function ChiDetail({ facet, before, parts, selected, t }: PhaseDetailProps & { t: T }) {
  if (before === undefined) return null;
  const terms = chiTerms(before, selected, facet.width);
  const [, b, c] = terms.lanes.map((lane) => lanePosition(lane, facet.width));
  return (
    <Equation
      parts={parts}
      title={t('view.sponge.detail.chi', { x: selected.x, y: selected.y, bx: b!.x, cx: c!.x })}
      rows={[[t('view.sponge.term.a'), terms.a], [t('view.sponge.term.b'), terms.b], [t('view.sponge.term.c'), terms.c], [t('view.sponge.term.notBAndC'), terms.notBAndC], [t('view.sponge.term.after'), terms.result]]}
    />
  );
}

/** A titled list of labelled lane values (hex only in the engineer and cryptographer lenses). */
function Equation({ title, rows, parts }: { title: string; rows: [string, string | undefined][]; parts: LensParts }) {
  return (
    <div className="cv-sponge__equation">
      <p className="cv-sponge__selected">
        <MathText text={title} />
      </p>
      {parts.hex && rows.length > 0 && (
        <dl className="cv-sponge__values">
          {rows.map(([label, hex]) => (
            <div key={label} className="cv-sponge__value">
              <dt>{label}</dt>
              <dd>
                <code>{hex === undefined ? '' : laneLines(hex).join(' ')}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** squeeze/output: the bytes read out, one group per lane, each tagged with the rate lane it came from. */
function OutputBytes({ facet, output, parts, selected }: { facet: SpongeFacet; output: string; parts: LensParts; selected: number }) {
  const t = useT();
  const groups = outputGroups(output, facet.laneBits, facet.rateLanes);
  return (
    <ScrollRegion className="cv-sponge__scroll cv-scroll-shadow" label={t('view.sponge.output.title')}>
      <p className="cv-sponge__selected">{t('view.sponge.output.title')}</p>
      <ol className="cv-sponge__output">
        {groups.map((group, index) => {
          const { x, y } = lanePosition(group.lane, facet.width);
          return (
            <li key={index} className="cv-sponge__group" data-selected={group.lane === selected || undefined} data-lane={group.lane}>
              <span className="cv-sponge__coord">{t('view.sponge.output.from', { x, y })}</span>
              {parts.hex ? <code className="cv-sponge__bytes">{group.bytes.join(' ')}</code> : <span className="cv-sponge__swatches" aria-hidden="true">{group.bytes.map((byte, byteIndex) => <Swatch key={byteIndex} hex={byte} />)}</span>}
            </li>
          );
        })}
      </ol>
      {parts.hex && <p className="cv-sponge__note">{t('view.sponge.output.endianness')}</p>}
    </ScrollRegion>
  );
}

function Swatch({ hex }: { hex: string }): ReactNode {
  return <span className="cv-sponge__swatch" style={{ '--cv-sponge-level': laneLevel(hex) } as CSSProperties} />;
}

/**
 * Explicit grid placement (0-based row and column, header row and column included): the π arrows
 * overlay the lane area, and auto-placement would flow the lanes around them.
 */
function gridArea(row: number, column: number): CSSProperties {
  return { gridRow: row + 1, gridColumn: column + 1 };
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}
