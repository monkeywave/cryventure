/**
 * Tag comparison without an early exit (docs/M7.md §2a), for the HMAC lab's verify step. The loop
 * always walks all of `expected`, so the work does not depend on where the first difference is; a
 * byte `actual` lacks compares as 0, and a length mismatch fails after the full pass.
 * (Educational: a JavaScript engine gives no constant-time guarantee.)
 */

/**
 * Whether `actual` equals `expected`. The loop deliberately repeats `timingSafeEqualSteps` without
 * its per-byte record: the HMAC `Mac` ports compare here and allocate nothing.
 */
export function timingSafeEqual(expected: Uint8Array, actual: Uint8Array): boolean {
  let accumulator = 0;
  for (let index = 0; index < expected.length; index++) accumulator |= expected[index]! ^ (actual[index] ?? 0);
  return accumulator === 0 && expected.length === actual.length;
}

/** One byte position: the XOR of the two bytes and the OR of every XOR so far. */
export interface TimingSafeEqualStep {
  readonly index: number;
  readonly difference: number;
  readonly accumulator: number;
}

/** The comparison of `timingSafeEqual` step by step, for narration. */
export interface TimingSafeEqualTrace {
  readonly lengthsMatch: boolean;
  readonly steps: readonly TimingSafeEqualStep[];
  /** Equals `timingSafeEqual(expected, actual)`. */
  readonly equal: boolean;
}

/** The per-byte XOR values over `expected` and the running OR accumulator. */
export function timingSafeEqualSteps(expected: Uint8Array, actual: Uint8Array): TimingSafeEqualTrace {
  const steps: TimingSafeEqualStep[] = [];
  let accumulator = 0;
  for (let index = 0; index < expected.length; index++) {
    const difference = expected[index]! ^ (actual[index] ?? 0);
    accumulator |= difference;
    steps.push({ index, difference, accumulator });
  }
  const lengthsMatch = expected.length === actual.length;
  return { lengthsMatch, steps, equal: lengthsMatch && accumulator === 0 };
}
