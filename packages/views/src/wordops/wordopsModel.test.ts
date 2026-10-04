import type { WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { OP_GLYPHS, TERM_ROLE_GLYPHS, hexChunks, isStoryTerm, nibbleGroups, lensParts, registerChunksPerLine, sha2RegisterShift, showsBitStrip, wordBitsOf, wordopsStepAt } from './wordopsModel.ts';

const step = (index: number, extra: Partial<WordopsStep> = {}): WordopsStep => ({ step: index, formula: { key: 'f' }, terms: [], ...extra });
const term = (id: string, hex: string, role: WordTerm['role'] = 'intermediate'): WordTerm => ({ id, label: { key: id }, hex, role });

describe('wordopsModel', () => {
  it('finds the latest step at or before the playhead', () => {
    const facet: WordopsFacet = { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [step(-1), step(3), step(7)] };
    expect(wordopsStepAt(facet, -2)).toBeUndefined();
    expect(wordopsStepAt(facet, -1)?.step).toBe(-1);
    expect(wordopsStepAt(facet, 5)?.step).toBe(3);
    expect(wordopsStepAt(facet, 99)?.step).toBe(7);
    expect(wordopsStepAt({ ...facet, steps: [] }, 0)).toBeUndefined();
  });

  it('shows a neutral root glyph (the facet carries no root degree)', () => {
    expect(OP_GLYPHS.root).toBe('ⁿ√');
  });

  it('gives every term role a distinct non-colour glyph', () => {
    expect(new Set(Object.values(TERM_ROLE_GLYPHS)).size).toBe(5);
  });

  it('groups bits by nibble for the accessible name', () => {
    expect(nibbleGroups(wordBitsOf('a1'))).toBe('1010 0001');
  });

  it('chunks hex into lowercase 4-digit groups', () => {
    expect(hexChunks('6A09E667')).toEqual(['6a09', 'e667']);
    expect(hexChunks('6a09e667f3bcc908')).toEqual(['6a09', 'e667', 'f3bc', 'c908']);
  });

  it('breaks only 64-bit register words onto lines of two chunks', () => {
    expect(registerChunksPerLine(64)).toBe(2);
    expect(registerChunksPerLine(32)).toBeUndefined();
  });

  it('reads bits MSB → LSB', () => {
    expect(wordBitsOf('a1').map(Number)).toEqual([1, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('draws bit strips only for 32-bit rotation/shift terms', () => {
    expect(showsBitStrip({ op: 'rotr' }, 32)).toBe(true);
    expect(showsBitStrip({ op: 'sigma1' }, 32)).toBe(true);
    expect(showsBitStrip({ op: 'Sigma0' }, 64)).toBe(false);
    expect(showsBitStrip({ op: 'add' }, 32)).toBe(false);
    expect(showsBitStrip({}, 32)).toBe(false);
  });

  it('story filter keeps results and T1/T2', () => {
    expect(isStoryTerm({ id: 'T1', role: 'intermediate' })).toBe(true);
    expect(isStoryTerm({ id: 'W', role: 'result' })).toBe(true);
    expect(isStoryTerm({ id: 'Ch', role: 'intermediate' })).toBe(false);
  });

  it('maps lenses to parts', () => {
    expect(lensParts('story')).toEqual({ formula: false, bitStrips: false, storyTermsOnly: true });
    expect(lensParts('engineer')).toEqual({ formula: false, bitStrips: true, storyTermsOnly: false });
    expect(lensParts('cryptographer')).toEqual({ formula: true, bitStrips: false, storyTermsOnly: false });
  });

  describe('sha2RegisterShift', () => {
    /*
     * FIPS 180-4 example "abc", SHA-256 round 0 (real round values, T1 and T2 as the round computes
     * them): the shift's arrows must agree with them, which the view no longer re-checks at run time.
     */
    const before = ['6a09e667', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527f', '9b05688c', '1f83d9ab', '5be0cd19'];
    const after = ['5d6aebcd', '6a09e667', 'bb67ae85', '3c6ef372', 'fa2a4622', '510e527f', '9b05688c', '1f83d9ab'];
    const T1 = '54da50e8';
    const T2 = '08909ae5';
    const round = step(0, { terms: [term('T1', T1), term('T2', T2)], registers: { before, after } });
    const add32 = (left: string, right: string) => ((BigInt(`0x${left}`) + BigInt(`0x${right}`)) % BigInt(2) ** BigInt(32)).toString(16).padStart(8, '0');

    it('returns the eight arrows for a round (eight registers plus T1 and T2)', () => {
      expect(sha2RegisterShift(round)?.map((arrow) => [arrow.to, arrow.from, arrow.source])).toEqual([
        [0, undefined, 'sum'],
        [1, 0, 'copy'],
        [2, 1, 'copy'],
        [3, 2, 'copy'],
        [4, 3, 'plusT1'],
        [5, 4, 'copy'],
        [6, 5, 'copy'],
        [7, 6, 'copy'],
      ]);
    });

    it('agrees with the round data: copies move words right, e ← d + T1, a ← T1 + T2', () => {
      const expected = sha2RegisterShift(round)!.map((arrow) => {
        if (arrow.source === 'sum') return add32(T1, T2);
        const from = before[arrow.from!]!;
        return arrow.source === 'plusT1' ? add32(from, T1) : from;
      });
      expect(expected).toEqual(after);
    });

    it('returns undefined without T1/T2 or eight registers (init and feed-forward steps)', () => {
      expect(sha2RegisterShift({ ...round, terms: [term('T1', T1)] })).toBeUndefined();
      expect(sha2RegisterShift({ ...round, registers: undefined })).toBeUndefined();
      expect(sha2RegisterShift({ ...round, registers: { before: before.slice(0, 5), after: after.slice(0, 5) } })).toBeUndefined();
    });
  });
});
