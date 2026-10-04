import type { AlignSpan } from '@cryventure/core';
import { nextFrom, pointSpan } from '../isaSpans.ts';
import type { KeccakListingRole } from '../listing.ts';
import type { KeccakPermutation, KeccakRoundSteps } from './keccakTrace.ts';

/**
 * Spans of the Keccak listing (docs/M6.md §5c; M4 §1e: spans never decrease). Each instruction that
 * does Keccak work has a **natural** span on its round's steps: `eor3`/`rax1` on θ, `xar` on θ … π
 * (θ's XOR with D, ρ's rotation, π's choice of register), `bcax` on χ, ι's `eor` on ι; loads sit on
 * the permutation's entry step and stores on its exit step.
 *
 * clang interleaves the mappings, so the natural spans do not always rise in listing order. The
 * resolution keeps the listing order and never moves a span backwards:
 *
 * - An instruction whose natural span starts before the span of the instruction before it is
 *   **deferred** to that span (both ends raised to at least the previous ends). This hits the `xar`
 *   for lane 24, which clang schedules after the first two `bcax`: it becomes zero-width at the
 *   round's χ step. Its register value is unchanged (the ρ/π lane), it is only shown where it runs;
 *   the alternative, a span θ … χ, would start before the `bcax` ahead of it and decrease.
 * - Instructions without a natural span (moves, the spill and reload, the loop counter, the RC load,
 *   callee-saved register saves) sit between their neighbours: from the next Keccak instruction's
 *   first step to at least the previous instruction's last one. Between two `xar` (θ … π) that is
 *   θ … π; between steps it is zero-width at the next instruction's `first`, so nothing shadows the
 *   instruction before it. The RC load, which clang places in the middle of χ, is zero-width at χ
 *   (its value is ι's round constant, loaded ahead).
 */

/** The natural span of an instruction with `role` in `round` of `permutation`, or `undefined` for one without Keccak work. */
export function naturalSpan(
  role: KeccakListingRole,
  permutation: KeccakPermutation,
  round: KeccakRoundSteps | undefined,
): AlignSpan | undefined {
  if (role === 'loadState') return pointSpan(permutation.entry);
  if (role === 'storeState') return pointSpan(permutation.exit);
  if (round === undefined) return undefined;
  switch (role) {
    case 'thetaParity':
    case 'thetaD':
      return pointSpan(round.theta.step);
    case 'thetaRhoPi':
      return { first: round.theta.step, last: round.pi.step };
    case 'chi':
      return pointSpan(round.chi.step);
    case 'iota':
      return pointSpan(round.iota.step);
    default:
      return undefined;
  }
}

const raise = (span: AlignSpan, floor: AlignSpan): AlignSpan => ({
  first: Math.max(span.first, floor.first),
  last: Math.max(span.last, floor.last),
});

/** Natural spans raised so that neither end decreases (deferring an instruction clang scheduled late). */
function resolveKeccakWork(
  natural: readonly (AlignSpan | undefined)[],
  previous: AlignSpan,
): (AlignSpan | undefined)[] {
  let floor = previous;
  return natural.map((span) => {
    if (span === undefined) return undefined;
    floor = raise(span, floor);
    return floor;
  });
}

/**
 * Monotonic spans for a run of instructions with these natural spans, after `previous` (the span
 * before the run). See the module comment for the rules.
 */
export function resolveSpans(
  natural: readonly (AlignSpan | undefined)[],
  previous: AlignSpan,
): AlignSpan[] {
  const work = resolveKeccakWork(natural, previous);
  const nextFirst = nextFrom(work, (span) => span?.first);
  let before = previous;
  return work.map((span, index) => {
    if (span === undefined) {
      const first = Math.max(before.first, nextFirst[index] ?? before.last);
      span = { first, last: Math.max(before.last, first) };
    }
    before = span;
    return span;
  });
}
