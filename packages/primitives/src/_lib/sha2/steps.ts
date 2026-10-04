import { allIndices, blockIndices, highlight, i18nRef, toHex, valueId, type Highlight, type I18nRef, type TranslateParams } from '@cryventure/core';
import type { Sha2Algorithm, Sha2IvGeneration } from './algorithms.ts';
import type { BlockDetail, RoundDetail, ScheduleDetail } from './compress.ts';
import type { Sha2OpName } from './manifestKit.ts';
import type { Sha2Padding } from './padding.ts';
import { SHA2_REGISTER_NAMES, wordIndices, type Sha2Region } from './regions.ts';
import { ROUND_TRANSFERS, roundTerms, scheduleTerms, termFactory, type RoundTermOptions, type TermFactory } from './wordTerms.ts';
import { wordsHex, wordsToBytes, type Word, type WordArith } from './words.ts';
import type { WordopsRecorder } from './wordopsRecorder.ts';

/**
 * The recorded SHA-2 ops (docs/M5.md §2c) are `SHA2_OP_NAMES` of `manifestKit.ts` (the manifests
 * declare their labels from the same list). Narration and wordops keys live under the producer's
 * namespace, so `sha256` and `sha512` share this code with their own catalogs.
 */
export { SHA2_OP_NAMES, type Sha2OpName } from './manifestKit.ts';
export type Sha2Recorder = WordopsRecorder<Sha2Region, { op: Sha2OpName }>;

/** Per-producer trace choices: which optional round terms to emit (`hKW` for `sha512`). */
export type Sha2TraceOptions = RoundTermOptions;

/** What every step recorder needs: the namespace, the algorithm, the recorder, its term factory and the options. */
export interface Sha2Trace<W extends Word> {
  ns: string;
  algorithm: Sha2Algorithm<W>;
  recorder: Sha2Recorder;
  term: TermFactory<W>;
  options: Sha2TraceOptions;
}

export function sha2Trace<W extends Word>(ns: string, algorithm: Sha2Algorithm<W>, recorder: Sha2Recorder, options: Sha2TraceOptions = {}): Sha2Trace<W> {
  return { ns, algorithm, recorder, term: termFactory(ns, algorithm.params.arith), options };
}

const arithOf = <W extends Word>(trace: Sha2Trace<W>): WordArith<W> => trace.algorithm.params.arith;

/**
 * The narration of a step that names the algorithm (the intro, the first `init`, the `output`):
 * `<ns>.step.<step>` with the algorithm's name, or `<ns>.step.<step>IvGeneration` for the SHA-512/t
 * IV generation function (§5.3.6), whose texts name the generator themselves and may add
 * `ivGenerationParams` (e.g. how H(0)″ is formed).
 */
function algorithmNarration<W extends Word>(
  ns: string,
  algorithm: Sha2Algorithm<W>,
  step: string,
  params: TranslateParams,
  ivGenerationParams: (generation: Sha2IvGeneration<W>) => TranslateParams = () => ({}),
): I18nRef {
  const { ivGeneration } = algorithm;
  if (ivGeneration === undefined) return i18nRef(`${ns}.step.${step}`, { algorithm: algorithm.name, ...params });
  return i18nRef(`${ns}.step.${step}IvGeneration`, { ...params, ...ivGenerationParams(ivGeneration) });
}

/** The intro (initial snapshot) of a run over `messageBytes` bytes. */
export function sha2InitialNarration<W extends Word>(ns: string, algorithm: Sha2Algorithm<W>, messageBytes: number): I18nRef {
  const { blockBytes, rounds } = algorithm.params;
  return algorithmNarration(ns, algorithm, 'initial', { bytes: messageBytes, bits: algorithm.outputSize * 8, blockBits: blockBytes * 8, rounds });
}

/** The value id of the chaining value H^(n) (`h/<n>`, n ≥ 1); H^(0) is the value `iv`. */
export function chainingValueId(n: number): string {
  return n === 0 ? 'iv' : valueId(['h'], String(n));
}

/** §5.1: the padded message, written once before block 0. */
export function recordPad<W extends Word>(trace: Sha2Trace<W>, messageBytes: number, padding: Sha2Padding): number {
  const { padded, zeroBytes, lengthBytes, messageBits } = padding;
  const blockBytes = trace.algorithm.params.blockBytes;
  return trace.recorder.op({
    op: 'pad',
    writes: [{ region: 'padded', offset: 0, values: Array.from(padded) }],
    highlights: [...(messageBytes > 0 ? [highlight<Sha2Region>('message', 'read', allIndices(messageBytes))] : []), highlight('padded', 'write', allIndices(padded.length))],
    narration: i18nRef(`${trace.ns}.step.pad`, { bytes: messageBytes, zeros: zeroBytes, lengthBits: lengthBytes * 8, bits: messageBits, count: padded.length / blockBytes, blockBytes }),
  });
}

