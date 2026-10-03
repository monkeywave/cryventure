import { memoryAt, validateMemoryFacet, type MemoryFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import golden from './fixtures/aes128-fips-c1.golden.json';
import { derive } from './module.ts';
import { AES_BUNDLES, aes128Bundle } from './testBundles.ts';

const VARIANTS = ['x86_64-c-ref', 'x86_64-aesni', 'aarch64-c-ref', 'aarch64-armv8-ce'];
const facetsOf = (facets: ReturnType<typeof derive>) => facets as Record<string, MemoryFacet>;
const variant = (facets: Record<string, MemoryFacet>, name: string) => facets[`memory@${name}`]!;
const reverseWords = (bytes: (number | undefined)[]) => Array.from({ length: bytes.length / 4 }, (_, word) => bytes.slice(word * 4, word * 4 + 4).reverse()).flat();

describe('memory deriver on real AES bundles', () => {
  it.each(AES_BUNDLES)('$presetId (AES-$keyBits): four valid variants, x86_64 first', ({ bundle }) => {
    const facets = facetsOf(derive(bundle));
    expect(Object.keys(facets)).toEqual(VARIANTS.map((name) => `memory@${name}`));
    for (const facet of Object.values(facets)) expect(validateMemoryFacet(facet)).toEqual([]);
  });

  it.each(AES_BUNDLES)('$presetId: variants differ exactly by word order and the rounds field', ({ bundle, rounds }) => {
    const facets = facetsOf(derive(bundle));
    const keyAt = (name: string) => memoryAt(variant(facets, name), 1).get('key')!;
    const scheduleLength = (rounds + 1) * 16;
    const cRef = keyAt('x86_64-c-ref');
    const aesni = keyAt('x86_64-aesni');
    const armv8 = keyAt('aarch64-armv8-ce');
    expect(reverseWords(cRef.slice(0, scheduleLength))).toEqual(aesni.slice(0, scheduleLength));
    expect(armv8.slice(0, scheduleLength)).toEqual(aesni.slice(0, scheduleLength));
    expect(keyAt('aarch64-c-ref')).toEqual(cRef);
    expect(cRef.slice(240)).toEqual([rounds, 0, 0, 0]);
    expect(aesni.slice(240)).toEqual([rounds - 1, 0, 0, 0]);
    expect(armv8.slice(240)).toEqual([rounds, 0, 0, 0]);
  });

  it.each(AES_BUNDLES)('$presetId: in and out hold plaintext and ciphertext at their steps', ({ bundle }) => {
    for (const facet of Object.values(facetsOf(derive(bundle)))) {
      const last = facet.writes.at(-1)!.align.last;
      expect(memoryAt(facet, -1).get('in')).toEqual(memoryAt(facet, last).get('in'));
      expect(memoryAt(facet, last).get('out')).toEqual(bundle.output['ciphertext']);
    }
  });

  it('only the target changes the addresses (x86_64 0x7ffc…, aarch64 0xffff…)', () => {
    const facets = facetsOf(derive(aes128Bundle()));
    const addresses = (name: string) => variant(facets, name).allocations.map(({ addr }) => addr);
    expect(addresses('x86_64-c-ref')).toEqual(addresses('x86_64-aesni'));
    expect(addresses('aarch64-c-ref')).toEqual(addresses('aarch64-armv8-ce'));
    expect(addresses('x86_64-c-ref').every((addr) => addr.startsWith('0x7ffc'))).toBe(true);
    expect(addresses('aarch64-c-ref').every((addr) => addr.startsWith('0xffff'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(derive(aes128Bundle())).toEqual(derive(aes128Bundle()));
  });

  it('matches the golden fixture (FIPS 197 C.1)', () => {
    expect(golden.producerId).toBe('aes');
    expect(golden.presetId).toBe(AES_BUNDLES[0]!.presetId);
    expect(JSON.parse(JSON.stringify(derive(aes128Bundle())))).toEqual(golden.facets);
  });

  it('throws on a broken contract', () => {
    const bundle = aes128Bundle();
    delete bundle.facets['state@default'];
    expect(() => derive(bundle)).toThrow(/AES trace contract/);
  });
});
