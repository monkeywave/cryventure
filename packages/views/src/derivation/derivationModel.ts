import {
  derivationInputs,
  derivationNode,
  isResultNode,
  type DerivationFacet,
  type DerivationNode,
  type I18nRef,
  toHex,
} from '@cryventure/core';

/**
 * Pure view model of a `derivation` facet (e.g. a key schedule).
 * Follows core's derivation convention (`isResultNode`): result nodes are listed, grouped by their
 * `group` (labelled by `DerivationFacet.groups`); intermediates only appear in a result's
 * derivation chain. A node's first input continues the chain, further inputs are XOR operands.
 */
export interface ResultGroup {
  /** The nodes' `group` value; `undefined` collects results without a group. */
  group: number | undefined;
  /** Earliest state step at which this group is used (`undefined` when unknown). */
  step: number | undefined;
  words: DerivationNode[];
}

export type RowStatus = 'current' | 'used' | 'upcoming';

export interface ChainLink {
  node: DerivationNode;
  /** Values XORed into the previous link to produce `node`. */
  operands: DerivationNode[];
}

function earliestStep(words: readonly DerivationNode[]): number | undefined {
  const steps = words.flatMap((word) => (word.step === undefined ? [] : [word.step]));
  return steps.length === 0 ? undefined : Math.min(...steps);
}

const groupOrder = (group: number | undefined) => group ?? Number.POSITIVE_INFINITY;

/** Result nodes grouped by `group` (ascending, ungrouped last), keeping facet order inside a group. */
export function resultGroups(facet: DerivationFacet): ResultGroup[] {
  const groups = new Map<number | undefined, DerivationNode[]>();
  for (const node of facet.nodes) {
    if (!isResultNode(node)) continue;
    groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .map(([group, words]) => ({ group, step: earliestStep(words), words }));
}

/** The producer's label of a `group` value (`DerivationFacet.groups`), if it declares one. */
export function groupLabel(facet: DerivationFacet, group: number | undefined): I18nRef | undefined {
  return group === undefined ? undefined : facet.groups?.find((entry) => entry.id === group)?.label;
}

/** The group most recently put to use at `step`: the row with the greatest `step ≤ step`. */
export function currentGroup(rows: readonly ResultGroup[], step: number): ResultGroup | undefined {
  let current: ResultGroup | undefined;
  for (const row of rows) {
    if (row.step !== undefined && row.step <= step && (current?.step === undefined || row.step >= current.step)) current = row;
  }
  return current;
}

export function rowStatus(row: ResultGroup, step: number, current: ResultGroup | undefined): RowStatus {
  if (row === current) return 'current';
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
    if (main !== undefined && isResultNode(main)) links.unshift({ node: main, operands: [] });
    current = main !== undefined && !isResultNode(main) ? main : undefined;
  }
  return links;
}

/** Bytes as one lowercase hex string, e.g. `a0fafe17`. */
export function wordHex(bytes: readonly number[]): string {
  return toHex(bytes);
}

/**
 * The schedule words a word is computed from directly (the results reached by its chain), e.g.
 * AES-128 w[4] ← w[3], w[0]; AES-256 w[12] (i mod Nk = 4) ← w[11], w[4]. Intermediates and
 * constants (RotWord, Rcon …) are skipped; the word itself is never its own source.
 */
export function sourceWordIds(facet: DerivationFacet, id: string): string[] {
  const nodes = derivationChain(facet, id).flatMap((link) => [link.node, ...link.operands]);
  return nodes.filter((node) => node.id !== id && isResultNode(node)).map((node) => node.id);
}

/** Word id → the row that lists it (and hosts its chain), built once per facet. */
export function hostRows(rows: readonly ResultGroup[]): ReadonlyMap<string, ResultGroup> {
  return new Map(rows.flatMap((row) => row.words.map((word) => [word.id, row] as const)));
}

/**
 * Ops the view names from its own catalog (`view.derivation.op.<op>`): the AES key schedule's and the
 * MAC/KDF producers' (HMAC's key, inner and outer `hash`). Any other op is shown by its raw name.
 */
export const OP_CATALOG = ['input', 'rotWord', 'subWord', 'rcon', 'xor', 'hash', 'hmac', 'concat', 'counter', 'truncate', 'hkdfLabel', 'split'] as const;

const CATALOGUED_OPS: ReadonlySet<string> = new Set(OP_CATALOG);

/** The catalog key naming `op`, or `undefined` for an op outside the catalog. */
export function opLabelKey(op: string): string | undefined {
  return CATALOGUED_OPS.has(op) ? `view.derivation.op.${op}` : undefined;
}

/** Glyph in front of an operand combined into a node by `op` (`⊕` for XOR, `‖` for concatenation). */
export function operandGlyph(op: string): string {
  if (op === 'xor') return '⊕';
  if (op === 'concat') return '‖';
  return '+';
}

/** The symbol a label may use for `op` in place of its name (`⊕`, `‖`), if any. */
function opSymbol(op: string): string | undefined {
  const glyph = operandGlyph(op);
  return glyph === '+' ? undefined : glyph;
}

/** Whether `label` begins or ends with the word(s) `name` (case-insensitive): "RotWord for w[4]", "Inner hash". */
function framedBy(label: string, name: string): boolean {
  const text = label.trim().toLocaleLowerCase();
  const word = name.toLocaleLowerCase();
  return word !== '' && (text === word || text.startsWith(`${word} `) || text.endsWith(` ${word}`));
}

/**
 * Whether a chain line tags its node with the op's name: not when the node's (translated) label
 * already says it, beginning or ending with the op's name ("RotWord for w[4]", "Inner hash") or
 * using its symbol ("⊕ Rcon for w[4]", "S ‖ INT(1)"), so the line never reads twice. HKDF/PRF
 * values ("T(1)", "P_MD5: A(1)", "U4095 (after 4092 HMAC calls not shown)") keep their tag.
 */
export function opTagShown(op: string, opLabel: string, label: string): boolean {
  const symbol = opSymbol(op);
  return !framedBy(label, opLabel) && (symbol === undefined || !label.includes(symbol));
}

/** Chains with more lines than this scroll inside their panel (PBKDF2 iterations, P_hash rounds). */
export const LONG_CHAIN_LINES = 12;

/** Lines a chain renders: every link's operands plus the link itself. */
export function chainLineCount(links: readonly ChainLink[]): number {
  return links.reduce((count, link) => count + link.operands.length + 1, 0);
}
