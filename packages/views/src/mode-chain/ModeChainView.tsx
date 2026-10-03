import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { chainActiveNodesAt, type ChainFacet, type ChainNode, type Lens, type Translate } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useLabActions, useLabLayout, useT, type ViewProps } from '@cryventure/viz';
import { centredScrollLeft, fittedHeight, laneSpanOf, laneStartScrollLeft, layoutChain, neighbour, spanOf, type ChainLayout, type EdgePath, type LayoutMetrics, type NodeBox, type Span } from './chainLayout.ts';
import {
  abbreviatedHex,
  GCM_ROLE_GLYPHS,
  gcmRolesOf,
  groupLetter,
  groupsChangeStep,
  hashLanes,
  hexLines,
  isGcmRole,
  labelSegments,
  nodeRole,
  plainLabel,
  sameGroups,
  sourceIds,
  spacedHex,
  type GcmRole,
  type SameGroup,
} from './chainModel.ts';
import './modeChain.css';

/**
 * Block-mode dataflow (`chain` facet): one lane per block (lane −1, the IV or padding, on the left),
 * stages top → bottom. Nodes get their value at `activeAt` (pending ones stay visible, dashed and
 * dimmed; the current step's carry ▸ and a heavy border), edges draw themselves in when they become
 * active (Motion; instant under reduced motion). Equal input/output blocks share a ≡ letter and
 * pattern (ECB's leak). Story lens: labels only; engineer: hex; cryptographer: also the formula and
 * subscripted block indices. Cipher nodes link into the block cipher's own lab when the host can
 * build such links (Enter on the node follows it). Nodes use a roving tabindex (arrow keys, Home/End);
 * each node's accessible name says where its inputs come from, since the edges are drawn only. The
 * scroller keeps the lane computed in this step in view (GCM: from the lane's start, and only as tall
 * as the lanes in view need). GCM (docs/M4.md §3f): AAD, the GHASH
 * accumulator, the length block and the tag get their own role colour, border and glyph (◇✓ ⊗ ‖ ✓,
 * also said in words and listed in the legend); the GHASH lane is headed as such, not as a block.
 */
const STATUS_KEYS = { loading: 'view.mode-chain.loading', missing: 'view.mode-chain.missing' } as const;

const CURRENT_GLYPH = '▸';
const SAME_GLYPH = '≡';
const PENDING_TEXT = '· · ·';
const NODE_WIDTH = { wide: 152, compact: 112 } as const;
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const DRAW_TRANSITION = { duration: 0.45, ease: 'easeOut' } as const;

type NodeStatus = 'pending' | 'active' | 'current';

/** Initial values (activeAt −1) are given, never "computed in this step". */
const statusAt = (activeAt: number, step: number): NodeStatus => (activeAt > step ? 'pending' : activeAt === step && step >= 0 ? 'current' : 'active');

function Label({ text, blockIndices }: { text: string; blockIndices: boolean }) {
  return (
    <span>
      {labelSegments(text, blockIndices).map((segment, index) => (segment.sub ? <sub key={index}>{segment.text}</sub> : <span key={index}>{segment.text}</span>))}
    </span>
  );
}

/** "Zoom into block n" for a cipher node, when it zooms and the host builds lab links. */
function useZoomHref(node: ChainNode): string | undefined {
  const { blockLabHref } = useLabActions();
  if (node.zoom === undefined || blockLabHref === undefined) return undefined;
  return blockLabHref(node.zoom.producerId, node.zoom.keyHex, node.zoom.blockHex);
}

interface NodeViewProps {
  box: NodeBox;
  facet: ChainFacet;
  status: NodeStatus;
  lens: Lens;
  compact: boolean;
  same: SameGroup | undefined;
  sameNames: string;
  /** Screen names of the nodes feeding this one, joined ('' for none). */
  sources: string;
  /** In GCM's GHASH lane: named by that lane, not by a block number. */
  inHashLane: boolean;
  tabbable: boolean;
  onFocusNode: (id: string) => void;
}

