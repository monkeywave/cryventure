import { toHex, useT } from '@cryventure/viz';
import { CELL_HEIGHT, CELL_WIDTH, type FlyGeometry } from './flyGeometry.ts';
import { BLOCK_BYTES, WORD_BYTES, flyThroughFrame, type FlyRole, type FlyTarget, type FlyToken } from './flyThroughModel.ts';
import type { FlyView } from './useFlyThrough.ts';

const SLOTS = Array.from({ length: BLOCK_BYTES }, (_, index) => index);
const GROUPS = [0, 1, 2, 3];
const INDEX_GAP = 6;
const GROUP_LABEL_GAP = 14;

/** The key glyph (docs/PLAN.md §3): colour is never the only cue for a key byte. */
function KeyGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g className="cv-fly__glyph" transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle cx="5" cy="5" r="4.5" />
      <path d="M9 5h9v3M15 5v2.5" fill="none" />
    </g>
  );
}

function Slot({ x, y }: { x: number; y: number }) {
  return <rect className="cv-fly__slot" x={x} y={y} width={CELL_WIDTH} height={CELL_HEIGHT} rx="4" />;
}

function MatrixBackdrop({ geometry, role }: { geometry: FlyGeometry; role: FlyRole }) {
  const t = useT();
  const first = geometry.matrixCell(0);
  return (
    <g>
      {role === 'key' && <KeyGlyph x={first.x - 30} y={first.y + 9} />}
      <text className="cv-fly__label" x={geometry.width / 2} y={geometry.matrixLabelY} textAnchor="middle">
        {t(`ui.flyThrough.label.matrix.${role}`)}
      </text>
      {SLOTS.map((index) => (
        <Slot key={index} {...geometry.matrixCell(index)} />
      ))}
    </g>
  );
}

interface RowBackdropProps {
  geometry: FlyGeometry;
  row: 'register' | 'ram';
  title: string;
  indexLabel: (slot: number) => string;
}

/** A row of 16 slots (register or RAM) with its title and an index label above each slot. */
function RowBackdrop({ geometry, row, title, indexLabel }: RowBackdropProps) {
  return (
    <g>
      <text className="cv-fly__label" x={geometry.labelX} y={geometry[row].labelY}>
        {title}
      </text>
      {SLOTS.map((slot) => {
        const { x, y } = geometry.rowSlot(row, slot);
        return (
          <g key={slot}>
            <text className="cv-fly__index" x={x + CELL_WIDTH / 2} y={y - INDEX_GAP} textAnchor="middle">
              {indexLabel(slot)}
            </text>
            <Slot x={x} y={y} />
          </g>
        );
      })}
    </g>
  );
}

function groupLabel(target: FlyTarget, group: number): string {
  const first = group * WORD_BYTES;
  return target === 'rd_key' ? `rd_key[${group}]` : `out[${first}…${first + WORD_BYTES - 1}]`;
}

/** `rd_key[0..3]` (or `out[…]`) under each 4-byte group of the RAM row. */
function GroupLabels({ geometry, target }: { geometry: FlyGeometry; target: FlyTarget }) {
  return (
    <g>
      {GROUPS.map((group) => {
        const first = geometry.rowSlot('ram', group * WORD_BYTES);
        const last = geometry.rowSlot('ram', group * WORD_BYTES + WORD_BYTES - 1);
        return (
          <text key={group} className="cv-fly__group" x={(first.x + last.x + CELL_WIDTH) / 2} y={first.y + CELL_HEIGHT + GROUP_LABEL_GAP} textAnchor="middle">
            {groupLabel(target, group)}
          </text>
        );
      })}
    </g>
  );
}

function Token({ token }: { token: FlyToken }) {
  return (
    <g className="cv-fly__byte" data-byte={token.index} style={{ transform: `translate(${token.x}px, ${token.y}px)`, transitionDelay: `${token.index * 25}ms` }}>
      <rect width={CELL_WIDTH} height={CELL_HEIGHT} rx="4" />
      <circle className="cv-fly__mark" cx="5" cy="5" r="2.5" />
      <text x={CELL_WIDTH / 2} y={CELL_HEIGHT / 2} textAnchor="middle" dominantBaseline="central">
        {toHex(token.value)}
      </text>
    </g>
  );
}

function TokenLayer({ geometry, view, fade }: { geometry: FlyGeometry; view: FlyView; fade?: 'in' | 'out' }) {
  const frame = flyThroughFrame(geometry, view.beat, view.impl, view.target);
  return (
    <g className={fade === undefined ? 'cv-fly__tokens' : `cv-fly__tokens cv-fly__tokens--${fade}`} data-role={frame.role} aria-hidden={fade === 'out' ? true : undefined}>
      {frame.tokens.map((token) => (
        <Token key={token.index} token={token} />
      ))}
    </g>
  );
}

const viewKey = (view: FlyView) => `${view.beat}:${view.impl}:${view.target}`;

export interface FlyDiagramProps {
  geometry: FlyGeometry;
  view: FlyView;
  previous: FlyView | null;
  reducedMotion: boolean;
  /** Id of the element that describes the current beat (the caption). */
  describedBy: string;
}

/**
 * One SVG: matrix, `xmm0` lanes and RAM as fixed slots, with the 16 bytes on top. With motion the
 * bytes glide between slots (CSS transitions); with reduced motion the old layer fades out and the
 * new one fades in, at the same beats.
 */
export function FlyDiagram({ geometry, view, previous, reducedMotion, describedBy }: FlyDiagramProps) {
  const t = useT();
  const role = flyThroughFrame(geometry, view.beat, view.impl, view.target).role;
  return (
    <svg className="cv-fly__svg" viewBox={`0 0 ${geometry.width} ${geometry.height}`} data-layout={geometry.name} style={geometry.name === 'narrow' ? { minInlineSize: geometry.width } : undefined} role="img" aria-label={t('ui.flyThrough.diagramLabel')} aria-describedby={describedBy}>
      <MatrixBackdrop geometry={geometry} role={role} />
      <RowBackdrop geometry={geometry} row="register" title={t('ui.flyThrough.label.register')} indexLabel={String} />
      <RowBackdrop geometry={geometry} row="ram" title={t(`ui.flyThrough.label.ram.${view.target}`)} indexLabel={(offset) => `+${offset}`} />
      <GroupLabels geometry={geometry} target={view.target} />
      {reducedMotion ? (
        <>
          {previous !== null && <TokenLayer key={`out-${viewKey(previous)}`} geometry={geometry} view={previous} fade="out" />}
          <TokenLayer key={`in-${viewKey(view)}`} geometry={geometry} view={view} fade={previous === null ? undefined : 'in'} />
        </>
      ) : (
        <TokenLayer geometry={geometry} view={view} />
      )}
    </svg>
  );
}
