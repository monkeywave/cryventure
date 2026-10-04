import type { Lens, WordBits, WordOp, WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { latestStepAt } from '../_lib/latestStepAt.ts';

/**
 * Pure helpers of the wordops view: step lookup at the playhead, hex chunking, bit strips, the
 * story-lens term filter and the SHA-2 register shift. No React, no i18n: the component translates.
 */

/** The latest wordops step whose `step ≤ step`, or `undefined` before the first (as `mathStepAt`). */
export function wordopsStepAt(facet: WordopsFacet, step: number): WordopsStep | undefined {
  return latestStepAt(facet.steps, step);
}

const HEX_CHUNK = 4;

/** A hex word in 4-digit chunks, lowercase: "6a09e667" → ["6a09", "e667"]. */
export function hexChunks(hex: string): string[] {
  const lower = hex.toLowerCase();
  const chunks: string[] = [];
  for (let start = 0; start < lower.length; start += HEX_CHUNK) chunks.push(lower.slice(start, start + HEX_CHUNK));
  return chunks;
}

/** Visible operator glyph per op; the accessible name comes from `view.wordops.op.<op>`. */
export const OP_GLYPHS: Readonly<Record<WordOp, string>> = {
  rotr: 'ROTR',
  rotl: 'ROTL',
  shr: 'SHR',
  xor: '⊕',
  and: '∧',
  not: '¬',
  add: '+',
  ch: 'Ch',
  maj: 'Maj',
  Sigma0: 'Σ0',
  Sigma1: 'Σ1',
  sigma0: 'σ0',
  sigma1: 'σ1',
  /* Neutral: the facet has no root degree (square for IVs, cube for K); the term label names the root. */
  root: 'ⁿ√',
};

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

const NIBBLE = 4;

/** Bits as 0/1 text grouped by nibble ("1010 0001"), so a screen reader reads short groups. */
export function nibbleGroups(bits: readonly boolean[]): string {
  const groups: string[] = [];
  for (let start = 0; start < bits.length; start += NIBBLE) groups.push(bits.slice(start, start + NIBBLE).map((bit) => (bit ? '1' : '0')).join(''));
  return groups.join(' ');
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

/** What each lens shows. */
export interface LensParts {
  formula: boolean;
  bitStrips: boolean;
  storyTermsOnly: boolean;
}

export function lensParts(lens: Lens): LensParts {
  return { formula: lens === 'cryptographer', bitStrips: lens === 'engineer', storyTermsOnly: lens === 'story' };
}

/** How one after-register gets its value in the SHA-2 shift. */
export type ShiftSource = 'copy' | 'plusT1' | 'sum';

/** One labelled arrow of the register shift: `to ← from` (+ T1), or `to ← T1 + T2` (`from` undefined). */
export interface ShiftArrow {
  to: number;
  from?: number;
  source: ShiftSource;
}

/** SHA-2 working variables a … h: a ← T1 + T2, e ← d + T1, every other register takes its left neighbour. */
const SHA2_REGISTER_COUNT = 8;
const SHA2_E = 4;

function sha2Arrow(to: number): ShiftArrow {
  if (to === 0) return { to, source: 'sum' };
  return { to, from: to - 1, source: to === SHA2_E ? 'plusT1' : 'copy' };
}

function addWords(left: string, right: string, wordBits: WordBits): bigint {
  const modulus = BigInt(2) ** BigInt(wordBits);
  return (BigInt(`0x${left}`) + BigInt(`0x${right}`)) % modulus;
}

function arrowHolds(arrow: ShiftArrow, before: readonly string[], after: readonly string[], temps: { t1: string; t2: string }, wordBits: WordBits): boolean {
  const target = BigInt(`0x${after[arrow.to]}`);
  if (arrow.source === 'sum') return addWords(temps.t1, temps.t2, wordBits) === target;
  const from = before[arrow.from!]!;
  if (arrow.source === 'plusT1') return addWords(from, temps.t1, wordBits) === target;
  return BigInt(`0x${from}`) === target;
}

/**
 * The SHA-2 register shift of a step, or `undefined` when the step is not a round: it needs eight
 * registers, terms T1 and T2, and the data must agree with every arrow (so init and feed-forward
 * steps, which also carry registers, are drawn without arrows).
 */
export function sha2RegisterShift(wordopsStep: WordopsStep, wordBits: WordBits): ShiftArrow[] | undefined {
  const registers = wordopsStep.registers;
  if (registers === undefined || registers.before.length !== SHA2_REGISTER_COUNT || registers.after.length !== SHA2_REGISTER_COUNT) return undefined;
  const t1 = wordopsStep.terms.find((term) => term.id === 'T1')?.hex;
  const t2 = wordopsStep.terms.find((term) => term.id === 'T2')?.hex;
  if (t1 === undefined || t2 === undefined) return undefined;
  const arrows = Array.from({ length: SHA2_REGISTER_COUNT }, (_, to) => sha2Arrow(to));
  return arrows.every((arrow) => arrowHolds(arrow, registers.before, registers.after, { t1, t2 }, wordBits)) ? arrows : undefined;
}