/** A node's screen name: its label, plus the block it belongs to (not for lane −1 or the GHASH lane). */
function nodeScreenName(t: Translate, node: ChainNode, label: string, inHashLane: boolean): string {
  if (inHashLane) return t('view.mode-chain.nodeNameHash', { label });
  return node.block < 0 ? label : t('view.mode-chain.nodeName', { label, n: node.block + 1 });
}

function useNodeAriaLabel({ box, facet, status, lens, same, sameNames, sources, inHashLane }: Pick<NodeViewProps, 'box' | 'facet' | 'status' | 'lens' | 'same' | 'sameNames' | 'sources' | 'inHashLane'>): string {
  const t = useT();
  const { node } = box;
  const name = nodeScreenName(t, node, plainLabel(t(node.label)), inHashLane);
  const parts = [status === 'pending' ? t('view.mode-chain.nodePending', { name }) : lens === 'story' ? name : t('view.mode-chain.nodeValue', { name, hex: spacedHex(node.bytes) })];
  const role = nodeRole(node, facet.direction);
  if (isGcmRole(role)) parts.push(t(`view.mode-chain.role.${role}`));
  if (status === 'current') parts.push(t('view.mode-chain.nodeCurrent'));
  if (same !== undefined) parts.push(t('view.mode-chain.sameAs', { others: sameNames }));
  if (sources !== '') parts.push(t('view.mode-chain.from', { sources }));
  return parts.join(t('view.mode-chain.separator'));
}

const NodeView = memo(function NodeView(props: NodeViewProps) {
  const { box, facet, status, lens, compact, same, tabbable, onFocusNode, inHashLane } = props;
  const t = useT();
  const { node } = box;
  const href = useZoomHref(node);
  const role = nodeRole(node, facet.direction);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const label = t(node.label);
  const showHex = lens !== 'story';
  const lines = status === 'pending' ? [PENDING_TEXT] : compact ? [abbreviatedHex(node.bytes)] : hexLines(node.bytes);
  return (
    <div
      role="group"
      className="cv-chain__node"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      tabIndex={tabbable ? 0 : -1}
      aria-label={useNodeAriaLabel(props)}
      title={showHex && status !== 'pending' ? `${plainLabel(label)}: ${spacedHex(node.bytes)}` : undefined}
      data-node={node.id}
      data-kind={node.kind}
      data-role={role}
      data-status={status}
      data-same={same?.index}
      onFocus={() => onFocusNode(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) linkRef.current?.click();
      }}
    >
      <span className="cv-chain__label" aria-hidden="true">
        {status === 'current' && <span className="cv-chain__glyph">{CURRENT_GLYPH}</span>}
        {isGcmRole(role) && <span className="cv-chain__role-glyph">{GCM_ROLE_GLYPHS[role]}</span>}
        <Label text={label} blockIndices={lens === 'cryptographer'} />
        {same !== undefined && (
          <span className="cv-chain__same">
            {SAME_GLYPH}
            {groupLetter(same.index)}
          </span>
        )}
      </span>
      {showHex && (
        <span className="cv-chain__hex" aria-hidden="true">
          {lines.map((line, index) => (
            <span key={index}>{line}</span>
          ))}
        </span>
      )}
      {href !== undefined && (
        <a ref={linkRef} className="cv-chain__zoom" href={href} tabIndex={tabbable ? 0 : -1}>
          {node.block < 0 || inHashLane ? t('view.mode-chain.zoomCipher') : t('view.mode-chain.zoom', { n: node.block + 1 })}
        </a>
      )}
    </div>
  );
});

/** One edge; primitive props besides the stable path, so only edges whose status changes re-render on a step. */
const EdgeView = memo(function EdgeView({ path, status, animate }: { path: EdgePath; status: NodeStatus; animate: boolean }) {
  const pending = status === 'pending';
  return (
    <m.path
      key={pending ? 'pending' : 'drawn'}
      className="cv-chain__edge"
      data-edge={path.key}
      data-status={status}
      d={path.d}
      markerEnd={`url(#${pending ? 'cv-chain-arrow-pending' : 'cv-chain-arrow'})`}
      initial={pending || !animate ? false : { pathLength: 0 }}
      animate={pending ? undefined : { pathLength: 1 }}
      transition={DRAW_TRANSITION}
    />
  );
});