function initHighlights(wordBytes: number, blockIndex: number, blockBytes: number): Highlight<Sha2Region>[] {
  return [
    // Every block of the padded message is whole, so no length caps the range.
    highlight('padded', 'read', blockIndices(blockIndex, blockBytes, Number.POSITIVE_INFINITY)),
    highlight('w', 'write', wordIndices(wordBytes, 0, 16)),
    highlight('vars', 'write', wordIndices(wordBytes, 0, 8)),
    highlight('h', blockIndex === 0 ? 'write' : 'read', wordIndices(wordBytes, 0, 8)),
  ];
}

function initTerms<W extends Word>(trace: Sha2Trace<W>, blockIndex: number, block: BlockDetail<W>) {
  const valueRef = chainingValueId(blockIndex);
  const registers = block.hIn.map((word, j) => trace.term(SHA2_REGISTER_NAMES[j]!, 'register', word, 'operand', { params: { reg: SHA2_REGISTER_NAMES[j]!, j, prev: blockIndex }, valueRef }));
  const words = block.schedule.slice(0, 16).map((word, j) => trace.term(`w${j}`, 'message', word, 'operand', { params: { j, n: blockIndex + 1 } }));
  return [...registers, ...words];
}

/** Block n: (block 1 only: H ← H(0)); a … h ← H; W_0 … W_15 ← the block's words. */
export function recordInit<W extends Word>(trace: Sha2Trace<W>, blockIndex: number, block: BlockDetail<W>): number {
  const arith = arithOf(trace);
  const hBytes = wordsToBytes(arith, block.hIn);
  const n = blockIndex + 1;
  const h = wordsHex(arith, block.hIn);
  const narration =
    blockIndex === 0
      ? algorithmNarration(trace.ns, trace.algorithm, 'initFirst', { h }, ({ base, mask }) => ({ base: wordsHex(arith, base), mask: arith.toHex(mask) }))
      : i18nRef(`${trace.ns}.step.init`, { n, prev: blockIndex, h });
  return trace.recorder.op(
    {
      op: 'init',
      writes: [...(blockIndex === 0 ? [{ region: 'h' as const, offset: 0, values: hBytes }] : []), { region: 'vars', offset: 0, values: hBytes }, { region: 'w', offset: 0, values: wordsToBytes(arith, block.schedule.slice(0, 16)) }],
      highlights: initHighlights(arith.bytes, blockIndex, trace.algorithm.params.blockBytes),
      narration,
    },
    { formula: i18nRef(`${trace.ns}.formula.init`, { n, prev: blockIndex }), terms: initTerms(trace, blockIndex, block) },
  );
}

/** W_t = σ1(W_{t−2}) + W_{t−7} + σ0(W_{t−15}) + W_{t−16} (§6.2.2 / §6.4.2 step 1). */
export function recordSchedule<W extends Word>(trace: Sha2Trace<W>, schedule: ScheduleDetail<W>): number {
  const arith = arithOf(trace);
  const { t } = schedule;
  const hex = (word: W) => arith.toHex(word);
  const narration = { t, t2: t - 2, t7: t - 7, t15: t - 15, t16: t - 16, sigma1: hex(schedule.sigma1), w7: hex(schedule.w7), sigma0: hex(schedule.sigma0), w16: hex(schedule.w16), w: hex(schedule.w), wordBits: arith.bits };
  return trace.recorder.op(
    {
      op: 'schedule',
      writes: [{ region: 'w', offset: t * arith.bytes, values: arith.toBytes(schedule.w) }],
      highlights: [highlight('w', 'read', [t - 2, t - 7, t - 15, t - 16].flatMap((i) => wordIndices(arith.bytes, i))), highlight('w', 'write', wordIndices(arith.bytes, t))],
      narration: i18nRef(`${trace.ns}.step.schedule`, narration),
    },
    { formula: i18nRef(`${trace.ns}.formula.schedule`, { t, t2: t - 2, t7: t - 7, t15: t - 15, t16: t - 16 }), terms: scheduleTerms(trace.term, schedule) },
  );
}

const SHIFTED_REGISTERS = [1, 2, 3, 5, 6, 7];

