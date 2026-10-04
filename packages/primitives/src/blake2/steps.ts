import { allIndices, highlight, i18nRef, toHex, valueId, type Highlight, type I18nRef } from '@cryventure/core';
import type { Blake2BlockPlan } from '../_lib/blake2/blocks.ts';
import type { Blake2BlockDetail, Blake2RoundDetail, GDetail } from '../_lib/blake2/compress.ts';
import { wordsToLittleEndian, type Blake2Algorithm } from '../_lib/blake2/variants.ts';
import { wordsHex, type Word } from '../_lib/sha2/words.ts';
import type { Blake2Recorder } from './recorder.ts';
import { wordIndices, type Blake2Region } from './regions.ts';
import { blake2TermFactory, feedForwardTerms, gTerms, gTransfers, initTerms, loadTerms, type TermFactory } from './terms.ts';

/**
 * The recorded BLAKE2 steps (docs/M6.md §2d): `init`, per block `load`, then `g` / `round` /
 * `compress` by detail, `feedForward`, and `output`. Narration, formula and term keys live under the
 * producer's namespace.
 */
export interface Blake2Trace<W extends Word> {
  ns: string;
  algorithm: Blake2Algorithm<W>;
  recorder: Blake2Recorder;
  term: TermFactory<W>;
}

export function blake2Trace<W extends Word>(ns: string, algorithm: Blake2Algorithm<W>, recorder: Blake2Recorder): Blake2Trace<W> {
  return { ns, algorithm, recorder, term: blake2TermFactory(ns, algorithm.variant) };
}

/** The value id of the chaining value h after block n (`h/<n>`, n ≥ 1). */
export const chainingValueId = (n: number): string => valueId(['h'], String(n));

const wordBytesOf = <W extends Word>(trace: Blake2Trace<W>) => trace.algorithm.variant.arith.bytes;
const le = <W extends Word>(trace: Blake2Trace<W>, words: readonly W[]) => wordsToLittleEndian(trace.algorithm.variant.arith, words);
const hexWords = <W extends Word>(trace: Blake2Trace<W>, words: readonly W[]) => wordsHex(trace.algorithm.variant.arith, words);
const hex = <W extends Word>(trace: Blake2Trace<W>, word: W) => trace.algorithm.variant.arith.toHex(word);

/** h ← IV; h0 ← h0 ⊕ P0 with P0 = 0x0101kknn (RFC 7693 §2.5, §3.3). */
export function recordInit<W extends Word>(trace: Blake2Trace<W>, p0: W, h: readonly W[], keyBytes: number): number {
  const { ns, algorithm } = trace;
  const params = { algorithm: algorithm.name, nn: algorithm.outputSize, kk: keyBytes, p: hex(trace, p0) };
  return trace.recorder.step(
    {
      op: 'init',
      writes: [{ region: 'h', offset: 0, values: le(trace, h) }],
      highlights: [highlight('h', 'write', allIndices(8 * wordBytesOf(trace)))],
      narration: i18nRef(`${ns}.step.init`, { ...params, h: hexWords(trace, h) }),
    },
    { formula: i18nRef(`${ns}.formula.init`, { p: params.p }), terms: initTerms(trace.term, p0, h, algorithm.outputSize, keyBytes) },
  );
}

function sourceHighlights(plan: Blake2BlockPlan, keyBytes: number): Highlight<Blake2Region>[] {
  if (plan.source === 'key') return [highlight('key', 'read', allIndices(keyBytes))];
  if (plan.messageLength === 0) return [];
  return [highlight('message', 'read', allIndices(plan.messageLength).map((index) => plan.messageOffset + index))];
}

/** The narration of a `load`: what the block holds (key, message bytes, nothing), and whether it is the last. */
function loadNarration<W extends Word>(trace: Blake2Trace<W>, blockIndex: number, plan: Blake2BlockPlan, block: Blake2BlockDetail<W>): I18nRef {
  const { ns, algorithm } = trace;
  if (plan.source === 'empty') return i18nRef(`${ns}.step.loadEmpty`);
  const counter = { n: blockIndex + 1, t: block.t, t0: hex(trace, block.t0), t1: hex(trace, block.t1), blockBytes: algorithm.variant.blockBytes };
  const last = plan.last ? 'Last' : '';
  if (plan.source === 'key') return i18nRef(`${ns}.step.loadKey${last}`, counter);
  return i18nRef(`${ns}.step.load${last}`, { ...counter, bytes: plan.messageLength });
}

/** Block n: m ← the block's words; v[0..7] ← h, v[8..15] ← IV; v12 ⊕= t0, v13 ⊕= t1, v14 ⊕= f0. */
export function recordLoad<W extends Word>(trace: Blake2Trace<W>, blockIndex: number, plan: Blake2BlockPlan, block: Blake2BlockDetail<W>, keyBytes: number): number {
  const { ns, algorithm } = trace;
  const wb = wordBytesOf(trace);
  const n = blockIndex + 1;
  return trace.recorder.step(
    {
      op: 'load',
      writes: [
        { region: 'm', offset: 0, values: [...plan.bytes] },
        { region: 'v', offset: 0, values: le(trace, block.vLoaded) },
      ],
      highlights: [...sourceHighlights(plan, keyBytes), highlight('m', 'write', allIndices(16 * wb)), highlight('h', 'read', allIndices(8 * wb)), highlight('v', 'write', allIndices(16 * wb))],
      narration: loadNarration(trace, blockIndex, plan, block),
    },
    { formula: i18nRef(`${ns}.formula.${block.last ? 'loadLast' : 'load'}`, { n }), terms: loadTerms(trace.term, algorithm.variant, block) },
  );
}