/** True after the first commit: edges active on arrival appear drawn, later ones draw themselves in. */
function useHasMounted(): boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  // Intentional (as in viz ByteCell): only the first render reads a stale `false`; every step change
  // re-renders the edges, and an edge that becomes active remounts its keyed path.
  // eslint-disable-next-line react-hooks/refs
  return mounted.current;
}

function Edges({ layout, step }: { layout: ChainLayout; step: number }) {
  const reduceMotion = useReducedMotion() ?? false;
  const animate = useHasMounted() && !reduceMotion;
  return (
    <svg className="cv-chain__edges" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false">
      <defs>
        <marker id="cv-chain-arrow" className="cv-chain__arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
        <marker id="cv-chain-arrow-pending" className="cv-chain__arrow" data-status="pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      {layout.edges.map((path) => (
        <EdgeView key={path.key} path={path} status={statusAt(path.edge.activeAt, step)} animate={animate} />
      ))}
    </svg>
  );
}

function laneTitle(t: Translate, lane: number, hash: ReadonlySet<number>): string {
  if (lane < 0) return t('view.mode-chain.laneStart');
  return hash.has(lane) ? t('view.mode-chain.laneHash') : t('view.mode-chain.lane', { n: lane + 1 });
}

function LaneHeaders({ layout, hash }: { layout: ChainLayout; hash: ReadonlySet<number> }) {
  const t = useT();
  return (
    <>
      {layout.lanes.map(({ lane, x, width }) => (
        <span key={lane} className="cv-chain__lane" style={{ left: x, width }} data-hash={hash.has(lane) || undefined} aria-hidden="true">
          {laneTitle(t, lane, hash)}
        </span>
      ))}
    </>
  );
}

/** Roving tabindex over the nodes in reading order; arrow keys, Home and End move focus. */
function useRovingFocus(layout: ChainLayout) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabbableId = focusedId !== null && layout.boxById.has(focusedId) ? focusedId : layout.boxes[0]?.node.id;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAVIGATION_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const from = tabbableId === undefined ? undefined : layout.boxById.get(tabbableId);
    if (from === undefined || !(event.target instanceof HTMLElement) || event.target.dataset['node'] === undefined) return;
    event.preventDefault();
    const next = neighbour(layout.boxes, from, event.key);
    if (next === undefined) return;
    setFocusedId(next.node.id);
    canvasRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(next.node.id)}"]`)?.focus();
  };
  return { canvasRef, tabbableId, focusedId, setFocusedId, onKeyDown };
}

function useMetrics(lens: Lens, compact: boolean, hasLinks: boolean): LayoutMetrics {
  return useMemo(
    () => ({
      nodeWidth: compact ? NODE_WIDTH.compact : NODE_WIDTH.wide,
      hexLines: (node: ChainNode) => (lens === 'story' ? 0 : compact ? 1 : hexLines(node.bytes).length),
      hasLink: (node: ChainNode) => hasLinks && node.zoom !== undefined,
    }),
    [lens, compact, hasLinks],
  );
}

/**
 * Keeps the nodes computed in this step in view (instantly under reduced motion): centred for the
 * classic modes; with `laneStart` (GCM's wide lanes) their lane is shown from its start, so no node
 * on its left is cut in half. Only the scroller moves (scrollTo), never the page.
 */
