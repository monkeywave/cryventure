import { allIndices, blockIndices, highlight, i18nRef, toHex, valueId, type Highlight, type I18nRef, type WordTerm } from '@cryventure/core';
import type { Sha2Padding } from '../sha2/padding.ts';
import { wordIndices } from '../sha2/regions.ts';
import type { WordopsRecorder } from '../sha2/wordopsRecorder.ts';
import type { LegacyAlgorithm, LegacyBlock, LegacyRound, LegacySchedule, TermSpec } from './algorithm.ts';
import type { LegacyOpName } from './manifestKit.ts';
import { LEGACY_WORD_BYTES, type LegacyRegion } from './regions.ts';
import { hex32, wordsHex, wordsToBytes } from './words.ts';

/**
 * The recorded MD5/SHA-1 steps (docs/M6.md §2e), shaped like SHA-2's (`_lib/sha2/steps.ts`).
 * Narration, formula and term keys live under the producer's namespace (`plugin.md5`,
 * `plugin.sha1`), so both producers share this code with their own catalogs.
 */
export type LegacyRecorder = WordopsRecorder<LegacyRegion, { op: LegacyOpName }>;

export interface LegacyTrace {
  ns: string;
  algorithm: LegacyAlgorithm;
  recorder: LegacyRecorder;
}

const BLOCK_BYTES = 64;
const BLOCK_WORDS = 16;
const words = (count: number, first = 0) => wordIndices(LEGACY_WORD_BYTES, first, count);

/** A labelled wordops term: `<ns>.term.<label>`, story terms marked `emphasis: 'story'`. */
export function legacyTerm(ns: string, spec: TermSpec, valueRef?: string): WordTerm {
  return {
    id: spec.id,
    label: i18nRef(`${ns}.term.${spec.label}`, spec.params),
    hex: hex32(spec.word),
    role: spec.role,
    ...(spec.op === undefined ? {} : { op: spec.op }),
    ...(valueRef === undefined ? {} : { valueRef }),
    ...(spec.story === true ? { emphasis: 'story' as const } : {}),
  };
}

/** The value id of the chaining value after block n (`h/<n>`, n ≥ 1); before block 1 it is `iv`. */
export function chainingValueId(n: number): string {
  return n === 0 ? 'iv' : valueId(['h'], String(n));
}

/** The intro (initial snapshot) of a run over `messageBytes` bytes. */
export function legacyInitialNarration(trace: Pick<LegacyTrace, 'ns' | 'algorithm'>, messageBytes: number): I18nRef {
  const { algorithm } = trace;
  return i18nRef(`${trace.ns}.step.initial`, { bytes: messageBytes, bits: algorithm.outputSize * 8, blockBits: BLOCK_BYTES * 8, rounds: algorithm.rounds });
}

/** The padded message, written once before block 1. */
export function recordPad(trace: LegacyTrace, messageBytes: number, padding: Sha2Padding): number {
  const { padded, zeroBytes, lengthBytes, messageBits } = padding;
  return trace.recorder.op({
    op: 'pad',
    writes: [{ region: 'padded', offset: 0, values: Array.from(padded) }],
    highlights: [...(messageBytes > 0 ? [highlight<LegacyRegion>('message', 'read', allIndices(messageBytes))] : []), highlight('padded', 'write', allIndices(padded.length))],
    narration: i18nRef(`${trace.ns}.step.pad`, { bytes: messageBytes, zeros: zeroBytes, lengthBits: lengthBytes * 8, bits: messageBits, count: padded.length / BLOCK_BYTES, blockBytes: BLOCK_BYTES }),
  });
}

function initHighlights(algorithm: LegacyAlgorithm, blockIndex: number): Highlight<LegacyRegion>[] {
  const registers = words(algorithm.registerNames.length);
  return [
    // Every block of the padded message is whole, so no length caps the range.
    highlight('padded', 'read', blockIndices(blockIndex, BLOCK_BYTES, Number.POSITIVE_INFINITY)),
    ...(algorithm.hasSchedule ? [highlight<LegacyRegion>('w', 'write', words(BLOCK_WORDS))] : []),
    highlight('vars', 'write', registers),
    highlight('h', blockIndex === 0 ? 'write' : 'read', registers),
  ];
}

