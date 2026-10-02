import type { I18nRef } from '../i18n.ts';

/**
 * Derivation facet: a DAG of values derived from other values
 * (AES key schedule words, HKDF/TLS key schedules, ratchet chains …).
 *
 * Convention: *result* nodes (e.g. AES key words w[i], TLS traffic secrets) carry `group`, `step`
 * and `valueRef`; *intermediates* (RotWord, SubWord, ⊕Rcon, HKDF-Extract output …) carry none of
 * them and only appear inside a result's derivation chain. A node's FIRST input continues the
 * chain; further inputs are operands combined into it (e.g. XORed). Views rely on this to list
 * results and to unfold one result's chain (see `isResultNode`).
 */

export interface DerivationNode {
  /** Stable, path-derived id (see `valueId`). */
  id: string;
  label: I18nRef;
  bytes: number[];
  /** Operation that produced this node, e.g. 'input' | 'rotWord' | 'subWord' | 'rcon' | 'xor' | 'hkdfExpand'. */
  op: string;
  /** Ids of the nodes this one is computed from (empty for inputs/constants). */
  inputs: string[];
  /** Optional grouping, e.g. the AES round a key word belongs to. */
  group?: number;
  /** Optional link to a ValueRef in the `values` facet. */
  valueRef?: string;
  /** Optional state step at which this node becomes relevant (for highlighting while playing). */
  step?: number;
}

export interface DerivationFacet {
  kind: 'derivation';
  schemaVersion: 1;
  nodes: DerivationNode[];
}

/** Whether `node` is a result (listed by views) rather than an intermediate: results carry a `group`. */
export function isResultNode(node: Pick<DerivationNode, 'group'>): boolean {
  return node.group !== undefined;
}

/** The node with `id`, or `undefined`. */
export function derivationNode(facet: DerivationFacet, id: string): DerivationNode | undefined {
  return facet.nodes.find((node) => node.id === id);
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
