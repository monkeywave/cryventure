import type { I18nRef } from '../i18n.ts';
import type { MathTermRole } from './math.ts';
import { describeValue, i18nRefProblems, INITIAL_STEP_INDEX, isIndex, isLowerHex, isPlainRecord, isStepIndex, kindProblems, stepCountProblems } from './validation.ts';

/**
 * Wordops facet: per-step 32/64-bit word equations (SHA-2, SHA-1, MD5, BLAKE2; later ChaCha),
 * docs/M5.md §3 and, for schema v2, docs/M6.md §3b. The math facet stays GF(2^8)-specific. Words are
 * lowercase big-endian hex strings, so 64-bit values never pass through `number`.
 */

/** How a term enters the computation. `or`, `parity`, `md5G` and `md5I` need schema v2. */
export type WordOp =
  | 'rotr'
  | 'rotl'
  | 'shr'
  | 'xor'
  | 'and'
  | 'not'
  | 'add'
  | 'ch'
  | 'maj'
  | 'Sigma0'
  | 'Sigma1'
  | 'sigma0'
  | 'sigma1'
  | 'root'
  | 'or'
  | 'parity'
  | 'md5G'
  | 'md5I';

export type WordBits = 32 | 64;

/** 1 = docs/M5.md §3; 2 adds the fields marked "v2" below (docs/M6.md §3b). */
export type WordopsSchemaVersion = 1 | 2;

export interface WordTerm {
  /** Stable within the step, e.g. 'Sigma1', 'T1', 'p1'. */
  id: string;
  label: I18nRef;
  /** Exactly `wordBits / 4` lowercase hex digits, big-endian. */
  hex: string;
  role: MathTermRole;
  op?: WordOp;
  valueRef?: string;
  /** v2: the story lens shows only the terms marked `story` (none when no term is). */
  emphasis?: 'story';
  /** v2, only with `op: 'root'`: square (2) or cube (3) root; the view writes √ or ∛. */
  degree?: 2 | 3;
}

/** Where `after[to]` comes from: `before[register]`, or the value of the step's term `term`. */
export type RegisterSource = { register: number } | { term: string };

/** v2: one register written by the step. */
export interface RegisterTransfer {
  to: number;
  from: RegisterSource;
}

/** Working registers around a step, as hex words; only with `registerNames`, same length. */
export interface WordopsRegisters {
  before: string[];
  after: string[];
  /** v2: register indices the step reads and writes (e.g. the BLAKE2 column or diagonal). */
  touched?: number[];
  /** v2: how `after` comes about; replaces the view's structural shift detection. */
  transfers?: RegisterTransfer[];
}

export interface WordopsStep {
  /** State-facet step index, or −1 for the initial state. */
  step: number;
  formula: I18nRef;
  terms: WordTerm[];
  registers?: WordopsRegisters;
}

export interface WordopsFacet {
  kind: 'wordops';
  schemaVersion: WordopsSchemaVersion;
  wordBits: WordBits;
  /** Register names for `registers`, e.g. ['a', …, 'h']. */
  registerNames?: string[];
  /** v2: draw the registers as a grid of this many columns (e.g. 4 for the BLAKE2 4 × 4 matrix). */
  registerColumns?: number;
  /** Strictly increasing `step` (the first may be −1, the initial state). */
  steps: WordopsStep[];
}

/** Every `WordOp` with the schema version that introduced it; the `Record` makes a missing op a type error. */
const OP_SINCE: Record<WordOp, WordopsSchemaVersion> = {
  rotr: 1,
  rotl: 1,
  shr: 1,
  xor: 1,
  and: 1,
  not: 1,
  add: 1,
  ch: 1,
  maj: 1,
  Sigma0: 1,
  Sigma1: 1,
  sigma0: 1,
  sigma1: 1,
  root: 1,
  or: 2,
  parity: 2,
  md5G: 2,
  md5I: 2,
};

const TERM_ROLES: Record<MathTermRole, true> = { operand: true, intermediate: true, constant: true, carry: true, result: true };

/** Every `WordOp` (for contract checks and views; no duplicates elsewhere). */
export const WORD_OPS: readonly WordOp[] = Object.keys(OP_SINCE) as WordOp[];

