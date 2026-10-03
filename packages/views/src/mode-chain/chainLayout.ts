import { chainEdgeKey, chainLanes, type ChainEdge, type ChainFacet, type ChainNode } from '@cryventure/core';

/**
 * Pure geometry of the mode-chain diagram (px): one column ("lane") per block, lane −1 (IV, padding)
 * on the left; stages top → bottom by in-lane dataflow depth. No React, no i18n.
 */

export interface LayoutMetrics {
  nodeWidth: number;
  /** Text lines of hex a node shows (0 = labels only). */
  hexLines: (node: ChainNode) => number;
  /** Whether a node carries the zoom link (adds a line). */
  hasLink: (node: ChainNode) => boolean;
}

export interface NodeBox {
  node: ChainNode;
  lane: number;
  /** Index of the lane's column (lane −1 is column 0 when present). */
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgePath {
  key: string;
  edge: ChainEdge;
  d: string;
}

export interface LaneHeader {
  lane: number;
  x: number;
  width: number;
}

export interface ChainLayout {
  width: number;
  height: number;
  /** In reading order (`readingOrder`): focus order and render order. */
  boxes: NodeBox[];
  boxById: Map<string, NodeBox>;
  edges: EdgePath[];
  lanes: LaneHeader[];
}

export const GEOMETRY = {
  marginX: 12,
  /** Lane headers sit above the bus, the bus above the first row. */
  headerHeight: 20,
  busY: 30,
  top: 42,
  bottom: 12,
  laneGap: 44,
  slotGap: 8,
  rowGap: 34,
  /** Label line plus padding and borders. */
  baseHeight: 30,
  hexLineHeight: 16,
  linkHeight: 30,
} as const;

function sameLaneEdges(facet: ChainFacet, nodeById: Map<string, ChainNode>): ChainEdge[] {
  return facet.edges.filter((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    return from !== undefined && to !== undefined && from.block === to.block;
  });
}

/** Longest in-lane path from a lane source; edges respect causal order, so a fixpoint loop terminates. */
function inLaneDepths(nodes: readonly ChainNode[], edges: readonly ChainEdge[]): Map<string, number> {
  const depth = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const { from, to } of edges) {
      const candidate = (depth.get(from) ?? 0) + 1;
      if (candidate > (depth.get(to) ?? 0)) {
        depth.set(to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

/**
 * Row (stage) per node: in-lane depth; an in-lane source sits right above its first target
 * (CTR: Pᵢ beside the keystream, above ⊕); lane −1 nodes share the row of their first target
 * (GCM's IV sits beside J0).
 */
export function chainRows(facet: ChainFacet): Map<string, number> {
  const nodeById = new Map(facet.nodes.map((node) => [node.id, node]));
  const laneEdges = sameLaneEdges(facet, nodeById);
  const depth = inLaneDepths(facet.nodes, laneEdges);
  const rows = new Map(depth);
  const hasInLaneSource = new Set(laneEdges.map((edge) => edge.to));
  for (const node of facet.nodes) {
    if (node.block < 0 || hasInLaneSource.has(node.id)) continue;
    const targets = laneEdges.filter((edge) => edge.from === node.id).map((edge) => depth.get(edge.to) ?? 0);
    if (targets.length > 0) rows.set(node.id, Math.max(0, Math.min(...targets) - 1));
  }
  // Sinks first, so a lane −1 source (GCM's IV → J0) sees its lane −1 target's final row.
  for (const node of [...facet.nodes].reverse()) {
    if (node.block >= 0) continue;
    const targets = facet.edges.filter((edge) => edge.from === node.id).map((edge) => rows.get(edge.to) ?? 0);
    rows.set(node.id, targets.length > 0 ? Math.min(...targets) : 0);
  }
  return rows;
}

/** Nodes per (lane, row) cell, in facet order. */
function cellsOf(facet: ChainFacet, rows: Map<string, number>): Map<string, ChainNode[]> {
  const cells = new Map<string, ChainNode[]>();
  for (const node of facet.nodes) {
    const key = `${node.block}:${rows.get(node.id) ?? 0}`;
    cells.set(key, [...(cells.get(key) ?? []), node]);
  }
  return cells;
}

function rowHeights(facet: ChainFacet, rows: Map<string, number>, metrics: LayoutMetrics): number[] {
  const heights: number[] = [];
  for (const node of facet.nodes) {
    const row = rows.get(node.id) ?? 0;
    const height = GEOMETRY.baseHeight + metrics.hexLines(node) * GEOMETRY.hexLineHeight + (metrics.hasLink(node) ? GEOMETRY.linkHeight : 0);
    heights[row] = Math.max(heights[row] ?? 0, height);
  }
  return Array.from(heights, (height) => height ?? GEOMETRY.baseHeight);
}

function prefixOffsets(sizes: readonly number[], start: number, gap: number): number[] {
  const offsets: number[] = [];
  let cursor = start;
  for (const size of sizes) {
    offsets.push(cursor);
    cursor += size + gap;
  }
  return offsets;
}

function boxesOf(facet: ChainFacet, metrics: LayoutMetrics) {
  const rows = chainRows(facet);
  const cells = cellsOf(facet, rows);
  const slots = Math.max(1, ...[...cells.values()].map((cell) => cell.length));
  const laneWidth = slots * metrics.nodeWidth + (slots - 1) * GEOMETRY.slotGap;
  const lanes = chainLanes(facet);
  const laneX = prefixOffsets(lanes.map(() => laneWidth), GEOMETRY.marginX, GEOMETRY.laneGap);
  const heights = rowHeights(facet, rows, metrics);
  const rowY = prefixOffsets(heights, GEOMETRY.top, GEOMETRY.rowGap);
  const boxes: NodeBox[] = [];
  for (const cell of cells.values()) {
    const cellWidth = cell.length * metrics.nodeWidth + (cell.length - 1) * GEOMETRY.slotGap;
    cell.forEach((node, slot) => {
      const column = lanes.indexOf(node.block);
      const row = rows.get(node.id) ?? 0;
      const x = (laneX[column] ?? 0) + (laneWidth - cellWidth) / 2 + slot * (metrics.nodeWidth + GEOMETRY.slotGap);
      boxes.push({ node, lane: node.block, column, row, x, y: rowY[row] ?? 0, width: metrics.nodeWidth, height: heights[row] ?? 0 });
    });
  }
  const width = (laneX.at(-1) ?? 0) + laneWidth + GEOMETRY.marginX;
  const height = (rowY.at(-1) ?? 0) + (heights.at(-1) ?? 0) + GEOMETRY.bottom;
  const headers = lanes.map((lane, column) => ({ lane, x: laneX[column] ?? 0, width: laneWidth }));
  return { boxes, width, height, headers };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Share of a target's width where gutter edges enter its top: setup values (lane −1) outermost, then other lanes. */
const GUTTER_ENTRY = { setup: 0.15, lane: 0.35 } as const;
/** Setup edges run this far further out in the lane gap than edges from other lanes, so the two never overlap. */
const GUTTER_SPLIT = 8;

/**
 * x of the lane gap a gutter edge runs down in: beside `target`'s lane (`targetLane`), on the side
 * facing the source; setup edges (lane −1) run further out.
 */
export function gutterX(source: NodeBox, target: NodeBox, targetLane: Pick<LaneHeader, 'x' | 'width'>): number {
  const rightward = target.column > source.column;
  const split = source.lane < 0 ? GUTTER_SPLIT : -GUTTER_SPLIT;
  return rightward ? targetLane.x - GEOMETRY.laneGap / 2 - split : targetLane.x + targetLane.width + GEOMETRY.laneGap / 2 + split;
}

/**
 * Orthogonal path through the empty gaps only (GCM: Cᵢ and H into the GHASH lane): down into the row
 * gap below the source, along it to the lane gap beside the target, along that to the row gap above
 * the target, then into the target's top, left (or right) of centre so in-lane edges keep the centre.
 */
function gutterPathData(source: NodeBox, target: NodeBox, gutter: number): string {
  const sx = source.x + source.width / 2;
  const below = source.y + source.height + GEOMETRY.rowGap / 2;
  const above = target.y - GEOMETRY.rowGap / 2;
  const share = source.lane < 0 ? GUTTER_ENTRY.setup : GUTTER_ENTRY.lane;
  const tx = target.x + target.width * (target.column > source.column ? share : 1 - share);
  return `M${round(sx)} ${round(source.y + source.height)} V${round(below)} H${round(gutter)} V${round(above)} H${round(tx)} V${round(target.y)}`;
}

/**
 * SVG path of an edge: down within a lane, sideways between adjacent lanes, over the bus across
 * non-adjacent lanes in the first row, and through the row and lane gaps (`gutter`, the x of the lane
 * gap beside the target) across non-adjacent lanes otherwise.
 */
export function edgePathData(source: NodeBox, target: NodeBox, gutter?: number): string {
  const sx = source.x + source.width / 2;
  const tx = target.x + target.width / 2;
  if (source.column === target.column) {
    const sy = source.y + source.height;
    const ty = target.y;
    const mid = (ty - sy) / 2;
    return `M${round(sx)} ${round(sy)} C${round(sx)} ${round(sy + mid)} ${round(tx)} ${round(ty - mid)} ${round(tx)} ${round(ty)}`;
  }
  const distant = Math.abs(source.column - target.column) > 1;
  if (distant && source.row === target.row && (source.row === 0 || gutter === undefined)) {
    return `M${round(sx)} ${round(source.y)} V${GEOMETRY.busY} H${round(tx)} V${round(target.y)}`;
  }
  if (distant && gutter !== undefined) return gutterPathData(source, target, gutter);
  const rightward = target.column > source.column;
  const fromX = rightward ? source.x + source.width : source.x;
  const toX = rightward ? target.x : target.x + target.width;
  const fromY = source.y + source.height / 2;
  const toY = target.y + target.height / 2;
  const mid = (toX - fromX) / 2;
  return `M${round(fromX)} ${round(fromY)} C${round(fromX + mid)} ${round(fromY)} ${round(toX - mid)} ${round(toY)} ${round(toX)} ${round(toY)}`;
}

/** The whole diagram's geometry for `facet` under `metrics`. */
export function layoutChain(facet: ChainFacet, metrics: LayoutMetrics): ChainLayout {
  const placed = boxesOf(facet, metrics);
  const { width, height, headers } = placed;
  const boxes = readingOrder(placed.boxes);
  const boxById = new Map(boxes.map((box) => [box.node.id, box]));
  const edges = facet.edges.flatMap((edge) => {
    const source = boxById.get(edge.from);
    const target = boxById.get(edge.to);
    if (source === undefined || target === undefined) return [];
    const targetLane = headers[target.column];
    const gutter = targetLane === undefined ? undefined : gutterX(source, target, targetLane);
    return [{ key: chainEdgeKey(edge), edge, d: edgePathData(source, target, gutter) }];
  });
  return { width, height, boxes, boxById, edges, lanes: headers };
}

/** Focus order: lane by lane (left → right), top → bottom within a lane. */
export function readingOrder(boxes: readonly NodeBox[]): NodeBox[] {
  return [...boxes].sort((a, b) => a.column - b.column || a.row - b.row || a.x - b.x);
}

const distance = (a: NodeBox, b: NodeBox) => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(candidates: readonly NodeBox[], from: NodeBox): NodeBox | undefined {
  return [...candidates].sort((a, b) => distance(a, from) - distance(b, from))[0];
}

/**
 * The node arrow keys move to from `from`: ↑/↓ the nearest node in the previous/next row of the same
 * lane, ←/→ the nearest node in the neighbouring column (or slot), Home/End the first/last node in
 * reading order. Undefined when the key does not navigate or nothing lies that way.
 */
export function neighbour(boxes: readonly NodeBox[], from: NodeBox, key: string): NodeBox | undefined {
  const ordered = readingOrder(boxes);
  if (key === 'Home') return ordered[0];
  if (key === 'End') return ordered.at(-1);
  const others = boxes.filter((box) => box !== from);
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const sign = key === 'ArrowDown' ? 1 : -1;
    const lane = others.filter((box) => box.column === from.column && Math.sign(box.row - from.row) === sign);
    const nextRow = sign > 0 ? Math.min(...lane.map((box) => box.row)) : Math.max(...lane.map((box) => box.row));
    return nearest(lane.filter((box) => box.row === nextRow), from);
  }
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const sign = key === 'ArrowRight' ? 1 : -1;
    const sideways = others.filter((box) => Math.sign(box.x - from.x) === sign);
    const sameRow = sideways.filter((box) => box.row === from.row);
    return nearest(sameRow.length > 0 ? sameRow : sideways, from);
  }
  return undefined;
}

/** A horizontal extent in canvas px. */
export interface Span {
  left: number;
  right: number;
}

/** Horizontal extent of `boxes` (e.g. the nodes computed in this step); undefined when empty. */
export function spanOf(boxes: readonly NodeBox[]): Span | undefined {
  if (boxes.length === 0) return undefined;
  return { left: Math.min(...boxes.map((box) => box.x)), right: Math.max(...boxes.map((box) => box.x + box.width)) };
}

/** scrollLeft that centres `span` in a viewport of `viewportWidth`, clamped to the scroll range. */
export function centredScrollLeft(span: Span, viewportWidth: number, contentWidth: number): number {
  const centred = (span.left + span.right) / 2 - viewportWidth / 2;
  return Math.max(0, Math.min(centred, contentWidth - viewportWidth));
}

/**
 * Extent of the lanes (columns) `boxes` sit in, padded by half a lane gap on each side, so the edges
 * of that span fall into empty lane gaps, never through a node; undefined when empty.
 */
export function laneSpanOf(layout: Pick<ChainLayout, 'lanes'>, boxes: readonly NodeBox[]): Span | undefined {
  const lanes = [...new Set(boxes.map((box) => box.column))].flatMap((column) => layout.lanes[column] ?? []);
  if (lanes.length === 0) return undefined;
  const pad = GEOMETRY.laneGap / 2;
  return { left: Math.min(...lanes.map((lane) => lane.x)) - pad, right: Math.max(...lanes.map((lane) => lane.x + lane.width)) + pad };
}

/**
 * scrollLeft that puts the start of `span` (a padded lane span, `laneSpanOf`) at the viewport's left
 * edge, clamped to the scroll range: the current lane is shown from its start and no node on its
 * left is cut in half.
 */
export function laneStartScrollLeft(span: Span, viewportWidth: number, contentWidth: number): number {
  return Math.max(0, Math.min(span.left, contentWidth - viewportWidth));
}

/** How much deeper than the typical lane a lane must run to count as deep (GCM's GHASH chain runs ~1.8×). */
const DEEP_LANE_RATIO = 1.5;

/**
 * Whether one lane runs far deeper than the typical (median) lane, e.g. GCM's GHASH chain beside its
 * block lanes. Such a diagram fits its height to the lanes in view (`fittedHeight`) and scrolls the
 * current lane to its start; lanes of (nearly) equal depth keep the full height and centred scrolling.
 */
export function hasDeepLane(layout: Pick<ChainLayout, 'boxes' | 'lanes'>): boolean {
  const depths = layout.lanes.map((_, column) => Math.max(0, ...layout.boxes.filter((box) => box.column === column).map((box) => box.y + box.height)));
  if (depths.length < 2) return false;
  const sorted = [...depths].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)]!;
  return sorted.at(-1)! > typical * DEEP_LANE_RATIO;
}

/**
 * Canvas height that fits the nodes of the lanes overlapping the visible range `view` (canvas px),
 * so a deep lane out of view (GCM's GHASH chain) leaves no empty band under the shallow ones; the
 * full height when nothing is in view.
 */
export function fittedHeight(layout: Pick<ChainLayout, 'boxes' | 'height' | 'lanes'>, view: Span): number {
  const visible = new Set(layout.lanes.flatMap((lane, column) => (lane.x < view.right && lane.x + lane.width > view.left ? [column] : [])));
  const bottoms = layout.boxes.filter((box) => visible.has(box.column)).map((box) => box.y + box.height);
  return bottoms.length === 0 ? layout.height : Math.min(layout.height, Math.max(...bottoms) + GEOMETRY.bottom);
}
