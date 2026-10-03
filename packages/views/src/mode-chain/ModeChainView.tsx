import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { chainActiveAt, type ChainFacet, type ChainNode, type Lens } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useLabActions, useLabLayout, useT, type ViewProps } from '@cryventure/viz';
import { centredScrollLeft, layoutChain, neighbour, readingOrder, spanOf, type ChainLayout, type EdgePath, type LayoutMetrics, type NodeBox } from './chainLayout.ts';
import { abbreviatedHex, groupLetter, groupsChangeStep, hexLines, labelSegments, nodeRole, plainLabel, sameGroups, sourceIds, spacedHex, type SameGroup } from './chainModel.ts';
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
 * scroller keeps the lane computed in this step centred.
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
  const { labHref } = useLabActions();
  if (node.zoom === undefined || labHref === undefined) return undefined;
  return labHref(node.zoom.producerId, node.zoom.params);
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
  tabbable: boolean;
  onFocusNode: (id: string) => void;
}

function useNodeAriaLabel({ box, status, lens, same, sameNames, sources }: Pick<NodeViewProps, 'box' | 'status' | 'lens' | 'same' | 'sameNames' | 'sources'>): string {
  const t = useT();
  const { node } = box;
  const label = plainLabel(t(node.label));
  const name = node.block < 0 ? label : t('view.mode-chain.nodeName', { label, n: node.block + 1 });
  const parts = [status === 'pending' ? t('view.mode-chain.nodePending', { name }) : lens === 'story' ? name : t('view.mode-chain.nodeValue', { name, hex: spacedHex(node.bytes) })];
  if (status === 'current') parts.push(t('view.mode-chain.nodeCurrent'));
  if (same !== undefined) parts.push(t('view.mode-chain.sameAs', { others: sameNames }));
  if (sources !== '') parts.push(t('view.mode-chain.from', { sources }));
  return parts.join(t('view.mode-chain.separator'));
}

const NodeView = memo(function NodeView(props: NodeViewProps) {
  const { box, facet, status, lens, compact, same, tabbable, onFocusNode } = props;
  const t = useT();
  const { node } = box;
  const href = useZoomHref(node);
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
      data-role={nodeRole(node, facet.direction)}
      data-status={status}
      data-same={same?.index}
      onFocus={() => onFocusNode(node.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) linkRef.current?.click();
      }}
    >
      <span className="cv-chain__label" aria-hidden="true">
        {status === 'current' && <span className="cv-chain__glyph">{CURRENT_GLYPH}</span>}
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
          {t('view.mode-chain.zoom', { n: node.block + 1 })}
        </a>
      )}
    </div>
  );
});

function EdgeView({ path, status, animate }: { path: EdgePath; status: NodeStatus; animate: boolean }) {
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
}

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

function LaneHeaders({ layout }: { layout: ChainLayout }) {
  const t = useT();
  return (
    <>
      {layout.lanes.map(({ lane, x, width }) => (
        <span key={lane} className="cv-chain__lane" style={{ left: x, width }} aria-hidden="true">
          {lane < 0 ? t('view.mode-chain.laneStart') : t('view.mode-chain.lane', { n: lane + 1 })}
        </span>
      ))}
    </>
  );
}

/** Roving tabindex over the nodes in reading order; arrow keys, Home and End move focus. */
function useRovingFocus(layout: ChainLayout) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabbableId = focusedId !== null && layout.boxById.has(focusedId) ? focusedId : readingOrder(layout.boxes)[0]?.node.id;
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
 * Keeps the nodes computed in this step centred in the scroller (instantly under reduced motion).
 * Only the scroller moves (scrollTo), never the page.
 */
function useCentredCurrentLane(layout: ChainLayout, step: number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const span = spanOf(layout.boxes.filter((box) => statusAt(box.node.activeAt, step) === 'current'));
  const left = span?.left;
  const right = span?.right;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || left === undefined || right === undefined) return;
    const target = centredScrollLeft({ left, right }, scroller.clientWidth, scroller.scrollWidth);
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    else scroller.scrollLeft = target;
  }, [left, right, reduceMotion]);
  return scrollerRef;
}

