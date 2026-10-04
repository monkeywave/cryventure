import {
  allIndices,
  i18nRef,
  RecordingTracer,
  scopeLevels,
  valueId,
  zeroSnapshot,
  type I18nRef,
  type RegionSpec,
  type StateFacet,
  type WordopsFacet,
  type WordopsStep,
  type WordTerm,
} from '@cryventure/core';
import type { ConstantSpec } from './constantSpecs.ts';
import type { Sha2ConstantId, Sha2ConstantsOpName } from './manifest.ts';
import { firstPrimes, rootWord, wordBytes, wordHex } from './primeRoots.ts';

/** Records the derivation of one SHA-2 constant table: one step per word, then a comparison with FIPS 180-4. */
export type ConstantsRegion = 'constants';
export type ConstantsOp = { op: Sha2ConstantsOpName };
export type ConstantsStateFacet = StateFacet<ConstantsRegion, ConstantsOp>;
type ConstantsTracer = RecordingTracer<ConstantsRegion, ConstantsOp>;

const NS = 'plugin.sha2-constants';

/** One derived word: the prime it comes from and the parts of its root. */
export interface DerivedWord {
  index: number;
  /** 1-based position of p among the primes (p = 23 is prime no. 9). */
  primeNumber: number;
  prime: number;
  integerPart: bigint;
  skipped: bigint;
  word: bigint;
}

/** Derives every word of `spec` with exact integer roots. */
export function deriveWords(spec: ConstantSpec): DerivedWord[] {
  const primes = firstPrimes(spec.firstPrime + spec.count).slice(spec.firstPrime);
  return primes.map((prime, index) => ({
    index,
    primeNumber: spec.firstPrime + index + 1,
    prime,
    ...rootWord(prime, spec.root, spec.bits, spec.skipBits),
  }));
}

/** The narration/formula variant: cube root, square root, or square root with skipped bits (SHA-224). */
function rootVariant(spec: ConstantSpec): 'Cube' | 'Square' | 'SquareSkip' {
  if (spec.root === 3) return 'Cube';
  return spec.skipBits > 0 ? 'SquareSkip' : 'Square';
}

/** One `words` region holding the table, blank until each word is derived. */
export function constantsRegions(spec: ConstantSpec): RegionSpec<ConstantsRegion>[] {
  const bytes = spec.bits / 8;
  return [
    {
      id: 'constants',
      labelKey: `${NS}.region.constants`,
      elem: 'u8',
      shape: [spec.count * bytes],
      layout: { kind: 'words', wordBytes: bytes, labelPrefix: spec.symbol, wordsPerGroup: Math.min(spec.count, 8) },
      initial: 'blank',
    },
  ];
}

/** Value id of the i-th derived word (the wordops term links to it). */
export function wordValueId(index: number): string {
  return valueId([index], 'word');
}

function wordParams(spec: ConstantSpec, derived: DerivedWord): Record<string, string | number> {
  const { bits, skipBits, symbol } = spec;
  return {
    n: derived.primeNumber,
    p: derived.prime,
    integer: derived.integerPart.toString(),
    ...(skipBits > 0 ? { skipped: wordHex(derived.skipped, skipBits) } : {}),
    word: wordHex(derived.word, bits),
    bits,
    symbol,
    index: derived.index,
  };
}

function wordTerms(spec: ConstantSpec, derived: DerivedWord): WordTerm[] {
  const { bits } = spec;
  const variant = spec.root === 3 ? 'Cube' : 'Square';
  const terms: WordTerm[] = [
    { id: 'p', label: i18nRef(`${NS}.term.prime`, { n: derived.primeNumber }), hex: wordHex(BigInt(derived.prime), bits), role: 'operand' },
    { id: 'integer', label: i18nRef(`${NS}.term.integer${variant}`, { p: derived.prime }), hex: wordHex(derived.integerPart, bits), role: 'intermediate', op: 'root' },
  ];
  if (spec.skipBits > 0) terms.push({ id: 'skipped', label: i18nRef(`${NS}.term.skipped`, { bits: spec.skipBits }), hex: wordHex(derived.skipped, bits), role: 'intermediate', op: 'root' });
  terms.push({ id: 'word', label: i18nRef(`${NS}.term.word`, { symbol: spec.symbol, index: derived.index }), hex: wordHex(derived.word, bits), role: 'result', op: 'root', valueRef: wordValueId(derived.index) });
  return terms;
}