/** One round t (§6.2.2 / §6.4.2 step 3): a and e get new words, the others shift by one. */
export function recordRound<W extends Word>(trace: Sha2Trace<W>, round: RoundDetail<W>): number {
  const arith = arithOf(trace);
  const wb = arith.bytes;
  const [a, , , , e] = round.after as [W, W, W, W, W];
  const narration = { t: round.t, T1: arith.toHex(round.T1), T2: arith.toHex(round.T2), a: arith.toHex(a), e: arith.toHex(e), kw: arith.toHex(round.kw), wordBits: arith.bits };
  return trace.recorder.op(
    {
      op: 'round',
      writes: [{ region: 'vars', offset: 0, values: wordsToBytes(arith, round.after) }],
      highlights: [highlight('w', 'read', wordIndices(wb, round.t)), highlight('vars', 'write', [...wordIndices(wb, 0), ...wordIndices(wb, 4)]), highlight('vars', 'move', SHIFTED_REGISTERS.flatMap((i) => wordIndices(wb, i)))],
      narration: i18nRef(`${trace.ns}.step.round`, narration),
    },
    {
      formula: i18nRef(`${trace.ns}.formula.round`, { t: round.t }),
      terms: roundTerms(trace.term, round, trace.options),
      registers: { before: round.before.map((word) => arith.toHex(word)), after: round.after.map((word) => arith.toHex(word)), transfers: [...ROUND_TRANSFERS] },
    },
  );
}

/** Detail `block`: all N rounds (and the schedule) of block n in one step. */
export function recordCompress<W extends Word>(trace: Sha2Trace<W>, blockIndex: number, block: BlockDetail<W>): number {
  const arith = arithOf(trace);
  const { rounds } = trace.algorithm.params;
  const hex = (words: readonly W[]) => words.map((word) => arith.toHex(word));
  return trace.recorder.op(
    {
      op: 'compress',
      writes: [{ region: 'w', offset: 16 * arith.bytes, values: wordsToBytes(arith, block.schedule.slice(16)) }, { region: 'vars', offset: 0, values: wordsToBytes(arith, block.vars) }],
      highlights: [highlight('w', 'write', wordIndices(arith.bytes, 16, rounds - 16)), highlight('vars', 'write', wordIndices(arith.bytes, 0, 8))],
      narration: i18nRef(`${trace.ns}.step.compress`, { n: blockIndex + 1, rounds, vars: wordsHex(arith, block.vars) }),
    },
    { formula: i18nRef(`${trace.ns}.formula.compress`, { n: blockIndex + 1, rounds }), terms: [], registers: { before: hex(block.hIn), after: hex(block.vars) } },
  );
}

/** H^(n) = H^(n−1) + (a, …, h) word-wise (§6.2.2 / §6.4.2 step 4). */
export function recordFeedForward<W extends Word>(trace: Sha2Trace<W>, blockIndex: number, block: BlockDetail<W>): number {
  const arith = arithOf(trace);
  const n = blockIndex + 1;
  const valueRef = chainingValueId(n);
  const terms = block.hOut.map((word, j) => trace.term(`h${j}`, 'chaining', word, 'result', { op: 'add', params: { j, n, reg: SHA2_REGISTER_NAMES[j]!, prev: blockIndex }, valueRef }));
  return trace.recorder.op(
    {
      op: 'feedForward',
      writes: [{ region: 'h', offset: 0, values: wordsToBytes(arith, block.hOut) }],
      highlights: [highlight('vars', 'read', wordIndices(arith.bytes, 0, 8)), highlight('h', 'write', wordIndices(arith.bytes, 0, 8))],
      narration: i18nRef(`${trace.ns}.step.feedForward`, { n, prev: blockIndex, h: wordsHex(arith, block.hOut), wordBits: arith.bits }),
    },
    { formula: i18nRef(`${trace.ns}.formula.feedForward`, { n, prev: blockIndex }), terms },
  );
}

/** The digest: H^(N), truncated to the leftmost `outputSize` bytes (§6.3, §6.5–6.7). */
export function recordOutput<W extends Word>(trace: Sha2Trace<W>, blockCount: number, digest: readonly number[]): number {
  const { algorithm } = trace;
  const truncated = algorithm.outputSize < 8 * algorithm.params.arith.bytes;
  return trace.recorder.op({
    op: 'output',
    writes: [{ region: 'digest', offset: 0, values: [...digest] }],
    highlights: [highlight('h', 'read', allIndices(digest.length)), highlight('digest', 'write', allIndices(digest.length))],
    narration: algorithmNarration(trace.ns, algorithm, truncated ? 'outputTruncated' : 'output', { n: blockCount, bits: digest.length * 8, digest: toHex(digest) }),
  });
}
