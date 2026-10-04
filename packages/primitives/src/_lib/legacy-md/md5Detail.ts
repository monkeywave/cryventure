import type { LegacyAlgorithm, LegacyBlock, LegacyRound } from './algorithm.ts';
import { MD5_FUNCTIONS, MD5_IV, MD5_OUTPUT_BYTES, MD5_ROUNDS, MD5_T, md5Digest, md5Operation, md5Padding, type Md5FunctionName } from './md5.ts';
import { add32, hex32, rotl32, wordsFromBytes } from './words.ts';

/**
 * The MD5 compression function with every intermediate value kept (RFC 1321 §3.4), for the traced
 * `md5` producer (docs/M6.md §2e). Operation i: b ← b + ((a + f(b, c, d) + X[k] + T[i]) ⋘ s), then
 * the registers rotate: a ← d, c ← b, d ← c.
 */

/** The wordops op of each auxiliary function: F is SHA's Ch, H the three-way XOR. */
const FUNCTION_OPS = { F: 'ch', G: 'md5G', H: 'parity', I: 'md5I' } as const satisfies Record<Md5FunctionName, string>;

const A = 0, B = 1, C = 2, D = 3;

/** Operation i (0 … 63) on the registers `before` = (a, b, c, d) with the block words `x`. */
export function md5Round(i: number, before: readonly number[], x: readonly number[]): LegacyRound {
  const { round, fn, k, s } = md5Operation(i);
  const [a, b, c, d] = before as [number, number, number, number];
  const f = MD5_FUNCTIONS[fn](b, c, d);
  const t = MD5_T[i]!;
  const sum = add32(a, f, x[k]!, t);
  const rotated = rotl32(sum, s);
  const newB = add32(b, rotated);
  const labels = { fn, k, i: i + 1, s };
  return {
    kind: 'round',
    t: i,
    before: [...before],
    after: [d, newB, b, c],
    readWord: k,
    terms: [
      { id: 'f', label: fn, word: f, role: 'intermediate', op: FUNCTION_OPS[fn] },
      { id: 'x', label: 'x', word: x[k]!, role: 'operand', params: { k } },
      { id: 't', label: 't', word: t, role: 'constant', params: { i: i + 1 } },
      { id: 'sum', label: 'sum', word: sum, role: 'intermediate', op: 'add', params: { fn, k, i: i + 1 } },
      { id: 'rotl', label: 'rotl', word: rotated, role: 'intermediate', op: 'rotl', params: { s } },
      { id: 'newB', label: 'newB', word: newB, role: 'result', op: 'add', params: { s }, story: true },
    ],
    transfers: [
      { to: A, from: { register: D } },
      { to: B, from: { term: 'newB' } },
      { to: C, from: { register: B } },
      { to: D, from: { register: C } },
    ],
    narration: { ...labels, round: round + 1, f: hex32(f), x: hex32(x[k]!), T: hex32(t), sum: hex32(sum), rotl: hex32(rotated), b: hex32(newB) },
    formula: labels,
  };
}

/** One block's 64 operations and the feed-forward. */
export function md5CompressDetailed(h: readonly number[], block: Uint8Array): LegacyBlock {
  const x = wordsFromBytes(block, 'little');
  const events: LegacyRound[] = [];
  let vars = [...h];
  for (let i = 0; i < MD5_ROUNDS; i++) {
    const round = md5Round(i, vars, x);
    events.push(round);
    vars = round.after;
  }
  return { hIn: [...h], words: x, events, vars, hOut: h.map((word, j) => add32(word, vars[j]!)) };
}

export const MD5_ALGORITHM: LegacyAlgorithm = {
  id: 'md5',
  name: 'MD5',
  registerNames: ['a', 'b', 'c', 'd'],
  byteOrder: 'little',
  iv: MD5_IV,
  rounds: MD5_ROUNDS,
  outputSize: MD5_OUTPUT_BYTES,
  hasSchedule: false,
  roundWrites: [B],
  padding: md5Padding,
  compressDetailed: md5CompressDetailed,
  digest: md5Digest,
};
