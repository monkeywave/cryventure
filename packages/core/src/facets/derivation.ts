import type { I18nRef } from '../i18n.ts';
import { readProducerId } from '../params.ts';
import { describeValue, i18nRefProblems, isPlainRecord } from './validation.ts';

/**
 * Derivation facet: a DAG of values derived from other values
 * (AES key schedule words, HKDF/TLS key schedules, ratchet chains …).
 *
 * Convention: *result* nodes (e.g. AES key words w[i], TLS traffic secrets) are marked `result: true`
 * (legacy producers: carry a `group`) and usually `step` and `valueRef`; *intermediates* (RotWord,
 * SubWord, ⊕Rcon, HKDF-Extract output …) carry none of them and only appear inside a result's
 * derivation chain. A node's FIRST input continues the
 * chain; further inputs are operands combined into it (e.g. XORed). Views rely on this to list
 * results and to unfold one result's chain (see `isResultNode`).
 */

/**
 * A link to another producer's lab run (generic successor of the chain facet's block zoom): the
 * host opens producer `producerId` with `params` (e.g. a hash lab from `hashLabParams`).
 */
export interface LabZoom {
  /** Kebab-case id of the producer whose lab to open. */
  producerId: string;
  /** That lab's params, every value a string. */
  params: Record<string, string>;
}

export interface DerivationNode {
  /** Stable, path-derived id (see `valueId`). */
  id: string;
  label: I18nRef;
  bytes: number[];
  /** Operation that produced this node, e.g. 'input' | 'rotWord' | 'subWord' | 'rcon' | 'xor' | 'hkdfExpand'. */
  op: string;
  /** Ids of the nodes this one is computed from (empty for inputs/constants). */
  inputs: string[];
  /** Optional grouping, e.g. the AES round a key word belongs to (labelled by `DerivationFacet.groups`). */
  group?: number;
  /**
   * Whether views list this node as a result (additive). Without it, a node with a `group` counts
   * as a result (back-compat); see `isResultNode`.
   */
  result?: boolean;
  /** Optional link to a ValueRef in the `values` facet. */
  valueRef?: string;
  /** Optional state step at which this node becomes relevant (for highlighting while playing). */
  step?: number;
  /** Optional link to another producer's lab computing this node (e.g. the hash call inside an HMAC). */
  zoom?: LabZoom;
}

/** Producer-declared label of one `group` value, e.g. `{ id: 3, label: "Round key 3" }`. */
export interface DerivationGroup {
  id: number;
  label: I18nRef;
}

export interface DerivationFacet {
  kind: 'derivation';
  schemaVersion: 1;
  nodes: DerivationNode[];
  /** Optional labels for the `group` values nodes use (additive); views fall back to generic labels. */
  groups?: DerivationGroup[];
  /** Optional heading of the view (additive), e.g. "HKDF" or "Key schedule"; views fall back to a generic one. */
  title?: I18nRef;
}

/** Whether `node` is a result (listed by views) rather than an intermediate: `result`, else "has a `group`". */
export function isResultNode(node: Pick<DerivationNode, 'group' | 'result'>): boolean {
  return node.result ?? node.group !== undefined;
}

const nodeIndexes = new WeakMap<DerivationFacet, Map<string, DerivationNode>>();

/** `id → node` index of a facet, built once per facet object (facets are immutable). */
function nodeIndex(facet: DerivationFacet): Map<string, DerivationNode> {
  let index = nodeIndexes.get(facet);
  if (index === undefined) {
    index = new Map();
    for (const node of facet.nodes) if (!index.has(node.id)) index.set(node.id, node);
    nodeIndexes.set(facet, index);
  }
  return index;
}

/** The node with `id`, or `undefined` (the first one when ids repeat). */
export function derivationNode(facet: DerivationFacet, id: string): DerivationNode | undefined {
  return nodeIndex(facet).get(id);
}

/** Direct inputs of a node (missing ids are skipped). */
export function derivationInputs(facet: DerivationFacet, id: string): DerivationNode[] {
  const node = derivationNode(facet, id);
  if (node === undefined) return [];
  return node.inputs.map((input) => derivationNode(facet, input)).filter((n) => n !== undefined);
}

/** All transitive ancestors of a node (each once, nearest first). */
export function derivationAncestors(facet: DerivationFacet, id: string): DerivationNode[] {
  const seen = new Set<string>();
  const queue = [...(derivationNode(facet, id)?.inputs ?? [])];
  const result: DerivationNode[] = [];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const node = derivationNode(facet, next);
    if (node === undefined) continue;
    result.push(node);
    queue.push(...node.inputs);
  }
  return result;
}

/** Throws if an input refers to a node defined later or missing (the DAG must be topologically ordered). */
export function assertTopologicalOrder(facet: DerivationFacet): void {
  const defined = new Set<string>();
  for (const node of facet.nodes) {
    for (const input of node.inputs) {
      if (!defined.has(input)) throw new Error(`derivation: "${node.id}" uses "${input}" before it is defined`);
    }
    if (defined.has(node.id)) throw new Error(`derivation: duplicate node id "${node.id}"`);
    defined.add(node.id);
  }
}

function zoomProblems(zoom: unknown, where: string): string[] {
  if (zoom === undefined) return [];
  if (!isPlainRecord(zoom)) return [`${where}: zoom is not an object`];
  const problems = readProducerId(zoom.producerId) === undefined ? [`${where}: zoom.producerId ${describeValue(zoom.producerId)} is not a kebab-case producer id`] : [];
  if (!isPlainRecord(zoom.params)) return [...problems, `${where}: zoom.params is not a record of strings`];
  const nonStrings = Object.entries(zoom.params).filter(([, value]) => typeof value !== 'string');
  return [...problems, ...nonStrings.map(([name]) => `${where}: zoom.params.${name} is not a string`)];
}

function nodeProblems(node: unknown, index: number): string[] {
  if (!isPlainRecord(node)) return [`derivation: node ${index} is not an object`];
  const where = typeof node.id === 'string' ? `derivation: node "${node.id}"` : `derivation: node ${index}`;
  return [...i18nRefProblems(node.label, `${where} label`), ...zoomProblems(node.zoom, where)];
}

/**
 * Schema problems of a derivation facet (empty = valid); never throws, whatever `facet` is. Checks
 * `kind`, `schemaVersion`, that `nodes` is an array of objects with well-formed `label`s, an optional
 * well-formed `title`, and every node `zoom` (a kebab-case `producerId`, `params` a record of strings).
 * Topological order is `assertTopologicalOrder`'s job.
 */
export function validateDerivationFacet(facet: unknown): string[] {
  if (!isPlainRecord(facet)) return ['derivation: facet is not an object'];
  if (facet.kind !== 'derivation') return [`derivation: kind ${describeValue(facet.kind)} is not "derivation"`];
  if (facet.schemaVersion !== 1) return [`derivation: schemaVersion ${describeValue(facet.schemaVersion)} is not 1`];
  const titleProblems = facet.title === undefined ? [] : i18nRefProblems(facet.title, 'derivation title');
  if (!Array.isArray(facet.nodes)) return [...titleProblems, 'derivation: nodes is not an array'];
  return [...titleProblems, ...facet.nodes.flatMap((node: unknown, index) => nodeProblems(node, index))];
}