function useCurrentLaneInView(layout: ChainLayout, step: number, laneStart: boolean) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const current = layout.boxes.filter((box) => statusAt(box.node.activeAt, step) === 'current');
  const span = laneStart ? laneSpanOf(layout, current) : spanOf(current);
  const left = span?.left;
  const right = span?.right;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || left === undefined || right === undefined) return;
    const scrollLeftOf = laneStart ? laneStartScrollLeft : centredScrollLeft;
    const target = scrollLeftOf({ left, right }, scroller.clientWidth, scroller.scrollWidth);
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    else scroller.scrollLeft = target;
  }, [left, right, reduceMotion, laneStart]);
  return scrollerRef;
}

/**
 * The canvas height for what the scroller shows: with `fit` (GCM, whose GHASH lane runs far deeper
 * than the block lanes) only as tall as the lanes in view need, re-measured on scroll and resize;
 * otherwise (and before the first measurement) the full layout height.
 */
function useFittedHeight(scrollerRef: RefObject<HTMLDivElement | null>, layout: ChainLayout, fit: boolean): number {
  const [view, setView] = useState<Span | undefined>(undefined);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!fit || scroller === null) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (scroller.clientWidth > 0) setView({ left: scroller.scrollLeft, right: scroller.scrollLeft + scroller.clientWidth });
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : undefined;
    resize?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      resize?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scrollerRef, fit]);
  return fit && view !== undefined ? fittedHeight(layout, view) : layout.height;
}

