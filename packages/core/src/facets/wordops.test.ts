import { describe, expect, it } from 'vitest';
import { validateWordopsFacet, type WordopsFacet, type WordopsStep } from './wordops.ts';

const ref = (key: string) => ({ key });
const registerNames = ['a', 'b'];

function validFacet(): WordopsFacet {
  return {
    kind: 'wordops',
    schemaVersion: 1,
    wordBits: 32,
    registerNames,
    steps: [
      {
        step: -1,
        formula: ref('plugin.sha256.formula.init'),
        terms: [{ id: 'a', label: ref('plugin.sha256.term.a'), hex: '6a09e667', role: 'constant' }],
        registers: { before: ['00000000', '00000000'], after: ['6a09e667', 'bb67ae85'] },
      },
      {
        step: 0,
        formula: { key: 'plugin.sha256.formula.T1', params: { t: 0 } },
        terms: [
          { id: 'Sigma1', label: ref('plugin.sha256.term.Sigma1'), hex: '3587272b', role: 'intermediate', op: 'Sigma1', valueRef: 'v.sigma1' },
          { id: 'T1', label: ref('plugin.sha256.term.T1'), hex: '0c657a79', role: 'result', op: 'add' },
        ],
      },
    ],
  };
}

function withStep(change: Partial<WordopsStep>, index = 1): WordopsFacet {
  const facet = validFacet();
  facet.steps[index] = { ...facet.steps[index]!, ...change };
  return facet;
}

describe('validateWordopsFacet', () => {
  it('accepts a valid facet, with and without stepCount', () => {
    expect(validateWordopsFacet(validFacet())).toEqual([]);
    expect(validateWordopsFacet(validFacet(), 1)).toEqual([]);
  });

  it('accepts 64-bit words and a facet without registers', () => {
    const facet: WordopsFacet = {
      kind: 'wordops',
      schemaVersion: 1,
      wordBits: 64,
      steps: [{ step: 3, formula: ref('f'), terms: [{ id: 'h', label: ref('l'), hex: '6a09e667f3bcc908', role: 'constant' }] }],
    };
    expect(validateWordopsFacet(facet)).toEqual([]);
  });

  it('rejects a wordBits other than 32 or 64', () => {
    const facet = { ...validFacet(), wordBits: 16 } as unknown as WordopsFacet;
    expect(validateWordopsFacet(facet)).toEqual(['wordops: wordBits 16 is not 32 or 64']);
  });

  it('rejects hex of the wrong length', () => {
    const term = { ...validFacet().steps[1]!.terms[0]!, hex: '3587272b00' };
    expect(validateWordopsFacet(withStep({ terms: [term] }))).toEqual(['wordops step 0 term "Sigma1": hex "3587272b00" is not 8 lowercase hex digits']);
  });

  it('rejects uppercase and non-hex digits', () => {
    const upper = { ...validFacet().steps[1]!.terms[0]!, hex: '3587272B' };
    const nonHex = { ...validFacet().steps[1]!.terms[1]!, hex: '0c657a7g' };
    expect(validateWordopsFacet(withStep({ terms: [upper, nonHex] }))).toEqual([
      'wordops step 0 term "Sigma1": hex "3587272B" is not 8 lowercase hex digits',
      'wordops step 0 term "T1": hex "0c657a7g" is not 8 lowercase hex digits',
    ]);
  });

  it('rejects 32-bit hex in a 64-bit facet', () => {
    const facet = { ...validFacet(), wordBits: 64 as const, registerNames: undefined, steps: [validFacet().steps[1]!] };
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0 term "Sigma1": hex "3587272b" is not 16 lowercase hex digits',
      'wordops step 0 term "T1": hex "0c657a79" is not 16 lowercase hex digits',
    ]);
  });

  it('rejects duplicate term ids within a step but allows them across steps', () => {
    const [first] = validFacet().steps[1]!.terms;
    expect(validateWordopsFacet(withStep({ terms: [first!, first!] }))).toEqual(['wordops step 0 term "Sigma1": duplicate id']);
    const across = withStep({ terms: [{ ...first!, id: 'a' }] });
    expect(validateWordopsFacet(across)).toEqual([]);
  });

  it('rejects non-increasing and non-integer steps', () => {
    expect(validateWordopsFacet(withStep({ step: -1 }))).toEqual(['wordops: step -1 does not increase (after -1)']);
    expect(validateWordopsFacet(withStep({ step: 0.5 }))).toEqual(['wordops: step 0.5 is not an integer ≥ -1']);
    expect(validateWordopsFacet(withStep({ step: -2 }))).toEqual(['wordops: step -2 is not an integer ≥ -1', 'wordops: step -2 does not increase (after -1)']);
  });

  it('rejects steps outside -1..stepCount-1 when stepCount is given', () => {
    expect(validateWordopsFacet(withStep({ step: 5 }), 5)).toEqual(['wordops: step 5 outside -1..4']);
    expect(validateWordopsFacet(withStep({ step: 5 }), 6)).toEqual([]);
    expect(validateWordopsFacet(withStep({ step: 5 }))).toEqual([]);
  });

  it('rejects registers without registerNames', () => {
    const facet = { ...validFacet(), registerNames: undefined };
    expect(validateWordopsFacet(facet)).toEqual(['wordops step -1: registers without registerNames']);
  });

  it('rejects registers whose before/after lengths differ from registerNames', () => {
    const facet = withStep({ registers: { before: ['00000000'], after: ['00000000', '00000000', '00000000'] } }, 0);
    expect(validateWordopsFacet(facet)).toEqual(['wordops step -1: registers.before has 1 words, expected 2', 'wordops step -1: registers.after has 3 words, expected 2']);
  });

  it('rejects register words that are not wordBits / 4 lowercase hex digits', () => {
    const facet = withStep({ registers: { before: ['0000000', '00000000'], after: ['ABCDEF01', '00000000'] } }, 0);
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step -1: registers.before[0] "0000000" is not 8 lowercase hex digits',
      'wordops step -1: registers.after[0] "ABCDEF01" is not 8 lowercase hex digits',
    ]);
  });

  it('rejects malformed I18nRefs in formulas and labels', () => {
    const badLabel = { ...validFacet().steps[1]!.terms[0]!, label: { key: '' } };
    const badParams = { ...validFacet().steps[1]!.terms[1]!, label: { key: 'k', params: { n: true } } } as unknown as WordopsStep['terms'][number];
    const facet = withStep({ formula: 'plain text' as unknown as WordopsStep['formula'], terms: [badLabel, badParams] });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0 formula: not a well-formed I18nRef',
      'wordops step 0 term "Sigma1" label: not a well-formed I18nRef',
      'wordops step 0 term "T1" label: not a well-formed I18nRef',
    ]);
    const arrayParams = withStep({ formula: { key: 'k', params: [] as unknown as Record<string, string> } });
    expect(validateWordopsFacet(arrayParams)).toEqual(['wordops step 0 formula: not a well-formed I18nRef']);
  });
});
