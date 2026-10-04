import type { I18nRef } from '../i18n.ts';
import type { MathTermRole } from './math.ts';
import { INITIAL_STEP_INDEX, isStepIndex } from './validation.ts';

/**
 * Wordops facet: per-step 32/64-bit word equations (SHA-2 now; later ARX and Boolean-function
 * designs such as SHA-1, MD5, BLAKE2, ChaCha), docs/M5.md §3. The math facet stays GF(2^8)-specific.
 * Words are lowercase big-endian hex strings, so 64-bit values never pass through `number`.
 */

/** How a term enters the computation. */
export type WordOp = 'rotr' | 'rotl' | 'shr' | 'xor' | 'and' | 'not' | 'add' | 'ch' | 'maj' | 'Sigma0' | 'Sigma1' | 'sigma0' | 'sigma1' | 'root';

export type WordBits = 32 | 64;

export interface WordTerm {
  /** Stable within the step, e.g. 'Sigma1', 'T1', 'p1'. */
  id: string;
  label: I18nRef;
  /** Exactly `wordBits / 4` lowercase hex digits, big-endian. */
  hex: string;
  role: MathTermRole;
  op?: WordOp;
  valueRef?: string;
}

export interface WordopsStep {
  /** State-facet step index, or −1 for the initial state. */
  step: number;
  formula: I18nRef;
  terms: WordTerm[];
  /** Working registers around the step, as hex words; only with `registerNames`, same length. */
  registers?: { before: string[]; after: string[] };
}

export interface WordopsFacet {
  kind: 'wordops';
  schemaVersion: 1;
  wordBits: WordBits;
  /** Register names for `registers`, e.g. ['a', …, 'h']. */
  registerNames?: string[];
  /** Strictly increasing `step` (the first may be −1, the initial state). */
  steps: WordopsStep[];
}

const WORD_BITS: readonly number[] = [32, 64];

function isWordHex(hex: unknown, digits: number): boolean {
  return typeof hex === 'string' && hex.length === digits && /^[0-9a-f]*$/.test(hex);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `ref` is an `I18nRef`: a non-empty `key`, and `params` (if any) a record of strings and numbers. */
function isWellFormedI18nRef(ref: unknown): boolean {
  if (!isPlainRecord(ref) || typeof ref.key !== 'string' || ref.key === '') return false;
  if (ref.params === undefined) return true;
  return isPlainRecord(ref.params) && Object.values(ref.params).every((value) => typeof value === 'string' || typeof value === 'number');
}

function refProblems(ref: unknown, where: string): string[] {
  return isWellFormedI18nRef(ref) ? [] : [`${where}: not a well-formed I18nRef`];
}

function termProblems(term: WordTerm, where: string, digits: number): string[] {
  const problems = refProblems(term.label, `${where} label`);
  if (!isWordHex(term.hex, digits)) problems.push(`${where}: hex "${term.hex}" is not ${digits} lowercase hex digits`);
  return problems;
}

function registerProblems(step: WordopsStep, registerNames: string[] | undefined, digits: number): string[] {
  if (step.registers === undefined) return [];
  const where = `wordops step ${step.step}`;
  if (registerNames === undefined) return [`${where}: registers without registerNames`];
  const problems: string[] = [];
  for (const side of ['before', 'after'] as const) {
    const words = step.registers[side];
    if (words.length !== registerNames.length) problems.push(`${where}: registers.${side} has ${words.length} words, expected ${registerNames.length}`);
    words.forEach((word, index) => {
      if (!isWordHex(word, digits)) problems.push(`${where}: registers.${side}[${index}] "${word}" is not ${digits} lowercase hex digits`);
    });
  }
  return problems;
}

function stepIndexProblems(step: number, previous: number | undefined, stepCount: number | undefined): string[] {
  const problems: string[] = [];
  if (!isStepIndex(step)) problems.push(`wordops: step ${step} is not an integer ≥ ${INITIAL_STEP_INDEX}`);
  if (previous !== undefined && step <= previous) problems.push(`wordops: step ${step} does not increase (after ${previous})`);
  if (stepCount !== undefined && step > stepCount - 1) problems.push(`wordops: step ${step} outside ${INITIAL_STEP_INDEX}..${stepCount - 1}`);
  return problems;
}

function termListProblems(step: WordopsStep, digits: number): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const term of step.terms) {
    const where = `wordops step ${step.step} term "${term.id}"`;
    if (ids.has(term.id)) problems.push(`${where}: duplicate id`);
    ids.add(term.id);
    problems.push(...termProblems(term, where, digits));
  }
  return problems;
}

/**
 * Schema problems of a wordops facet (empty = valid): `wordBits` ∈ {32, 64}; every word has
 * `wordBits / 4` lowercase hex digits; term ids unique per step; steps strictly increasing (and in
 * −1..stepCount−1 when `stepCount` is given); `registers` only with `registerNames`, of that
 * length; well-formed I18nRefs.
 */
export function validateWordopsFacet(facet: WordopsFacet, stepCount?: number): string[] {
  if (!WORD_BITS.includes(facet.wordBits)) return [`wordops: wordBits ${facet.wordBits} is not 32 or 64`];
  const digits = facet.wordBits / 4;
  return facet.steps.flatMap((step, index) => [
    ...stepIndexProblems(step.step, facet.steps[index - 1]?.step, stepCount),
    ...refProblems(step.formula, `wordops step ${step.step} formula`),
    ...termListProblems(step, digits),
    ...registerProblems(step, facet.registerNames, digits),
  ]);
}
