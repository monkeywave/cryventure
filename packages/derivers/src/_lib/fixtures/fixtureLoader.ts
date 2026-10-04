import type { TraceBundle } from '@cryventure/core';

/** Test-only: the two ways the deriver tests load a JSON bundle snapshot by preset. */

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export interface FixtureLoader<P extends string> {
  /** A fresh deep copy of the preset's bundle (tests may mutate it). */
  fresh(preset: P): TraceBundle;
  /**
   * The preset's bundle itself, deep-frozen, for tests that only read it: no copy per call, and the
   * per-bundle trace caches hit across tests. Use `fresh` to tamper with a bundle.
   */
  shared(preset: P): TraceBundle;
}

export function fixtureLoader<P extends string>(
  fixtures: Readonly<Record<P, { bundle: unknown }>>,
): FixtureLoader<P> {
  return {
    fresh: (preset) => JSON.parse(JSON.stringify(fixtures[preset].bundle)) as TraceBundle,
    shared: (preset) => deepFreeze(fixtures[preset].bundle) as TraceBundle,
  };
}
