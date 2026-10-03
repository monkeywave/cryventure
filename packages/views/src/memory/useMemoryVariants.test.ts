import { describe, expect, it } from 'vitest';
import { resolveVariants } from './useMemoryVariants.ts';
import { X86_AESNI, X86_CREF, memoryBundle, memoryFacets } from './testFixture.ts';

describe('resolveVariants', () => {
  it('reads variants from the bundle first, then the derived cache, in the given order', () => {
    const bundle = memoryBundle({ [X86_CREF]: memoryFacets[X86_CREF]! });
    const variants = resolveVariants(bundle, { [X86_AESNI]: memoryFacets[X86_AESNI] }, [
      'x86_64-linux-gnu+c-ref',
      'x86_64-linux-gnu+aesni',
    ]);
    expect(variants.map((entry) => entry.variant)).toEqual([
      'x86_64-linux-gnu+c-ref',
      'x86_64-linux-gnu+aesni',
    ]);
    expect(variants[1]!.facet).toBe(memoryFacets[X86_AESNI]);
    expect(variants[0]!.facet.impl?.id).toBe('c-ref');
  });

  it('skips variants without data and returns nothing without a bundle', () => {
    expect(resolveVariants(memoryBundle({}), {}, ['x86_64-linux-gnu+c-ref'])).toEqual([]);
    expect(
      resolveVariants(null, { [X86_CREF]: memoryFacets[X86_CREF] }, ['x86_64-linux-gnu+c-ref']),
    ).toEqual([]);
  });
});