/** Every role a `WordTerm` may have (the `MathTermRole`s). */
export const WORD_TERM_ROLES: readonly MathTermRole[] = Object.keys(TERM_ROLES) as MathTermRole[];

export function isWordOp(value: unknown): value is WordOp {
  return typeof value === 'string' && Object.hasOwn(OP_SINCE, value);
}

export function isWordTermRole(value: unknown): value is MathTermRole {
  return typeof value === 'string' && Object.hasOwn(TERM_ROLES, value);
}

const WORD_BITS: readonly unknown[] = [32, 64];
const SCHEMA_VERSIONS: readonly unknown[] = [1, 2];

/** What every step check needs from the facet. */
interface FacetContext {
  version: WordopsSchemaVersion;
  digits: number;
  /** Undefined when absent or malformed (the facet-level check reports which). */
  registerNames: readonly string[] | undefined;
}

const hexProblem = (where: string, hex: unknown, digits: number): string[] => (isLowerHex(hex, digits) ? [] : [`${where} "${describeValue(hex)}" is not ${digits} lowercase hex digits`]);

/** `field` present on a v1 facet. */
const v2Problem = (where: string, field: string, value: unknown, version: WordopsSchemaVersion): string[] => (value !== undefined && version < 2 ? [`${where}: ${field} needs schemaVersion 2`] : []);

function opProblems(op: unknown, where: string, version: WordopsSchemaVersion): string[] {
  if (op === undefined) return [];
  if (!isWordOp(op)) return [`${where}: op "${describeValue(op)}" is not a WordOp`];
  return OP_SINCE[op] > version ? [`${where}: op "${op}" needs schemaVersion 2`] : [];
}

function termV2Problems(term: Record<string, unknown>, where: string, version: WordopsSchemaVersion): string[] {
  const { emphasis, degree, op } = term;
  const problems = [...v2Problem(where, 'emphasis', emphasis, version), ...v2Problem(where, 'degree', degree, version)];
  if (emphasis !== undefined && emphasis !== 'story') problems.push(`${where}: emphasis "${describeValue(emphasis)}" is not "story"`);
  if (degree !== undefined && degree !== 2 && degree !== 3) problems.push(`${where}: degree ${describeValue(degree)} is not 2 or 3`);
  if (degree !== undefined && op !== 'root') problems.push(`${where}: degree needs op "root"`);
  return problems;
}

function termProblems(term: unknown, index: number, stepWhere: string, context: FacetContext): string[] {
  if (!isPlainRecord(term)) return [`${stepWhere} term ${index}: not an object`];
  const hasId = typeof term.id === 'string' && term.id !== '';
  const where = hasId ? `${stepWhere} term "${term.id as string}"` : `${stepWhere} term ${index}`;
  return [
    ...(hasId ? [] : [`${where}: id is not a non-empty string`]),
    ...i18nRefProblems(term.label, `${where} label`),
    ...hexProblem(`${where}: hex`, term.hex, context.digits),
    ...(isWordTermRole(term.role) ? [] : [`${where}: role "${describeValue(term.role)}" is not a MathTermRole`]),
    ...opProblems(term.op, where, context.version),
    ...termV2Problems(term, where, context.version),
  ];
}

function termListProblems(terms: unknown, where: string, context: FacetContext): string[] {
  if (!Array.isArray(terms)) return [`${where}: terms is not an array`];
  const ids = new Set<unknown>();
  return terms.flatMap((term: unknown, index) => {
    const duplicate = isPlainRecord(term) && typeof term.id === 'string' && ids.has(term.id) ? [`${where} term "${term.id}": duplicate id`] : [];
    if (isPlainRecord(term)) ids.add(term.id);
    return [...duplicate, ...termProblems(term, index, where, context)];
  });
}

/** `before` or `after`: an array of `registerNames.length` words. */
function registerSideProblems(words: unknown, side: 'before' | 'after', where: string, context: FacetContext, count: number): string[] {
  if (!Array.isArray(words)) return [`${where}: registers.${side} is not an array`];
  const problems = words.length === count ? [] : [`${where}: registers.${side} has ${words.length} words, expected ${count}`];
  return [...problems, ...words.flatMap((word: unknown, index) => hexProblem(`${where}: registers.${side}[${index}]`, word, context.digits))];
}

