import { toHex, type ChainFacet, type ChainNode, type ChainNodeKind } from '@cryventure/core';

/** Pure helpers of the mode-chain view: hex text, node roles, repeated-block groups, label notation. */

/** Bytes per hex line in wide layouts (16-byte blocks take two lines). */
export const BYTES_PER_LINE = 8;
/** Bytes kept at each end of an abbreviated value. */
const ABBREVIATED_END_BYTES = 2;
const ELLIPSIS = '…';

/** Full hex, `BYTES_PER_LINE` bytes per line. */
export function hexLines(bytes: readonly number[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += BYTES_PER_LINE) lines.push(toHex(bytes.slice(i, i + BYTES_PER_LINE)));
  return lines.length > 0 ? lines : [''];
}

/** First and last bytes around an ellipsis (`6bc1…172a`), or the whole value when it is short. */
export function abbreviatedHex(bytes: readonly number[]): string {
  if (bytes.length <= ABBREVIATED_END_BYTES * 2 + 1) return toHex(bytes);
  return `${toHex(bytes.slice(0, ABBREVIATED_END_BYTES))}${ELLIPSIS}${toHex(bytes.slice(-ABBREVIATED_END_BYTES))}`;
}

/** Full hex grouped in 4-byte words, for tooltips and screen readers. */
export function spacedHex(bytes: readonly number[]): string {
  return toHex(bytes, { group: 4 });
}

/**
 * Semantic data role of a node (PLAN §3 tokens): what the bytes are, given the direction. GCM adds
 * the authentication tag, AAD (authenticated, never encrypted), the GHASH accumulator and the
 * length block (docs/M4.md §3f).
 */
export type NodeRole = 'plaintext' | 'ciphertext' | 'nonce' | 'key' | 'state' | 'padding' | 'tag' | 'aad' | 'hash' | 'length';

/** GCM roles, which carry a glyph beside their label and a legend entry. */
export type GcmRole = Extract<NodeRole, 'tag' | 'aad' | 'hash' | 'length'>;

/**
 * Non-colour cue per GCM role (decorative; the role is also said in words): ✓ the tag that
 * authenticates, ◇✓ AAD (sent in the clear, but authenticated), ⊗ the GHASH multiply by H (PLAN §3
 * op glyphs), ‖ the length block len(A) ‖ len(C).
 */
export const GCM_ROLE_GLYPHS: Readonly<Record<GcmRole, string>> = {
  tag: '✓',
  aad: '◇✓',
  hash: '⊗',
  length: '‖',
};

/** Legend order of the GCM roles. */
const GCM_ROLES: readonly GcmRole[] = ['aad', 'hash', 'length', 'tag'];

export function isGcmRole(role: NodeRole): role is GcmRole {
  return (GCM_ROLES as readonly NodeRole[]).includes(role);
}

const ROLE_BY_KIND: Readonly<Record<ChainNodeKind, NodeRole | 'in' | 'out'>> = {
  input: 'in',
  output: 'out',
  iv: 'nonce',
  counter: 'nonce',
  cipher: 'key',
  keystream: 'state',
  xor: 'state',
  pad: 'padding',
  // GCM (docs/M4.md §3f).
  hash: 'hash',
  length: 'length',
  aad: 'aad',
  tag: 'tag',
};

export function nodeRole(node: ChainNode, direction: ChainFacet['direction']): NodeRole {
  const role = ROLE_BY_KIND[node.kind];
  if (role === 'in') return direction === 'encrypt' ? 'plaintext' : 'ciphertext';
  if (role === 'out') return direction === 'encrypt' ? 'ciphertext' : 'plaintext';
  return role;
}

/** The GCM roles a facet's nodes use, in legend order (empty for ECB/CBC/CTR). */
export function gcmRolesOf(facet: ChainFacet): GcmRole[] {
  const used = new Set(facet.nodes.map((node) => nodeRole(node, facet.direction)));
  return GCM_ROLES.filter((role) => used.has(role));
}

