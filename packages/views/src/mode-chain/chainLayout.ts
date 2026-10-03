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
 * (CTR: Pᵢ beside the keystream, above ⊕); lane −1 nodes share the row of their first target.
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
  for (const node of facet.nodes) {
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

/** SVG path of an edge: down within a lane, sideways between lanes, over the bus across non-adjacent lanes in one row. */
export function edgePathData(source: NodeBox, target: NodeBox): string {
  const sx = source.x + source.width / 2;
  const tx = target.x + target.width / 2;
  if (source.column === target.column) {
    const sy = source.y + source.height;
    const ty = target.y;
    const mid = (ty - sy) / 2;
    return `M${round(sx)} ${round(sy)} C${round(sx)} ${round(sy + mid)} ${round(tx)} ${round(ty - mid)} ${round(tx)} ${round(ty)}`;
  }
  if (source.row === target.row && Math.abs(source.column - target.column) > 1) {
    return `M${round(sx)} ${round(source.y)} V${GEOMETRY.busY} H${round(tx)} V${round(target.y)}`;
  }
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
  const { boxes, width, height, headers } = boxesOf(facet, metrics);
  const boxById = new Map(boxes.map((box) => [box.node.id, box]));
  const edges = facet.edges.flatMap((edge) => {
    const source = boxById.get(edge.from);
    const target = boxById.get(edge.to);
    return source === undefined || target === undefined ? [] : [{ key: chainEdgeKey(edge), edge, d: edgePathData(source, target) }];
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
