import type { MathTermRole, RegisterTransfer, TranslateParams, WordOp } from '@cryventure/core';
import type { Sha2Padding } from '../sha2/padding.ts';
import type { WordByteOrder } from './words.ts';

/**
 * What the shared MD5/SHA-1 recorder (`steps.ts`, `record.ts`) needs from one algorithm
 * (docs/M6.md §2e): its registers, byte order, padding and a compression function that keeps every
 * intermediate value. `md5Detail.ts` and `sha1Detail.ts` provide the two instances.
 */

/** A wordops term before it is labelled under a namespace: `<ns>.term.<label>` with `params`. */
export interface TermSpec {
  id: string;
  label: string;
  word: number;
  role: MathTermRole;
  op?: WordOp;
  params?: Record<string, number | string>;
  /** Shown by the story lens (`emphasis: 'story'`). */
  story?: boolean;
}

/** One round: the registers around it, its terms in dataflow order and how the registers move. */
export interface LegacyRound {
  kind: 'round';
  t: number;
  before: number[];
  after: number[];
  /** The message word the round reads: X[k] of the block (MD5) or W_t of the schedule (SHA-1). */
  readWord: number;
  terms: TermSpec[];
  transfers: RegisterTransfer[];
  /** The params of `<ns>.step.round` and `<ns>.formula.round`. */
  narration: TranslateParams;
  formula: TranslateParams;
}

/** One message schedule word W_t, t ≥ 16 (SHA-1 only). */
export interface LegacySchedule {
  kind: 'schedule';
  t: number;
  w: number;
  /** The schedule indices W_t reads. */
  reads: number[];
  terms: TermSpec[];
  narration: TranslateParams;
  formula: TranslateParams;
}

export type LegacyEvent = LegacyRound | LegacySchedule;

export interface LegacyBlock {
  /** The chaining value going in. */
  hIn: number[];
  /** The message words of the block: X[0 … 15] (MD5) or the whole schedule W_0 … W_79 (SHA-1). */
  words: number[];
  events: LegacyEvent[];
  /** The registers after the last round. */
  vars: number[];
  /** The chaining value coming out: hIn + vars word-wise. */
  hOut: number[];
}

export interface LegacyAlgorithm {
  id: 'md5' | 'sha-1';
  /** The standard's name, used in the narration. */
  name: string;
  registerNames: readonly string[];
  byteOrder: WordByteOrder;
  iv: readonly number[];
  rounds: number;
  outputSize: number;
  /** Whether the run has a message schedule (the region `w` and `schedule` steps). */
  hasSchedule: boolean;
  /** The registers a round writes with a new value; the others only move. */
  roundWrites: readonly number[];
  padding(message: ArrayLike<number>): Sha2Padding;
  compressDetailed(h: readonly number[], block: Uint8Array): LegacyBlock;
  /** The untraced reference digest. */
  digest(data: Uint8Array): Uint8Array;
}
