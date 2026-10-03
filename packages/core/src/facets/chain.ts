import type { I18nRef } from '../i18n.ts';

/** Chain facet: block-mode dataflow, one lane per block (docs/M3.md §6). */

export type ChainNodeKind = 'input' | 'iv' | 'counter' | 'xor' | 'cipher' | 'keystream' | 'output' | 'pad' | 'hash' | 'tag' | 'aad' | 'length';

export interface ChainNode {
  /** Stable, e.g. `b2.xor`. */
  id: string;
  /** Lane, 0-based; -1 = before the first lane (IV, padding). */
  block: number;
  kind: ChainNodeKind;
  label: I18nRef;
  /** Value shown in the node. */
  bytes: number[];
  /** ValueRef id for linked brushing. */
  valueRef?: string;
  /** State step at which the node gets its value (-1 = initial). */
  activeAt: number;
  /** The wire segment carrying this node's value; it becomes available when the node gets its value. */
  segmentId?: string;
  /** The block cipher call to zoom into: the host links it via the producer's `blockLabParams`. */
  zoom?: { producerId: string; keyHex: string; blockHex: string };
}

export interface ChainEdge {
  from: string;
  to: string;
  activeAt: number;
}

export interface ChainFacet {
  kind: 'chain';
  schemaVersion: 1;
  mode: 'ecb' | 'cbc' | 'ctr' | (string & {});
  direction: 'encrypt' | 'decrypt';
  /** E.g. "C_i = E_k(P_i ⊕ C_{i−1})". */
  formula: I18nRef;
  nodes: ChainNode[];
  edges: ChainEdge[];
}

export interface ChainActivity {
  nodes: Set<string>;
  /** Keys from `chainEdgeKey`. */
  edges: Set<string>;
}

/** Stable key of an edge, `from->to`. */
export function chainEdgeKey(edge: Pick<ChainEdge, 'from' | 'to'>): string {
  return `${edge.from}->${edge.to}`;
}

function stepIsInRange(step: number, stepCount: number): boolean {
  return Number.isInteger(step) && step >= -1 && step <= stepCount - 1;
}

function duplicateIdIssues(facet: ChainFacet): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const { id } of facet.nodes) {
    if (seen.has(id)) issues.push(`chain: duplicate node id "${id}"`);
    seen.add(id);
  }
  return issues;
}

function endpointIssues(facet: ChainFacet, nodeById: Map<string, ChainNode>): string[] {
  return facet.edges.flatMap((edge) =>
    (['from', 'to'] as const)
      .filter((end) => !nodeById.has(edge[end]))
      .map((end) => `chain: edge ${chainEdgeKey(edge)} has unknown ${end === 'from' ? 'source' : 'target'} "${edge[end]}"`),
  );
}

function rangeIssues(facet: ChainFacet, stepCount: number): string[] {
  const range = `-1..${stepCount - 1}`;
  const nodes = facet.nodes.filter((n) => !stepIsInRange(n.activeAt, stepCount)).map((n) => `chain: node "${n.id}" activeAt ${n.activeAt} outside ${range}`);
  const edges = facet.edges.filter((e) => !stepIsInRange(e.activeAt, stepCount)).map((e) => `chain: edge ${chainEdgeKey(e)} activeAt ${e.activeAt} outside ${range}`);
  return [...nodes, ...edges];
}

function orderingIssues(facet: ChainFacet, nodeById: Map<string, ChainNode>): string[] {
  const nodeIssues: string[] = [];
  const edgeIssues: string[] = [];
  for (const edge of facet.edges) {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (source === undefined) continue;
    if (target !== undefined && target.activeAt < source.activeAt) {
      nodeIssues.push(`chain: node "${target.id}" activeAt ${target.activeAt} precedes its source "${source.id}" (${source.activeAt})`);
    }
    if (edge.activeAt < source.activeAt) edgeIssues.push(`chain: edge ${chainEdgeKey(edge)} activeAt ${edge.activeAt} precedes its source (${source.activeAt})`);
  }
  return [...nodeIssues, ...edgeIssues];
}

/** Structural problems of a chain facet (empty = valid): ids, endpoints, step ranges, causal order. */
export function chainIssues(facet: ChainFacet, stepCount: number): string[] {
  const nodeById = new Map(facet.nodes.map((node) => [node.id, node]));
  return [...duplicateIdIssues(facet), ...endpointIssues(facet, nodeById), ...rangeIssues(facet, stepCount), ...orderingIssues(facet, nodeById)];
}

/** Node ids that have their value at `step` (activeAt ≤ step). */
export function chainActiveNodesAt(facet: ChainFacet, step: number): Set<string> {
  return new Set(facet.nodes.filter((node) => node.activeAt <= step).map((node) => node.id));
}

/** Node ids and edge keys that have their value at `step` (activeAt ≤ step). */
export function chainActiveAt(facet: ChainFacet, step: number): ChainActivity {
  return {
    nodes: chainActiveNodesAt(facet, step),
    edges: new Set(facet.edges.filter((edge) => edge.activeAt <= step).map(chainEdgeKey)),
  };
}

/** Every I18nRef the facet renders: node labels, then the formula (for the contract kit). */
export function chainLabelRefs(facet: ChainFacet): I18nRef[] {
  return [...facet.nodes.map((node) => node.label), facet.formula];
}

/** Distinct block lanes in ascending order (-1 first when present). */
export function chainLanes(facet: ChainFacet): number[] {
  return [...new Set(facet.nodes.map((node) => node.block))].sort((a, b) => a - b);
}
