import { latestStepAt, type Lens, type WordBits, type WordOp, type WordopsFacet, type WordopsSchemaVersion, type WordopsStep, type WordTerm } from '@cryventure/core';
import { chunk } from '../_lib/chunk.ts';

/**
 * Pure helpers of the wordops view: step lookup at the playhead, hex chunking, bit strips, the
 * story-lens term filter and the SHA-2 register shift. No React, no i18n: the component translates.
 */

/** The latest wordops step whose `step ≤ step`, or `undefined` before the first (core `latestStepAt`). */
export function wordopsStepAt(facet: WordopsFacet, step: number): WordopsStep | undefined {
  return latestStepAt(facet.steps, step);
}

const HEX_CHUNK = 4;

/** A hex word in 4-digit chunks, lowercase: "6a09e667" → ["6a09", "e667"]. */
export function hexChunks(hex: string): string[] {
  return chunk([...hex.toLowerCase()], HEX_CHUNK).map((digits) => digits.join(''));
}

/**
 * Hex chunks per line of a register word: a 64-bit word wraps onto two lines of two chunks, so the
 * register columns (and the shift arrows) keep the 32-bit width; `undefined` = one line.
 */
export function registerChunksPerLine(wordBits: WordBits): number | undefined {
  return wordBits === 64 ? 2 : undefined;
}

/** An op's catalog suffix: the op, or `root2` / `root3` for a root with a degree (v2). */
type OpKeySuffix = WordOp | 'root2' | 'root3';

function opKeySuffix({ op, degree }: OpOf): OpKeySuffix {
  return op === 'root' && degree !== undefined ? `root${degree}` : op;
}

/** What the op keys read from a term. */
type OpOf = { op: WordOp; degree?: WordTerm['degree'] };

/**
 * Catalog key of the visible operator glyph (FIPS 180-4 notation: ROTR, Ch, Σ0, ⊕ …), so the
 * on-screen text is localizable like every other label. A root with `degree` reads √ or ∛ (v2).
 */
export function opGlyphKey(term: OpOf): `view.wordops.glyph.${OpKeySuffix}` {
  return `view.wordops.glyph.${opKeySuffix(term)}`;
}

/** Catalog key of the op's accessible name (`view.wordops.op.<op>`, or `root2` / `root3`). */
export function opNameKey(term: OpOf): `view.wordops.op.${OpKeySuffix}` {
  return `view.wordops.op.${opKeySuffix(term)}`;
}

/**
 * Non-colour cue per term role, next to the role colour (the role is also named in words for screen
 * readers): ◇ operand (an input), ○ intermediate, ■ constant, ↷ carry, ● result.
 */
export const TERM_ROLE_GLYPHS: Readonly<Record<WordTerm['role'], string>> = {
  operand: '◇',
  intermediate: '○',
  constant: '■',
  carry: '↷',
  result: '●',
};

/** Ops whose result is a rotation/shift mix, worth a bit strip (engineer lens). */
const BIT_STRIP_OPS: ReadonlySet<WordOp> = new Set<WordOp>(['rotr', 'rotl', 'shr', 'Sigma0', 'Sigma1', 'sigma0', 'sigma1']);

/** Bit strips only for 32-bit words: 64 cells per term would not fit a panel, so 64-bit stays hex only. */
export function showsBitStrip(term: Pick<WordTerm, 'op'>, wordBits: WordBits): boolean {
  return wordBits === 32 && term.op !== undefined && BIT_STRIP_OPS.has(term.op);
}

/** The word's bits MSB → LSB ("6a09…" → [false, true, true, false, …]). */
export function wordBitsOf(hex: string): boolean[] {
  return [...hex].flatMap((digit) => {
    const nibble = Number.parseInt(digit, 16);
    return [8, 4, 2, 1].map((weight) => (nibble & weight) !== 0);
  });
}

/** Bits per nibble (one hex digit). */
export const NIBBLE = 4;

/** Bits as 0/1 text grouped by nibble ("1010 0001"), so a screen reader reads short groups. */
export function nibbleGroups(bits: readonly boolean[]): string {
  return chunk(bits, NIBBLE)
    .map((nibble) => nibble.map((bit) => (bit ? '1' : '0')).join(''))
    .join(' ');
}