function touchedProblems(touched: unknown, where: string, count: number): string[] {
  if (touched === undefined) return [];
  if (!Array.isArray(touched)) return [`${where}: registers.touched is not an array`];
  const bad = touched.filter((index: unknown) => typeof index !== 'number' || !isIndex(index, count));
  const problems = bad.map((index: unknown) => `${where}: registers.touched ${describeValue(index)} is not a register index`);
  return new Set(touched).size === touched.length ? problems : [...problems, `${where}: registers.touched has duplicates`];
}

/** The hex value a transfer source names, if the source is well-formed and resolvable. */
type SourceValue = { problems: string[]; hex?: unknown };

function sourceValue(from: unknown, at: string, step: Record<string, unknown>, before: unknown, count: number): SourceValue {
  if (isPlainRecord(from) && 'register' in from && 'term' in from) return { problems: [`${at}: from has both register and term`] };
  if (isPlainRecord(from) && 'register' in from) {
    const { register } = from;
    if (typeof register !== 'number' || !isIndex(register, count)) return { problems: [`${at}: from.register ${describeValue(register)} is not a register index`] };
    return { problems: [], hex: Array.isArray(before) ? (before as unknown[])[register] : undefined };
  }
  if (isPlainRecord(from) && typeof from.term === 'string') {
    const terms = Array.isArray(step.terms) ? (step.terms as unknown[]) : [];
    const term = terms.find((candidate) => isPlainRecord(candidate) && candidate.id === from.term);
    return isPlainRecord(term) ? { problems: [], hex: term.hex } : { problems: [`${at}: from.term "${from.term}" is not a term of the step`] };
  }
  return { problems: [`${at}: from is neither { register } nor { term }`] };
}

function transferProblems(transfer: unknown, index: number, where: string, step: Record<string, unknown>, registers: Record<string, unknown>, count: number): string[] {
  const at = `${where}: registers.transfers[${index}]`;
  if (!isPlainRecord(transfer)) return [`${at}: not an object`];
  const { to } = transfer;
  const toValid = typeof to === 'number' && isIndex(to, count);
  const source = sourceValue(transfer.from, at, step, registers.before, count);
  const problems = [...(toValid ? [] : [`${at}: to ${describeValue(to)} is not a register index`]), ...source.problems];
  if (!toValid || source.problems.length > 0 || !Array.isArray(registers.after)) return problems;
  const written: unknown = (registers.after as unknown[])[to];
  const agrees = typeof written === 'string' && written === source.hex;
  return agrees ? problems : [...problems, `${at}: after[${to}] "${describeValue(written)}" is not the source value "${describeValue(source.hex)}"`];
}

function transfersProblems(transfers: unknown, where: string, step: Record<string, unknown>, registers: Record<string, unknown>, count: number): string[] {
  if (transfers === undefined) return [];
  if (!Array.isArray(transfers)) return [`${where}: registers.transfers is not an array`];
  const targets = transfers.map((transfer: unknown) => (isPlainRecord(transfer) ? transfer.to : undefined)).filter((to) => typeof to === 'number');
  const duplicates = [...new Set(targets.filter((to, index) => targets.indexOf(to) !== index))].map((to) => `${where}: registers.transfers writes register ${to} twice`);
  return [...transfers.flatMap((transfer: unknown, index) => transferProblems(transfer, index, where, step, registers, count)), ...duplicates];
}

function registerProblems(step: Record<string, unknown>, where: string, context: FacetContext): string[] {
  const { registers } = step;
  if (registers === undefined) return [];
  if (context.registerNames === undefined) return [`${where}: registers without registerNames`];
  if (!isPlainRecord(registers)) return [`${where}: registers is not an object`];
  const count = context.registerNames.length;
  return [
    ...registerSideProblems(registers.before, 'before', where, context, count),
    ...registerSideProblems(registers.after, 'after', where, context, count),
    ...v2Problem(where, 'registers.touched', registers.touched, context.version),
    ...v2Problem(where, 'registers.transfers', registers.transfers, context.version),
    ...touchedProblems(registers.touched, where, count),
    ...transfersProblems(registers.transfers, where, step, registers, count),
  ];
}

