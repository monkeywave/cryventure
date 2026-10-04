import { allIndices } from '@cryventure/core';

/** Indices where `derived` and `reference` differ (a missing entry counts as different). */
export function mismatchedIndices<T>(derived: readonly T[], reference: readonly T[]): number[] {
  return allIndices(Math.max(derived.length, reference.length)).filter((index) => derived[index] !== reference[index]);
}