function initTerms({ ns, algorithm }: LegacyTrace, blockIndex: number, block: LegacyBlock): WordTerm[] {
  const valueRef = chainingValueId(blockIndex);
  const registers = block.hIn.map((word, j) => {
    const reg = algorithm.registerNames[j]!;
    return legacyTerm(ns, { id: reg, label: 'register', word, role: 'operand', params: { reg, j, prev: blockIndex } }, valueRef);
  });
  const prefix = algorithm.hasSchedule ? 'w' : 'x';
  const message = block.words.slice(0, BLOCK_WORDS).map((word, j) => legacyTerm(ns, { id: `${prefix}${j}`, label: 'message', word, role: 'operand', params: { j, n: blockIndex + 1 } }));
  return [...registers, ...message];
}

/** Block n: (block 1 only: H ← IV); the registers ← H; the block's 16 words (into W_0 … W_15 for SHA-1). */
export function recordInit(trace: LegacyTrace, blockIndex: number, block: LegacyBlock): number {
  const { ns, algorithm } = trace;
  const hBytes = wordsToBytes(block.hIn, algorithm.byteOrder);
  const n = blockIndex + 1;
  const h = wordsHex(block.hIn);
  const narration = blockIndex === 0 ? i18nRef(`${ns}.step.initFirst`, { h }) : i18nRef(`${ns}.step.init`, { n, prev: blockIndex, h });
  const schedule = algorithm.hasSchedule ? [{ region: 'w' as const, offset: 0, values: wordsToBytes(block.words.slice(0, BLOCK_WORDS), algorithm.byteOrder) }] : [];
  return trace.recorder.op(
    {
      op: 'init',
      writes: [...(blockIndex === 0 ? [{ region: 'h' as const, offset: 0, values: hBytes }] : []), { region: 'vars', offset: 0, values: hBytes }, ...schedule],
      highlights: initHighlights(algorithm, blockIndex),
      narration,
    },
    { formula: i18nRef(`${ns}.formula.init`, { n, prev: blockIndex }), terms: initTerms(trace, blockIndex, block) },
  );
}

/** SHA-1: one schedule word W_t, t ≥ 16. */
export function recordSchedule(trace: LegacyTrace, schedule: LegacySchedule): number {
  const { ns, algorithm } = trace;
  return trace.recorder.op(
    {
      op: 'schedule',
      writes: [{ region: 'w', offset: schedule.t * LEGACY_WORD_BYTES, values: wordsToBytes([schedule.w], algorithm.byteOrder) }],
      highlights: [highlight('w', 'read', schedule.reads.flatMap((index) => words(1, index))), highlight('w', 'write', words(1, schedule.t))],
      narration: i18nRef(`${ns}.step.schedule`, schedule.narration),
    },
    { formula: i18nRef(`${ns}.formula.schedule`, schedule.formula), terms: schedule.terms.map((spec) => legacyTerm(ns, spec)) },
  );
}

/** The word a round reads: X[k] in block n of the padded message (MD5), or W_t (SHA-1). */
function roundRead(algorithm: LegacyAlgorithm, blockIndex: number, round: LegacyRound): Highlight<LegacyRegion> {
  return algorithm.hasSchedule ? highlight('w', 'read', words(1, round.readWord)) : highlight('padded', 'read', words(1, blockIndex * BLOCK_WORDS + round.readWord));
}

