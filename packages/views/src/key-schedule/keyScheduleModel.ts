import { derivationInputs, derivationNode, isResultNode, type DerivationFacet, type DerivationNode } from '@cryventure/core';
import { toHex } from '@cryventure/viz';

/**
 * Pure view model of a key schedule (`derivation` facet).
 * Follows core's derivation convention (`isResultNode`): result nodes (with a `group`) are the
 * schedule's words; intermediates only appear in a word's derivation chain. A node's first input
 * continues the chain, further inputs are XOR operands.
 */
export interface RoundKeyRow {
  group: number;
  /** Earliest state step at which this round key is used (`undefined` when unknown). */
  step: number | undefined;
  words: DerivationNode[];
}

export type RowStatus = 'current' | 'used' | 'upcoming';

export interface ChainLink {
  node: DerivationNode;
  /** Values XORed into the previous link to produce `node`. */
  operands: DerivationNode[];
}

/** A schedule word (core: a derivation result node). */
export function isPrimary(node: DerivationNode): boolean {
  return isResultNode(node);
}

function earliestStep(words: readonly DerivationNode[]): number | undefined {
  const steps = words.flatMap((word) => (word.step === undefined ? [] : [word.step]));
  return steps.length === 0 ? undefined : Math.min(...steps);
}

/** Primary nodes grouped by `group` (ascending), keeping facet order inside a group. */
export function roundKeyRows(facet: DerivationFacet): RoundKeyRow[] {
  const groups = new Map<number, DerivationNode[]>();
  for (const node of facet.nodes) {
    if (node.group === undefined) continue;
    groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([group, words]) => ({ group, step: earliestStep(words), words }));
}

/** The round key most recently put to use at `step`: the row with the greatest `step ≤ step`. */
export function currentGroup(rows: readonly RoundKeyRow[], step: number): number | undefined {
  let current: RoundKeyRow | undefined;
  for (const row of rows) {
    if (row.step !== undefined && row.step <= step && (current?.step === undefined || row.step >= current.step)) current = row;
  }
  return current?.group;
}

export function rowStatus(row: RoundKeyRow, step: number, current: number | undefined): RowStatus {
  if (row.group === current) return 'current';
  return row.step !== undefined && row.step <= step ? 'used' : 'upcoming';
}

/**
 * How a word is derived, oldest first: the source word, every intermediate, then the word itself.
 * E.g. AES w[4]: w[3] → RotWord → SubWord → (⊕ Rcon[1]) → (⊕ w[0]) = w[4]. Unknown ids yield []; cycles stop.
 */
export function derivationChain(facet: DerivationFacet, id: string): ChainLink[] {
  let current = derivationNode(facet, id);
  const links: ChainLink[] = [];
  const seen = new Set<string>();
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    const [main, ...operands] = derivationInputs(facet, current.id);
    links.unshift({ node: current, operands });
    if (main !== undefined && isPrimary(main)) links.unshift({ node: main, operands: [] });
    current = main !== undefined && !isPrimary(main) ? main : undefined;
  }
  return links;
}

/** Bytes as one lowercase hex string, e.g. `a0fafe17`. */
export function wordHex(bytes: readonly number[]): string {
  return bytes.map((byte) => toHex(byte)).join('');
}
