import type { Sha2Params } from './algorithms.ts';
import { bigSigma, ch, maj, smallSigma } from './functions.ts';
import { wordsFromBytes, type Word } from './words.ts';

/**
 * The SHA-2 compression function with every intermediate value kept (FIPS 180-4 §6.2.2 / §6.4.2),
 * generic over the word size, for the traced producers (docs/M5.md §2c–2d). Events come in the
 * order the producers record them: for t = 0 … N−1, `schedule t` (t ≥ 16), then `round t`.
 */

/** W_t = σ1(W_{t−2}) + W_{t−7} + σ0(W_{t−15}) + W_{t−16}, with the partial sums the hardware holds. */
export interface ScheduleDetail<W extends Word> {
  kind: 'schedule';
  t: number;
  sigma1: W;
  w7: W;
  sigma0: W;
  w16: W;
  /** p1 = W_{t−16} + σ0(W_{t−15}) (sha256msg1 / sha256su0). */
  p1: W;
  /** p2 = p1 + W_{t−7}. */
  p2: W;
  w: W;
}

/** One round: T1 = h + Σ1(e) + Ch(e,f,g) + K_t + W_t, T2 = Σ0(a) + Maj(a,b,c). */
export interface RoundDetail<W extends Word> {
  kind: 'round';
  t: number;
  /** a … h before the round. */
  before: W[];
  Sigma1: W;
  ch: W;
  k: W;
  w: W;
  /** K_t + W_t (the lane value of sha256rnds2 / sha256h). */
  kw: W;
  T1: W;
  Sigma0: W;
  maj: W;
  T2: W;
  /** a … h after the round. */
  after: W[];
}

export type CompressEvent<W extends Word> = ScheduleDetail<W> | RoundDetail<W>;

export interface BlockDetail<W extends Word> {
  /** H^(i−1), the chaining value going in. */
  hIn: W[];
  /** W_0 … W_{N−1}. */
  schedule: W[];
  events: CompressEvent<W>[];
  /** a … h after the last round. */
  vars: W[];
  /** H^(i) = H^(i−1) + (a, …, h) word-wise. */
  hOut: W[];
}

function scheduleWord<W extends Word>(params: Sha2Params<W>, w: readonly W[], t: number): ScheduleDetail<W> {
  const { arith, rotations } = params;
  const word = (index: number): W => w[index]!;
  const [w2, w7, w15, w16] = [word(t - 2), word(t - 7), word(t - 15), word(t - 16)];
  const sigma1 = smallSigma(arith, w2, rotations.sigma1);
  const sigma0 = smallSigma(arith, w15, rotations.sigma0);
  const p1 = arith.add(w16, sigma0);
  const p2 = arith.add(p1, w7);
  return { kind: 'schedule', t, sigma1, w7, sigma0, w16, p1, p2, w: arith.add(p2, sigma1) };
}

function round<W extends Word>(params: Sha2Params<W>, before: readonly W[], k: W, w: W, t: number): RoundDetail<W> {
  const { arith, rotations } = params;
  const [a, b, c, d, e, f, g, h] = before as [W, W, W, W, W, W, W, W];
  const Sigma1 = bigSigma(arith, e, rotations.Sigma1);
  const choose = ch(arith, e, f, g);
  const kw = arith.add(k, w);
  const T1 = arith.add(h, Sigma1, choose, kw);
  const Sigma0 = bigSigma(arith, a, rotations.Sigma0);
  const majority = maj(arith, a, b, c);
  const T2 = arith.add(Sigma0, majority);
  const after = [arith.add(T1, T2), a, b, c, arith.add(d, T1), e, f, g];
  return { kind: 'round', t, before: [...before], Sigma1, ch: choose, k, w, kw, T1, Sigma0, maj: majority, T2, after };
}

/** Compresses one block (`params.blockBytes` bytes) into `hIn`, keeping every intermediate value. */
export function compressDetailed<W extends Word>(params: Sha2Params<W>, hIn: readonly W[], block: ArrayLike<number>): BlockDetail<W> {
  const schedule = wordsFromBytes(params.arith, block);
  const events: CompressEvent<W>[] = [];
  let vars = [...hIn];
  for (let t = 0; t < params.rounds; t++) {
    if (t >= 16) {
      const detail = scheduleWord(params, schedule, t);
      schedule.push(detail.w);
      events.push(detail);
    }
    const detail = round(params, vars, params.K[t]!, schedule[t]!, t);
    vars = detail.after;
    events.push(detail);
  }
  const hOut = hIn.map((word, index) => params.arith.add(word, vars[index]!));
  return { hIn: [...hIn], schedule, events, vars, hOut };
}
