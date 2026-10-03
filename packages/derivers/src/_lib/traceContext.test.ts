import { describe, expect, it } from 'vitest';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';
import { traceContext } from './traceContext.ts';

describe('traceContext', () => {
  it('reads the op steps, value ids and key-schedule step of an AES bundle', () => {
    const context = traceContext(aesFixtureBundle('fips197-c1'));
    expect(context.ops.rounds).toBe(10);
    expect(context.subkeys.size).toBe(11);
    expect(context.keyId).toBe('key');
    expect(context.plaintextId).toBeDefined();
    expect(context.ciphertextId).toBeDefined();
    expect(context.keyScheduleStep).toBeGreaterThanOrEqual(0);
  });

  it('is computed once per bundle and shared across calls', () => {
    const bundle = aesFixtureBundle('fips197-c2');
    expect(traceContext(bundle)).toBe(traceContext(bundle));
    expect(traceContext(aesFixtureBundle('fips197-c2'))).not.toBe(traceContext(bundle));
  });

  it('throws on a bundle that breaks the AES contract, without caching the failure', () => {
    const bundle = { ...aesFixtureBundle('fips197-c1'), facets: {} };
    expect(() => traceContext(bundle)).toThrow();
    expect(() => traceContext(bundle)).toThrow();
  });
});