/** Lanes holding a GHASH accumulator node: GCM's GHASH lane (which also holds the tag), not a block lane. */
export function hashLanes(facet: ChainFacet): Set<number> {
  return new Set(facet.nodes.filter((node) => node.kind === 'hash').map((node) => node.block));
}

/** Kinds compared for repetition: the blocks going in and coming out. */
const COMPARED_KINDS: ReadonlySet<ChainNodeKind> = new Set(['input', 'output']);

/** One set of equal blocks: the group's index (for its letter and pattern) and its members. */
export interface SameGroup {
  index: number;
  ids: string[];
}

/**
 * Lanes whose input (or output) blocks are byte-for-byte equal, among the nodes that already have
 * their value (`active`): ECB's tell-tale repetition. Nodes without bytes (GCM decrypt's withheld or
 * discarded output) are never grouped. Groups are numbered in node order.
 */
export function sameGroups(facet: ChainFacet, active: ReadonlySet<string>): Map<string, SameGroup> {
  const byValue = new Map<string, string[]>();
  for (const node of facet.nodes) {
    if (node.block < 0 || node.bytes.length === 0 || !COMPARED_KINDS.has(node.kind) || !active.has(node.id)) continue;
    const key = `${node.kind}:${toHex(node.bytes)}`;
    byValue.set(key, [...(byValue.get(key) ?? []), node.id]);
  }
  const groups = new Map<string, SameGroup>();
  let index = 0;
  for (const ids of byValue.values()) {
    if (ids.length < 2) continue;
    const group = { index: index++, ids };
    for (const id of ids) groups.set(id, group);
  }
  return groups;
}

/**
 * The last step at or before `step` that gave a compared (input/output) node its value: the groups
 * only change there, so memoising on it keeps the group objects (and memoised nodes) stable.
 */
export function groupsChangeStep(facet: ChainFacet, step: number): number {
  const changes = facet.nodes.filter((node) => node.block >= 0 && COMPARED_KINDS.has(node.kind) && node.activeAt <= step).map((node) => node.activeAt);
  return Math.max(Math.min(step, -1), ...changes);
}

/** Ids of the nodes whose edges feed `id`, in edge order (the dataflow screen readers cannot see). */
export function sourceIds(facet: ChainFacet, id: string): string[] {
  return facet.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
}

/** Letter of a same-value group: A, B, … */
export function groupLetter(index: number): string {
  return String.fromCharCode(0x41 + (index % 26));
}

/** A piece of a label: plain text or a subscript. */
export interface LabelSegment {
  text: string;
  sub: boolean;
}

/** `E_K` / `T_{i+1}` subscripts; with `blockIndices`, also a trailing block number (`P1` → P₁). */
const UNDERSCORE_SUBSCRIPT = /_(?:\{([^}]*)\}|(\S))/g;
const TRAILING_INDEX = /^(.*\p{L})(\d+)$/u;

/**
 * A translated label in mathematical notation: `_x` / `_{xy}` become subscripts; with `blockIndices`
 * (the cryptographer lens) a letter followed by a block number does too (`C2` → C₂).
 */
export function labelSegments(text: string, blockIndices: boolean): LabelSegment[] {
  const segments: LabelSegment[] = [];
  const push = (part: string, sub: boolean) => {
    if (part !== '') segments.push({ text: part, sub });
  };
  let cursor = 0;
  for (const match of text.matchAll(UNDERSCORE_SUBSCRIPT)) {
    push(text.slice(cursor, match.index), false);
    push(match[1] ?? match[2] ?? '', true);
    cursor = match.index + match[0].length;
  }
  const rest = text.slice(cursor);
  const indexed = blockIndices ? TRAILING_INDEX.exec(rest) : null;
  if (indexed === null) push(rest, false);
  else {
    push(indexed[1] ?? '', false);
    push(indexed[2] ?? '', true);
  }
  return segments;
}

/** The label as plain text for screen readers and tooltips: subscripts joined with a space (`E K`). */
export function plainLabel(text: string): string {
  return labelSegments(text, false)
    .map((segment) => (segment.sub ? ` ${segment.text}` : segment.text))
    .join('');
}
