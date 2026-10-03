import type { AnyStateFacet, TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { isAesOpBundle } from './applicability.ts';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';

const c1 = () => aesFixtureBundle('fips197-c1');
const stateOf = (bundle: TraceBundle) => bundle.facets['state@default'] as AnyStateFacet;

describe('isAesOpBundle', () => {
  it('accepts a real AES bundle at op detail', () => {
    expect(isAesOpBundle(c1())).toBe(true);
  });

  it('rejects another producer, a missing state facet and round-detail steps', () => {
    const other = { ...c1(), producer: { kind: 'primitive' as const, id: 'xor', apiVersion: 1 } };
    const stateless = { ...c1(), facets: {} };
    const merged = c1();
    stateOf(merged).steps[3]!.op = 'round';
    expect([isAesOpBundle(other), isAesOpBundle(stateless), isAesOpBundle(merged)]).toEqual([
      false,
      false,
      false,
    ]);
  });
});
