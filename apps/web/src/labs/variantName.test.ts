import { describe, expect, it } from 'vitest';
import { isVariantName } from './variantName.ts';

describe('isVariantName', () => {
  it('accepts deriver variant names and lesson preferences', () => {
    for (const name of ['x86_64-aesni', 'x86_64-linux-gnu+aesni', 'aarch64-armv8-ce', 'c-ref', 'v1.2', 'aesni']) expect(isVariantName(name)).toBe(true);
  });

  it('rejects empty, padded, upper-case, or separator-edged names', () => {
    for (const name of ['', ' ', ' x86_64', 'X86_64', 'x86_64-', '-aesni', 'a--b', 'a b', 'x86/64', 'a+', undefined, 42]) expect(isVariantName(name)).toBe(false);
  });
});