/** Screen-reader names of nodes: the label, plus the block (or GHASH lane) where the label alone is ambiguous (⊕, E K). */
function screenNames(facet: ChainFacet, labels: ReadonlyMap<string, string>, t: Translate, hash: ReadonlySet<number>): Map<string, string> {
  const counts = new Map<string, number>();
  for (const label of labels.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
  return new Map(
    facet.nodes.map((node) => {
      const label = labels.get(node.id) ?? '';
      const ambiguous = (counts.get(label) ?? 0) > 1 && node.block >= 0;
      return [node.id, ambiguous ? nodeScreenName(t, node, label, hash.has(node.block)) : label];
    }),
  );
}

/**
 * Per node id, the parts of its accessible name the drawing alone shows: the screen names of the
 * nodes feeding it, and the labels of the other members of its ≡ group (memoised per facet and
 * language, the group names per group change).
 */
function useNodeRelations(facet: ChainFacet, groups: ReadonlyMap<string, SameGroup>, hash: ReadonlySet<number>): { sources: Map<string, string>; sameNames: Map<string, string> } {
  const t = useT();
  const labels = useMemo(() => new Map(facet.nodes.map((node) => [node.id, plainLabel(t(node.label))])), [facet, t]);
  const sources = useMemo(() => {
    const names = screenNames(facet, labels, t, hash);
    const separator = t('view.mode-chain.sourceSeparator');
    return new Map(facet.nodes.map((node) => [node.id, sourceIds(facet, node.id).map((id) => names.get(id) ?? '').join(separator)]));
  }, [facet, labels, t, hash]);
  const sameNames = useMemo(() => {
    const separator = t('view.mode-chain.separator');
    return new Map([...groups].map(([self, group]) => [self, group.ids.filter((id) => id !== self).map((id) => labels.get(id) ?? '').join(separator)]));
  }, [groups, labels, t]);
  return { sources, sameNames };
}

/** The full hex of the focused node, below the diagram (abbreviated values stay readable). */
function Readout({ facet, id, step }: { facet: ChainFacet; id: string | null; step: number }) {
  const t = useT();
  const node = id === null ? undefined : facet.nodes.find((candidate) => candidate.id === id);
  const pending = node !== undefined && statusAt(node.activeAt, step) === 'pending';
  return (
    <p className="cv-chain__readout">
      {node === undefined ? (
        t('view.mode-chain.hint')
      ) : (
        <>
          <span className="cv-chain__readout-label">{plainLabel(t(node.label))}</span> {pending ? t('view.mode-chain.readoutPending') : <code>{spacedHex(node.bytes)}</code>}
        </>
      )}
    </p>
  );
}

function Legend({ hasSame, roles }: { hasSame: boolean; roles: readonly GcmRole[] }) {
  const t = useT();
  return (
    <p className="cv-chain__legend">
      {roles.map((role) => (
        <span key={role} data-role={role}>
          <span className="cv-chain__role-glyph" aria-hidden="true">
            {GCM_ROLE_GLYPHS[role]}
          </span>
          {t(`view.mode-chain.role.${role}`)}
        </span>
      ))}
      <span>
        <span aria-hidden="true">{CURRENT_GLYPH} </span>
        {t('view.mode-chain.legendCurrent')}
      </span>
      <span data-pending="">{t('view.mode-chain.legendPending')}</span>
      {hasSame && (
        <span data-same="">
          <span aria-hidden="true">{SAME_GLYPH} </span>
          {t('view.mode-chain.legendSame')}
        </span>
      )}
    </p>
  );
}

function ModeChain({ facet, lens }: { facet: ChainFacet; lens: Lens }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const { narrow } = useLabLayout();
  const { blockLabHref } = useLabActions();
  const metrics = useMetrics(lens, narrow, blockLabHref !== undefined);
  const layout = useMemo(() => layoutChain(facet, metrics), [facet, metrics]);
  // Groups change only when an input/output block gets its value: memoised on that step, they stay
  // the same objects across the steps in between, so the memoised nodes skip re-rendering.
  const groupsStep = groupsChangeStep(facet, step);
  const groups = useMemo(() => sameGroups(facet, chainActiveNodesAt(facet, groupsStep)), [facet, groupsStep]);
  const { canvasRef, tabbableId, focusedId, setFocusedId, onKeyDown } = useRovingFocus(layout);
  const hash = useMemo(() => hashLanes(facet), [facet]);
  const scrollerRef = useCurrentLaneInView(layout, step, hash.size > 0);
  const canvasHeight = useFittedHeight(scrollerRef, layout, hash.size > 0);
  const roles = useMemo(() => gcmRolesOf(facet), [facet]);
  const { sources, sameNames } = useNodeRelations(facet, groups, hash);
  const blockLanes = layout.lanes.filter(({ lane }) => lane >= 0 && !hash.has(lane)).length;
  return (
    <section className="cv-view cv-chain" aria-label={t('view.mode-chain.title')} data-lens={lens}>
      {lens === 'cryptographer' && (
        <p className="cv-chain__formula" aria-label={t('view.mode-chain.formula', { formula: plainLabel(t(facet.formula)) })}>
          <Label text={t(facet.formula)} blockIndices={false} />
        </p>
      )}
      <div ref={scrollerRef} className="cv-chain__scroll cv-scroll-shadow" data-fitted={hash.size > 0 ? '' : undefined}>
        <div
          ref={canvasRef}
          role="group"
          aria-label={t(hash.size > 0 ? 'view.mode-chain.diagramHash' : 'view.mode-chain.diagram', { count: blockLanes })}
          className="cv-chain__canvas"
          style={{ width: layout.width, height: canvasHeight }}
          onKeyDown={onKeyDown}
        >
          <LaneHeaders layout={layout} hash={hash} />
          <Edges layout={layout} step={step} />
          {layout.boxes.map((box) => (
            <NodeView
              key={box.node.id}
              box={box}
              facet={facet}
              status={statusAt(box.node.activeAt, step)}
              lens={lens}
              compact={narrow}
              same={groups.get(box.node.id)}
              sameNames={sameNames.get(box.node.id) ?? ''}
              sources={sources.get(box.node.id) ?? ''}
              tabbable={box.node.id === tabbableId}
              onFocusNode={setFocusedId}
              inHashLane={hash.has(box.node.block)}
            />
          ))}
        </div>
      </div>
      {lens !== 'story' && <Readout facet={facet} id={focusedId} step={step} />}
      <Legend hasSame={groups.size > 0} roles={roles} />
    </section>
  );
}

/** Lanes per block of a block-cipher mode, following the playhead. */
export default function ModeChainView({ lens }: ViewProps) {
  const facet = useFacet<ChainFacet>('chain');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <ModeChain facet={facet.data} lens={lens} />;
}