function recordWord(tracer: ConstantsTracer, spec: ConstantSpec, derived: DerivedWord): WordopsStep {
  const bytes = spec.bits / 8;
  const offset = derived.index * bytes;
  const params = wordParams(spec, derived);
  const variant = rootVariant(spec);
  const step = tracer.stepCount;
  tracer.enter();
  tracer.step({
    op: 'word',
    writes: [{ region: 'constants', offset, values: wordBytes(derived.word, spec.bits) }],
    highlights: [{ region: 'constants', indices: allIndices(bytes).map((i) => offset + i), kind: 'write' }],
    narration: i18nRef(`${NS}.step.word${variant}`, params),
  });
  tracer.leave();
  return { step, formula: i18nRef(`${NS}.math.word${variant}`, { symbol: spec.symbol, index: derived.index, p: derived.prime, bits: spec.bits }), terms: wordTerms(spec, derived) };
}

/** Indices of the words that differ from the FIPS table (empty when the derivation reproduces it). */
export function mismatchedWords(derived: readonly string[], fips: readonly string[]): number[] {
  const length = Math.max(derived.length, fips.length);
  return allIndices(length).filter((index) => derived[index] !== fips[index]);
}

function recordCompare(tracer: ConstantsTracer, spec: ConstantSpec, mismatches: number[]): void {
  const matches = mismatches.length === 0;
  const params = { count: spec.count, section: spec.section, ...(matches ? {} : { mismatches: mismatches.length }) };
  tracer.enter();
  tracer.step({
    op: 'compare',
    writes: [],
    highlights: [{ region: 'constants', indices: allIndices(spec.count * (spec.bits / 8)), kind: 'read' }],
    narration: i18nRef(`${NS}.step.${matches ? 'compareMatch' : 'compareMismatch'}`, params),
  });
  tracer.leave();
}

export interface ConstantsRecording {
  state: ConstantsStateFacet;
  wordops: WordopsFacet;
  words: DerivedWord[];
  /** The derived words as lowercase hex, in order. */
  hexWords: string[];
  /** Indices of words that differ from FIPS 180-4 (empty = the table is reproduced). */
  mismatches: number[];
}

function initialNarration(id: Sha2ConstantId, spec: ConstantSpec): I18nRef {
  return i18nRef(`${NS}.step.initial.${id}`, { section: spec.section });
}

/** Records every word of table `id` (one step each), then the comparison with `fips`. */
export function recordConstants(id: Sha2ConstantId, spec: ConstantSpec, fips: readonly string[]): ConstantsRecording {
  const regions = constantsRegions(spec);
  const tracer: ConstantsTracer = new RecordingTracer<ConstantsRegion, ConstantsOp>(regions, zeroSnapshot(regions), { initialNarration: initialNarration(id, spec) });
  const words = deriveWords(spec);
  const steps = words.map((derived) => recordWord(tracer, spec, derived));
  const hexWords = words.map((derived) => wordHex(derived.word, spec.bits));
  const mismatches = mismatchedWords(hexWords, fips);
  recordCompare(tracer, spec, mismatches);
  const state: ConstantsStateFacet = { ...tracer.toFacet(), scopeLevels: scopeLevels(NS, 'step') };
  return { state, wordops: { kind: 'wordops', schemaVersion: 1, wordBits: spec.bits, steps }, words, hexWords, mismatches };
}