function stepIndexProblems(step: unknown, previous: unknown, stepCount: number | undefined): string[] {
  if (typeof step !== 'number') return [`wordops: step ${describeValue(step)} is not an integer ≥ ${INITIAL_STEP_INDEX}`];
  const problems: string[] = [];
  if (!isStepIndex(step)) problems.push(`wordops: step ${step} is not an integer ≥ ${INITIAL_STEP_INDEX}`);
  if (typeof previous === 'number' && step <= previous) problems.push(`wordops: step ${step} does not increase (after ${previous})`);
  if (stepCount !== undefined && step > stepCount - 1) problems.push(`wordops: step ${step} outside ${INITIAL_STEP_INDEX}..${stepCount - 1}`);
  return problems;
}

function stepProblems(step: unknown, index: number, previous: unknown, context: FacetContext, stepCount: number | undefined): string[] {
  if (!isPlainRecord(step)) return [`wordops steps[${index}]: not an object`];
  const where = `wordops step ${describeValue(step.step)}`;
  return [
    ...stepIndexProblems(step.step, isPlainRecord(previous) ? previous.step : undefined, stepCount),
    ...i18nRefProblems(step.formula, `${where} formula`),
    ...termListProblems(step.terms, where, context),
    ...registerProblems(step, where, context),
  ];
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

function registerLayoutProblems(facet: Record<string, unknown>, version: WordopsSchemaVersion): string[] {
  const { registerNames, registerColumns } = facet;
  const problems = registerNames === undefined || isStringArray(registerNames) ? [] : ['wordops: registerNames is not an array of strings'];
  if (registerColumns === undefined) return problems;
  problems.push(...v2Problem('wordops', 'registerColumns', registerColumns, version));
  if (typeof registerColumns !== 'number' || !Number.isInteger(registerColumns) || registerColumns <= 0) problems.push(`wordops: registerColumns ${describeValue(registerColumns)} is not a positive integer`);
  if (registerNames === undefined) problems.push('wordops: registerColumns without registerNames');
  return problems;
}

/**
 * Schema problems of a wordops facet (empty = valid); never throws, whatever `facet` is.
 * `schemaVersion` ∈ {1, 2} and the v2 fields (`emphasis`, `degree`, `registerColumns`,
 * `registers.touched`, `registers.transfers`, the v2 ops) only with 2; `wordBits` ∈ {32, 64}; every
 * word has `wordBits / 4` lowercase hex digits; term ids non-empty and unique per step, `role` a
 * `MathTermRole`, `op` a `WordOp`, `degree` only with `op: 'root'`; steps strictly increasing (and
 * in −1..stepCount−1 when `stepCount` is given); `registers` only with `registerNames`, of that
 * length; `touched` unique register indices; `transfers` with register indices, unique `to`, an
 * existing source term, and `after[to]` equal to the source's value; well-formed I18nRefs.
 */
export function validateWordopsFacet(facet: unknown, stepCount?: number): string[] {
  if (!isPlainRecord(facet)) return ['wordops: facet is not an object'];
  const precondition = [...kindProblems(facet, 'wordops'), ...stepCountProblems(stepCount, 'wordops')];
  if (precondition.length > 0) return precondition;
  const { schemaVersion, wordBits, steps } = facet;
  if (!SCHEMA_VERSIONS.includes(schemaVersion)) return [`wordops: schemaVersion ${describeValue(schemaVersion)} is not 1 or 2`];
  if (!WORD_BITS.includes(wordBits)) return [`wordops: wordBits ${describeValue(wordBits)} is not 32 or 64`];
  if (!Array.isArray(steps)) return ['wordops: steps is not an array'];
  const version = schemaVersion as WordopsSchemaVersion;
  const registerNames = isStringArray(facet.registerNames) ? facet.registerNames : undefined;
  const context: FacetContext = { version, digits: (wordBits as WordBits) / 4, registerNames };
  return [
    ...registerLayoutProblems(facet, version),
    ...steps.flatMap((step: unknown, index) => stepProblems(step, index, steps[index - 1], context, stepCount)),
  ];
}