/** One round: the registers it writes get new words, the others move. */
export function recordRound(trace: LegacyTrace, blockIndex: number, round: LegacyRound): number {
  const { ns, algorithm } = trace;
  const moved = allIndices(algorithm.registerNames.length).filter((index) => !algorithm.roundWrites.includes(index));
  return trace.recorder.op(
    {
      op: 'round',
      writes: [{ region: 'vars', offset: 0, values: wordsToBytes(round.after, algorithm.byteOrder) }],
      highlights: [
        roundRead(algorithm, blockIndex, round),
        highlight('vars', 'write', algorithm.roundWrites.flatMap((index) => words(1, index))),
        highlight('vars', 'move', moved.flatMap((index) => words(1, index))),
      ],
      narration: i18nRef(`${ns}.step.round`, round.narration),
    },
    {
      formula: i18nRef(`${ns}.formula.round`, round.formula),
      terms: round.terms.map((spec) => legacyTerm(ns, spec)),
      registers: { before: round.before.map(hex32), after: round.after.map(hex32), transfers: round.transfers },
    },
  );
}

/** Detail `block`: all rounds (and for SHA-1 the schedule) of block n in one step. */
export function recordCompress(trace: LegacyTrace, blockIndex: number, block: LegacyBlock): number {
  const { ns, algorithm } = trace;
  const { rounds } = algorithm;
  const schedule = algorithm.hasSchedule ? [{ region: 'w' as const, offset: BLOCK_WORDS * LEGACY_WORD_BYTES, values: wordsToBytes(block.words.slice(BLOCK_WORDS), algorithm.byteOrder) }] : [];
  const scheduleHighlights = algorithm.hasSchedule ? [highlight<LegacyRegion>('w', 'write', words(rounds - BLOCK_WORDS, BLOCK_WORDS))] : [highlight<LegacyRegion>('padded', 'read', blockIndices(blockIndex, BLOCK_BYTES, Number.POSITIVE_INFINITY))];
  return trace.recorder.op(
    {
      op: 'compress',
      writes: [...schedule, { region: 'vars', offset: 0, values: wordsToBytes(block.vars, algorithm.byteOrder) }],
      highlights: [...scheduleHighlights, highlight('vars', 'write', words(algorithm.registerNames.length))],
      narration: i18nRef(`${ns}.step.compress`, { n: blockIndex + 1, rounds, vars: wordsHex(block.vars) }),
    },
    { formula: i18nRef(`${ns}.formula.compress`, { n: blockIndex + 1, rounds }), terms: [], registers: { before: block.hIn.map(hex32), after: block.vars.map(hex32) } },
  );
}

/** H(n) = H(n−1) + the registers, word by word mod 2^32. */
export function recordFeedForward(trace: LegacyTrace, blockIndex: number, block: LegacyBlock): number {
  const { ns, algorithm } = trace;
  const n = blockIndex + 1;
  const valueRef = chainingValueId(n);
  const registers = words(algorithm.registerNames.length);
  const terms = block.hOut.map((word, j) => legacyTerm(ns, { id: `h${j}`, label: 'chaining', word, role: 'result', op: 'add', params: { j, n, reg: algorithm.registerNames[j]!, prev: blockIndex } }, valueRef));
  return trace.recorder.op(
    {
      op: 'feedForward',
      writes: [{ region: 'h', offset: 0, values: wordsToBytes(block.hOut, algorithm.byteOrder) }],
      highlights: [highlight('vars', 'read', registers), highlight('h', 'write', registers)],
      narration: i18nRef(`${ns}.step.feedForward`, { n, prev: blockIndex, h: wordsHex(block.hOut) }),
    },
    { formula: i18nRef(`${ns}.formula.feedForward`, { n, prev: blockIndex }), terms },
  );
}

/** The digest: the bytes of the final chaining value. */
export function recordOutput(trace: LegacyTrace, blockCount: number, digest: readonly number[]): number {
  return trace.recorder.op({
    op: 'output',
    writes: [{ region: 'digest', offset: 0, values: [...digest] }],
    highlights: [highlight('h', 'read', allIndices(digest.length)), highlight('digest', 'write', allIndices(digest.length))],
    narration: i18nRef(`${trace.ns}.step.output`, { n: blockCount, bits: digest.length * 8, digest: toHex(digest) }),
  });
}