/** Screen-reader names of nodes: the label, plus the block where the label alone is ambiguous (⊕, E K). */
function useScreenNames(facet: ChainFacet): (id: string) => string {
  const t = useT();
  return useMemo(() => {
    const labels = new Map(facet.nodes.map((node) => [node.id, plainLabel(t(node.label))]));
    const counts = new Map<string, number>();
    for (const label of labels.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
    const names = new Map(
      facet.nodes.map((node) => {
        const label = labels.get(node.id) ?? '';
        const ambiguous = (counts.get(label) ?? 0) > 1 && node.block >= 0;
        return [node.id, ambiguous ? t('view.mode-chain.nodeName', { label, n: node.block + 1 }) : label];
      }),
    );
    return (id: string) => names.get(id) ?? '';
  }, [facet, t]);
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

function Legend({ hasSame }: { hasSame: boolean }) {
  const t = useT();
  return (
    <p className="cv-chain__legend">
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
  const { labHref } = useLabActions();
  const metrics = useMetrics(lens, narrow, labHref !== undefined);
  const layout = useMemo(() => layoutChain(facet, metrics), [facet, metrics]);
  // Groups change only when an input/output block gets its value: memoised on that step, they stay
  // the same objects across the steps in between, so the memoised nodes skip re-rendering.
  const groupsStep = groupsChangeStep(facet, step);
  const groups = useMemo(() => sameGroups(facet, chainActiveAt(facet, groupsStep).nodes), [facet, groupsStep]);
  const { canvasRef, tabbableId, focusedId, setFocusedId, onKeyDown } = useRovingFocus(layout);
  const scrollerRef = useCentredCurrentLane(layout, step);
  const screenName = useScreenNames(facet);
  const sourcesOf = (id: string) => sourceIds(facet, id).map(screenName).join(t('view.mode-chain.sourceSeparator'));
  const namesOf = (group: SameGroup | undefined, self: string) =>
    (group?.ids ?? [])
      .filter((id) => id !== self)
      .map((id) => layout.boxById.get(id)?.node)
      .map((node) => (node === undefined ? '' : plainLabel(t(node.label))))
      .join(t('view.mode-chain.separator'));
  return (
    <section className="cv-view cv-chain" aria-label={t('view.mode-chain.title')} data-lens={lens}>
      {lens === 'cryptographer' && (
        <p className="cv-chain__formula" aria-label={t('view.mode-chain.formula', { formula: plainLabel(t(facet.formula)) })}>
          <Label text={t(facet.formula)} blockIndices={false} />
        </p>
      )}
      <div ref={scrollerRef} className="cv-chain__scroll cv-scroll-shadow">
        <div
          ref={canvasRef}
          role="group"
          aria-label={t('view.mode-chain.diagram', { count: layout.lanes.filter(({ lane }) => lane >= 0).length })}
          className="cv-chain__canvas"
          style={{ width: layout.width, height: layout.height }}
          onKeyDown={onKeyDown}
        >
          <LaneHeaders layout={layout} />
          <Edges layout={layout} step={step} />
          {readingOrder(layout.boxes).map((box) => {
            const same = groups.get(box.node.id);
            return (
              <NodeView
                key={box.node.id}
                box={box}
                facet={facet}
                status={statusAt(box.node.activeAt, step)}
                lens={lens}
                compact={narrow}
                same={same}
                sameNames={namesOf(same, box.node.id)}
                sources={sourcesOf(box.node.id)}
                tabbable={box.node.id === tabbableId}
                onFocusNode={setFocusedId}
              />
            );
          })}
        </div>
      </div>
      {lens !== 'story' && <Readout facet={facet} id={focusedId} step={step} />}
      <Legend hasSame={groups.size > 0} />
    </section>
  );
}

/** Lanes per block of a block-cipher mode, following the playhead. */
export default function ModeChainView({ lens }: ViewProps) {
  const facet = useFacet<ChainFacet>('chain');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <ModeChain facet={facet.data} lens={lens} />;
}