/** One G call (RFC 7693 §3.1): writes v[a], v[b], v[c], v[d]. */
export function recordG<W extends Word>(trace: Blake2Trace<W>, round: number, g: GDetail<W>): number {
  const { ns, algorithm } = trace;
  const wb = wordBytesOf(trace);
  const [a, b, c, d] = g.positions;
  const [r1, r2, r3, r4] = algorithm.variant.rotations;
  const results = [g.a2, g.b2, g.c2, g.d2];
  const narration = { round: round + 1, s: round % 10, i: g.i, a, b, c, d, xi: g.xIndex, yi: g.yIndex, x: hex(trace, g.x), y: hex(trace, g.y), r1, r2, r3, r4, a2: hex(trace, g.a2), b2: hex(trace, g.b2), c2: hex(trace, g.c2), d2: hex(trace, g.d2) };
  return trace.recorder.step(
    {
      op: 'g',
      writes: g.positions.map((position, k) => ({ region: 'v' as const, offset: position * wb, values: le(trace, [results[k]!]) })),
      highlights: [highlight('m', 'read', [g.xIndex, g.yIndex].flatMap((index) => wordIndices(wb, index))), highlight('v', 'write', g.positions.flatMap((index) => wordIndices(wb, index)))],
      narration: i18nRef(`${ns}.step.${g.i < 4 ? 'gColumn' : 'gDiagonal'}`, narration),
    },
    {
      formula: i18nRef(`${ns}.formula.g`, { i: g.i, a, b, c, d, xi: g.xIndex, yi: g.yIndex }),
      terms: gTerms(trace.term, algorithm.variant, g),
      registers: { before: g.before.map((word) => hex(trace, word)), after: g.after.map((word) => hex(trace, word)), touched: [...g.positions], transfers: gTransfers(g) },
    },
  );
}

/** Detail `round`: the eight G calls of one round in one step. */
export function recordRound<W extends Word>(trace: Blake2Trace<W>, round: Blake2RoundDetail<W>): number {
  const { ns } = trace;
  const wb = wordBytesOf(trace);
  return trace.recorder.step(
    {
      op: 'round',
      writes: [{ region: 'v', offset: 0, values: le(trace, round.after) }],
      highlights: [highlight('m', 'read', allIndices(16 * wb)), highlight('v', 'write', allIndices(16 * wb))],
      narration: i18nRef(`${ns}.step.round`, { round: round.r + 1, s: round.r % 10, v: hexWords(trace, round.after) }),
    },
    {
      formula: i18nRef(`${ns}.formula.round`, { round: round.r + 1, s: round.r % 10 }),
      terms: [],
      registers: { before: round.before.map((word) => hex(trace, word)), after: round.after.map((word) => hex(trace, word)) },
    },
  );
}

/** Detail `block`: all rounds of block n in one step. */
export function recordCompress<W extends Word>(trace: Blake2Trace<W>, blockIndex: number, block: Blake2BlockDetail<W>): number {
  const { ns, algorithm } = trace;
  const wb = wordBytesOf(trace);
  const n = blockIndex + 1;
  const { rounds } = algorithm.variant;
  return trace.recorder.step(
    {
      op: 'compress',
      writes: [{ region: 'v', offset: 0, values: le(trace, block.vOut) }],
      highlights: [highlight('m', 'read', allIndices(16 * wb)), highlight('v', 'write', allIndices(16 * wb))],
      narration: i18nRef(`${ns}.step.compress`, { n, rounds, v: hexWords(trace, block.vOut) }),
    },
    {
      formula: i18nRef(`${ns}.formula.compress`, { n, rounds }),
      terms: [],
      registers: { before: block.vLoaded.map((word) => hex(trace, word)), after: block.vOut.map((word) => hex(trace, word)) },
    },
  );
}

/** h ← h ⊕ v[0..7] ⊕ v[8..15] (RFC 7693 §3.2). */
export function recordFeedForward<W extends Word>(trace: Blake2Trace<W>, blockIndex: number, block: Blake2BlockDetail<W>): number {
  const { ns } = trace;
  const wb = wordBytesOf(trace);
  const n = blockIndex + 1;
  return trace.recorder.step(
    {
      op: 'feedForward',
      writes: [{ region: 'h', offset: 0, values: le(trace, block.hOut) }],
      highlights: [highlight('v', 'read', allIndices(16 * wb)), highlight('h', 'write', allIndices(8 * wb))],
      narration: i18nRef(`${ns}.step.feedForward`, { n, h: hexWords(trace, block.hOut) }),
    },
    { formula: i18nRef(`${ns}.formula.feedForward`, { n }), terms: feedForwardTerms(trace.term, block.hOut, chainingValueId(n)) },
  );
}

/** The digest: h little-endian, truncated to nn bytes (RFC 7693 §3.3). */
export function recordOutput<W extends Word>(trace: Blake2Trace<W>, blockCount: number, digest: readonly number[]): number {
  const { ns, algorithm } = trace;
  const truncated = algorithm.outputSize < 8 * wordBytesOf(trace);
  return trace.recorder.step({
    op: 'output',
    writes: [{ region: 'digest', offset: 0, values: [...digest] }],
    highlights: [highlight('h', 'read', allIndices(digest.length)), highlight('digest', 'write', allIndices(digest.length))],
    narration: i18nRef(`${ns}.step.${truncated ? 'outputTruncated' : 'output'}`, { algorithm: algorithm.name, n: blockCount, bytes: digest.length, digest: toHex(digest) }),
  });
}
