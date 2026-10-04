import type { TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { isAesOpBundle, isSha256RoundBundle, isSha512RoundBundle } from './applicability.ts';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';
import { shaFixtureBundle } from './sha/fixtures/shaBundles.ts';

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

describe('isSha256RoundBundle', () => {
  const abc = () => shaFixtureBundle('sha-256-abc');

  it('accepts SHA-256 and SHA-224 bundles at round detail', () => {
    expect(isSha256RoundBundle(abc())).toBe(true);
    expect(isSha256RoundBundle(shaFixtureBundle('sha-224-abc'))).toBe(true);
  });

  it('rejects block detail, another producer and AES', () => {
    const params = abc().params as Record<string, unknown>;
    expect([
      isSha256RoundBundle({ ...abc(), params: { ...params, detail: 'block' } }),
      isSha256RoundBundle({
        ...abc(),
        producer: { kind: 'primitive' as const, id: 'sha512', apiVersion: 1 },
      }),
      isSha256RoundBundle(c1()),
    ]).toEqual([false, false, false]);
  });
});

describe('isSha512RoundBundle', () => {
  it('accepts a sha512 bundle at round detail only', () => {
    const bundle = shaFixtureBundle('sha-512-abc');
    expect(isSha512RoundBundle(bundle)).toBe(true);
    expect(isSha512RoundBundle({ ...bundle, params: { detail: 'op' } })).toBe(false);
    expect(isSha512RoundBundle(shaFixtureBundle('sha-256-abc'))).toBe(false);
  });
});
