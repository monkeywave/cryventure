import type { AlignSpan } from '@cryventure/core';
import { opStep, type AesOpName, type AesOpSteps } from './aesTrace.ts';
import type { ListingRole } from './listing.ts';

/** One AES op an instruction performs, e.g. SubBytes of round 3. */
export interface CoveredOp {
  op: AesOpName;
  round: number;
}

/** The span before the first instruction: the initial state. */
export const INITIAL_SPAN: AlignSpan = { first: -1, last: -1 };

/** A zero-width span on `step`. */
export function pointSpan(step: number): AlignSpan {
  return { first: step, last: step };
}

/** Per item, `pick` of the nearest later item it gives a value for (`undefined` after the last one). */
export function nextFrom<T, R>(
  items: readonly T[],
  pick: (item: T) => R | undefined,
): (R | undefined)[] {
  const next: (R | undefined)[] = [];
  let upcoming: R | undefined;
  for (let index = items.length - 1; index >= 0; index--) {
    next[index] = upcoming;
    upcoming = pick(items[index]!) ?? upcoming;
  }
  return next;
}

/** Where an instruction sits in the listing: the span before it and the next AES instruction's first step. */
export interface SpanNeighbours {
  previous: AlignSpan;
  /** `first` of the next instruction that covers AES ops, or `undefined` after the last one. */
  nextAesFirst: number | undefined;
}

/** The state step an instruction without AES math sits on (§1e): never one an AES instruction ends on. */
function quietStep(ops: AesOpSteps, { previous, nextAesFirst }: SpanNeighbours): number {
  if (previous.last === INITIAL_SPAN.last) return INITIAL_SPAN.last;
  return Math.max(previous.last, nextAesFirst ?? opStep(ops, 'output', ops.rounds));
}

/**
 * The state steps an instruction covers (docs/M4.md §1e): from its first to its last covered op.
 * Instructions without AES math sit on a zero-width span: `loadState` on the `input` step, `store`
 * on the `output` step, anything else on the next AES instruction's `first` step (−1 before the
 * state is loaded, the `output` step after the last AES instruction). So a load never shadows the
 * AES instruction before it, which `currentAt` (last match) would otherwise hide at its last step.
 */
export function instructionSpan(
  role: ListingRole,
  covers: readonly CoveredOp[],
  ops: AesOpSteps,
  neighbours: SpanNeighbours,
): AlignSpan {
  const first = covers[0];
  const last = covers.at(-1);
  if (first !== undefined && last !== undefined)
    return { first: opStep(ops, first.op, first.round), last: opStep(ops, last.op, last.round) };
  if (role === 'loadState') return pointSpan(opStep(ops, 'input', 0));
  if (role === 'store') return pointSpan(opStep(ops, 'output', ops.rounds));
  return pointSpan(quietStep(ops, neighbours));
}
