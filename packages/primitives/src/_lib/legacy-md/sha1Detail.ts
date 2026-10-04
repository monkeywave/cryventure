import type { LegacyAlgorithm, LegacyBlock, LegacyEvent, LegacyRound, LegacySchedule } from './algorithm.ts';
import { SHA1_FUNCTIONS, SHA1_IV, SHA1_OUTPUT_BYTES, SHA1_ROUNDS, sha1Digest, sha1Padding, sha1RoundConstants, sha1Schedule, type Sha1FunctionName } from './sha1.ts';
import { add32, hex32, rotl32 } from './words.ts';

/**
 * The SHA-1 compression function with every intermediate value kept (FIPS 180-4 §6.1.2), for the
 * traced `sha1` producer (docs/M6.md §2e). Events come in recording order: for t = 0 … 79,
 * `schedule t` (t ≥ 16), then `round t`.
 */

/** f_t by its FIPS 180-4 §4.1.1 name, for the narration. */
const FUNCTION_NAMES: Readonly<Record<Sha1FunctionName, string>> = { ch: 'Ch', parity: 'Parity', maj: 'Maj' };

const A = 0, B = 1, C = 2, D = 3, E = 4;

/** W_t = ROTL^1(W_{t−3} ⊕ W_{t−8} ⊕ W_{t−14} ⊕ W_{t−16}), t ≥ 16, from the full schedule `w`. */
export function sha1ScheduleEvent(t: number, w: readonly number[]): LegacySchedule {
  const reads = [t - 3, t - 8, t - 14, t - 16];
  const [w3, w8, w14, w16] = reads.map((index) => w[index]!) as [number, number, number, number];
  const xor = (w3 ^ w8 ^ w14 ^ w16) >>> 0;
  const indices = { t, t3: t - 3, t8: t - 8, t14: t - 14, t16: t - 16 };
  return {
    kind: 'schedule',
    t,
    w: w[t]!,
    reads,
    terms: [
      { id: 'w3', label: 'w', word: w3, role: 'operand', params: { t: t - 3 } },
      { id: 'w8', label: 'w', word: w8, role: 'operand', params: { t: t - 8 } },
      { id: 'w14', label: 'w', word: w14, role: 'operand', params: { t: t - 14 } },
      { id: 'w16', label: 'w', word: w16, role: 'operand', params: { t: t - 16 } },
      { id: 'xor', label: 'xor', word: xor, role: 'intermediate', op: 'xor', params: { t3: t - 3, t8: t - 8, t14: t - 14, t16: t - 16 } },
      { id: 'w', label: 'w', word: w[t]!, role: 'result', op: 'rotl', params: { t } },
    ],
    narration: { ...indices, w3: hex32(w3), w8: hex32(w8), w14: hex32(w14), w16: hex32(w16), xor: hex32(xor), w: hex32(w[t]!) },
    formula: indices,
  };
}

/** Round t on the registers `before` = (a, b, c, d, e) with W_t = `wt`. */
export function sha1Round(t: number, before: readonly number[], wt: number): LegacyRound {
  const { fn, k } = sha1RoundConstants(t);
  const [a, b, c, d, e] = before as [number, number, number, number, number];
  const rotl5 = rotl32(a, 5);
  const f = SHA1_FUNCTIONS[fn](b, c, d);
  const T = add32(rotl5, f, e, k, wt);
  const rotl30 = rotl32(b, 30);
  return {
    kind: 'round',
    t,
    before: [...before],
    after: [T, a, rotl30, c, d],
    readWord: t,
    terms: [
      { id: 'rotl5', label: 'rotl5', word: rotl5, role: 'intermediate', op: 'rotl' },
      { id: 'f', label: fn, word: f, role: 'intermediate', op: fn, params: { t } },
      { id: 'e', label: 'e', word: e, role: 'operand' },
      { id: 'k', label: 'k', word: k, role: 'constant', params: { t } },
      { id: 'w', label: 'w', word: wt, role: 'operand', params: { t } },
      { id: 'T', label: 'T', word: T, role: 'result', op: 'add', story: true },
      { id: 'rotl30', label: 'rotl30', word: rotl30, role: 'intermediate', op: 'rotl' },
    ],
    transfers: [
      { to: A, from: { term: 'T' } },
      { to: B, from: { register: A } },
      { to: C, from: { term: 'rotl30' } },
      { to: D, from: { register: C } },
      { to: E, from: { register: D } },
    ],
    narration: { t, fn: FUNCTION_NAMES[fn], rotl5: hex32(rotl5), f: hex32(f), e: hex32(e), k: hex32(k), w: hex32(wt), T: hex32(T), c: hex32(rotl30) },
    formula: { t, fn: FUNCTION_NAMES[fn] },
  };
}

/** One block: the schedule words and the 80 rounds, interleaved as recorded, and the feed-forward. */
export function sha1CompressDetailed(h: readonly number[], block: Uint8Array): LegacyBlock {
  const w = sha1Schedule(block);
  const events: LegacyEvent[] = [];
  let vars = [...h];
  for (let t = 0; t < SHA1_ROUNDS; t++) {
    if (t >= 16) events.push(sha1ScheduleEvent(t, w));
    const round = sha1Round(t, vars, w[t]!);
    events.push(round);
    vars = round.after;
  }
  return { hIn: [...h], words: w, events, vars, hOut: h.map((word, j) => add32(word, vars[j]!)) };
}

export const SHA1_ALGORITHM: LegacyAlgorithm = {
  id: 'sha-1',
  name: 'SHA-1',
  registerNames: ['a', 'b', 'c', 'd', 'e'],
  byteOrder: 'big',
  iv: SHA1_IV,
  rounds: SHA1_ROUNDS,
  outputSize: SHA1_OUTPUT_BYTES,
  hasSchedule: true,
  roundWrites: [A, C],
  padding: sha1Padding,
  compressDetailed: sha1CompressDetailed,
  digest: sha1Digest,
};