/** Term ids the story lens keeps besides the results: SHA-2's two temporaries. */
export const STORY_TERM_IDS: ReadonlySet<string> = new Set(['T1', 'T2']);

/**
 * Story-lens filter (data-driven): a term stays when its role is `result` or its id is one of
 * `STORY_TERM_IDS` (T1, T2). So a round shows T1, T2 (and any result), a schedule step only W_t.
 */
export function isStoryTerm(term: Pick<WordTerm, 'id' | 'role'>): boolean {
  return term.role === 'result' || STORY_TERM_IDS.has(term.id);
}

/**
 * The terms the story lens shows: for a v2 facet exactly those marked `emphasis: 'story'` (none when
 * none is, docs/M6.md §3b); for a v1 facet the structural `isStoryTerm` filter.
 */
export function storyTerms(schemaVersion: WordopsSchemaVersion, terms: readonly WordTerm[]): WordTerm[] {
  return schemaVersion === 1 ? terms.filter(isStoryTerm) : terms.filter((term) => term.emphasis === 'story');
}

/** What each lens shows. */
export interface LensParts {
  formula: boolean;
  bitStrips: boolean;
  storyTermsOnly: boolean;
}

export function lensParts(lens: Lens): LensParts {
  return { formula: lens === 'cryptographer', bitStrips: lens === 'engineer', storyTermsOnly: lens === 'story' };
}

/**
 * How one after-register gets its value: a copy of `from`; in the v1 SHA-2 shift `from` + T1 or
 * T1 + T2; in v2 the value of the step's term `term`.
 */
export type ShiftSource = 'copy' | 'plusT1' | 'sum' | 'term';

/** One labelled arrow of the register shift: `to ← from` (+ T1), `to ← T1 + T2`, or `to ← term`. */
export interface ShiftArrow {
  to: number;
  from?: number;
  /** The source term's id (`source: 'term'`). */
  term?: string;
  source: ShiftSource;
}

/** SHA-2 working variables a … h: a ← T1 + T2, e ← d + T1, every other register takes its left neighbour. */
const SHA2_REGISTER_COUNT = 8;
const SHA2_E = 4;

function sha2Arrow(to: number): ShiftArrow {
  if (to === 0) return { to, source: 'sum' };
  return { to, from: to - 1, source: to === SHA2_E ? 'plusT1' : 'copy' };
}

const SHA2_SHIFT: readonly ShiftArrow[] = Array.from({ length: SHA2_REGISTER_COUNT }, (_, to) => sha2Arrow(to));

/**
 * The SHA-2 register shift of a step, or `undefined` when the step is not a round. Decided by
 * structure: a round carries eight registers before and after plus the terms T1 and T2 (init and
 * feed-forward steps have no T1/T2, so they are drawn without arrows). That the producers' data
 * agrees with every arrow is a unit test on real round values, not a run-time check.
 */
export function sha2RegisterShift(wordopsStep: WordopsStep): readonly ShiftArrow[] | undefined {
  const { registers, terms } = wordopsStep;
  if (registers === undefined || registers.before.length !== SHA2_REGISTER_COUNT || registers.after.length !== SHA2_REGISTER_COUNT) return undefined;
  const hasTerm = (id: string) => terms.some((term) => term.id === id);
  return hasTerm('T1') && hasTerm('T2') ? SHA2_SHIFT : undefined;
}

/**
 * The register arrows of a step: a v2 facet draws its `transfers` (none without them); a v1 facet
 * keeps the structural SHA-2 detection (`sha2RegisterShift`) as the fallback.
 */
export function registerArrows(schemaVersion: WordopsSchemaVersion, wordopsStep: WordopsStep): readonly ShiftArrow[] | undefined {
  if (schemaVersion === 1) return sha2RegisterShift(wordopsStep);
  return wordopsStep.registers?.transfers?.map(({ to, from }): ShiftArrow => ('register' in from ? { to, from: from.register, source: 'copy' } : { to, term: from.term, source: 'term' }));
}

const DEFINITION = ' = ';

/** A term arrow's short text: the right-hand side of the (translated) term label "e (new) = d + T1" → "d + T1". */
export function arrowTermText(label: string): string {
  const at = label.lastIndexOf(DEFINITION);
  return (at < 0 ? label : label.slice(at + DEFINITION.length)).trim();
}
