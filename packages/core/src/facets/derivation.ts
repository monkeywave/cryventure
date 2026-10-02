import type { I18nRef } from '../i18n.ts';

/**
 * Derivation facet: a DAG of values derived from other values
 * (AES key schedule words, HKDF/TLS key schedules, ratchet chains …).
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
