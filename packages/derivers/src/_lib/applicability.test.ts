import type { TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { isAesOpBundle } from './applicability.ts';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';

const c1 = () => aesFixtureBundle('fips197-c1');
const withParams = (params: unknown): TraceBundle => ({ ...c1(), params });

describe('isAesOpBundle', () => {
  it('accepts a real AES bundle at op detail', () => {
    expect(isAesOpBundle(c1())).toBe(true);
  });

  it('rejects another producer', () => {
    const other = { ...c1(), producer: { kind: 'primitive' as const, id: 'xor', apiVersion: 1 } };
    expect(isAesOpBundle(other)).toBe(false);
  });

  it('reads the detail from params: round detail, missing detail and non-object params are rejected', () => {
    const params = c1().params as Record<string, unknown>;
    expect([
      isAesOpBundle(withParams({ ...params, detail: 'round' })),
      isAesOpBundle(withParams({ keyHex: params['keyHex'], plaintextHex: params['plaintextHex'] })),
      isAesOpBundle(withParams(null)),
      isAesOpBundle(withParams('op')),
    ]).toEqual([false, false, false, false]);
  });
});
