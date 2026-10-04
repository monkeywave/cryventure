import { defineDeriver } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { isSha256RoundBundle } from '../../applicability.ts';
import { catalogProblems, SHA_DERIVER_CONTRACT, shaApplicability } from './shaDeriverChecks.ts';

describe('catalogProblems', () => {
  it('reports one-language keys, keys outside the namespace and differing params', () => {
    const en = {
      'deriver.d.a': '{{x}}',
      'deriver.d.b': 'b',
      'other.c': 'c',
      'deriver.d.e': '{{y}}',
    };
    const de = { 'deriver.d.a': '{{x}}', 'other.c': 'c', 'deriver.d.e': '{{z}}' };
    expect(catalogProblems('d', en, de)).toEqual([
      'deriver.d.b: not in both catalogs',
      'deriver.d.e: params differ',
      'other.c: outside deriver.d.*',
    ]);
    expect(catalogProblems('d', { 'deriver.d.a': '{{x}}' }, { 'deriver.d.a': '{{x}}' })).toEqual(
      [],
    );
  });
});

describe('shaApplicability', () => {
  it('runs appliesTo over SHA round, SHA block and AES bundles', () => {
    const manifest = defineDeriver({
      ...SHA_DERIVER_CONTRACT,
      from: [...SHA_DERIVER_CONTRACT.from],
      provides: [...SHA_DERIVER_CONTRACT.provides],
      id: 'demo',
      appliesTo: isSha256RoundBundle,
      load: async () => ({ derive: () => ({}) }),
    });
    expect(shaApplicability(manifest)).toEqual([true, true, false, false]);
  });
});
