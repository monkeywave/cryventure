import { i18nRef, type MathTermRole, type RegisterTransfer, type WordOp, type WordTerm } from '@cryventure/core';
import type { RoundDetail, ScheduleDetail } from './compress.ts';
import type { Word, WordArith } from './words.ts';

/**
 * The `wordops` terms of the SHA-2 steps (docs/M5.md §2d), labelled `<ns>.term.<label>`. The round
 * and schedule terms include K_t + W_t, p1 and p2: the lane values SHA-NI and ARMv8 SHA2 hold.
 */
export interface TermFactory<W extends Word> {
  (id: string, label: string, word: W, role: MathTermRole, extra?: { op?: WordOp; params?: Record<string, number | string>; valueRef?: string; emphasis?: WordTerm['emphasis'] }): WordTerm;
}

/** A term factory for one namespace and word size. */
export function termFactory<W extends Word>(ns: string, arith: WordArith<W>): TermFactory<W> {
  return (id, label, word, role, extra = {}) => ({
    id,
    label: i18nRef(`${ns}.term.${label}`, extra.params),
    hex: arith.toHex(word),
    role,
    ...(extra.op === undefined ? {} : { op: extra.op }),
    ...(extra.valueRef === undefined ? {} : { valueRef: extra.valueRef }),
    ...(extra.emphasis === undefined ? {} : { emphasis: extra.emphasis }),
  });
}

/** Optional round terms: `hKW` = h + K_t + W_t, the SHA512H input (docs/M6.md §2f; `sha512` only). */
export interface RoundTermOptions {
  hKW?: boolean;
}

/** Register indices of the SHA-2 working variables the round computes anew (the others shift). */
const A = 0;
const E = 4;

/**
 * Round t in dataflow order: Σ1(e), Ch(e,f,g), K_t, W_t, K_t + W_t, (h + K_t + W_t), T1, Σ0(a),
 * Maj(a,b,c), T2, then the round's results e = d + T1 and a = T1 + T2 (ids `e`, `a`, the sources
 * of `ROUND_TRANSFERS`). T1 and T2 carry the story emphasis.
 */
export function roundTerms<W extends Word>(term: TermFactory<W>, round: RoundDetail<W>, options: RoundTermOptions = {}): WordTerm[] {
  const t = { params: { t: round.t } };
  return [
    term('Sigma1', 'Sigma1', round.Sigma1, 'intermediate', { op: 'Sigma1' }),
    term('ch', 'ch', round.ch, 'intermediate', { op: 'ch' }),
    term('k', 'k', round.k, 'constant', t),
    term('w', 'w', round.w, 'operand', t),
    term('kw', 'kw', round.kw, 'intermediate', { op: 'add', ...t }),
    ...(options.hKW === true ? [term('hKW', 'hKW', round.hKW, 'intermediate', { op: 'add', ...t })] : []),
    term('T1', 'T1', round.T1, 'intermediate', { op: 'add', emphasis: 'story' }),
    term('Sigma0', 'Sigma0', round.Sigma0, 'intermediate', { op: 'Sigma0' }),
    term('maj', 'maj', round.maj, 'intermediate', { op: 'maj' }),
    term('T2', 'T2', round.T2, 'intermediate', { op: 'add', emphasis: 'story' }),
    term('e', 'newE', round.after[E]!, 'result', { op: 'add' }),
    term('a', 'newA', round.after[A]!, 'result', { op: 'add' }),
  ];
}

/** The SHA-2 register shift (wordops v2): a ← term a (T1 + T2), e ← term e (d + T1), every other register from its left neighbour. */
export const ROUND_TRANSFERS: readonly RegisterTransfer[] = Array.from({ length: 8 }, (_, to): RegisterTransfer => {
  if (to === A) return { to, from: { term: 'a' } };
  if (to === E) return { to, from: { term: 'e' } };
  return { to, from: { register: to - 1 } };
});

/** Schedule t: σ1(W_{t−2}), W_{t−7}, σ0(W_{t−15}), W_{t−16}, p1 = W_{t−16} + σ0, p2 = p1 + W_{t−7}, W_t = p2 + σ1 (the story term). */
export function scheduleTerms<W extends Word>(term: TermFactory<W>, schedule: ScheduleDetail<W>): WordTerm[] {
  const { t } = schedule;
  return [
    term('sigma1', 'sigma1', schedule.sigma1, 'intermediate', { op: 'sigma1', params: { i: t - 2 } }),
    term('w7', 'w', schedule.w7, 'operand', { params: { t: t - 7 } }),
    term('sigma0', 'sigma0', schedule.sigma0, 'intermediate', { op: 'sigma0', params: { i: t - 15 } }),
    term('w16', 'w', schedule.w16, 'operand', { params: { t: t - 16 } }),
    term('p1', 'p1', schedule.p1, 'intermediate', { op: 'add', params: { t16: t - 16, t15: t - 15 } }),
    term('p2', 'p2', schedule.p2, 'intermediate', { op: 'add', params: { t7: t - 7 } }),
    term('w', 'w', schedule.w, 'result', { op: 'add', params: { t }, emphasis: 'story' }),
  ];
}
