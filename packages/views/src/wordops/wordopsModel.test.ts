import type { WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { hexChunks, isStoryTerm, lensParts, sha2RegisterShift, showsBitStrip, wordBitsOf, wordopsStepAt } from './wordopsModel.ts';

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

  it('chunks hex into lowercase 4-digit groups', () => {
    expect(hexChunks('6A09E667')).toEqual(['6a09', 'e667']);
    expect(hexChunks('6a09e667f3bcc908')).toEqual(['6a09', 'e667', 'f3bc', 'c908']);
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
    const before = ['00000001', '00000002', '00000003', '00000004', '00000005', '00000006', '00000007', '00000008'];
    const t1 = 'fffffff0';
    const t2 = '00000020';
    // a = T1 + T2 (mod 2³²) = 0x10, e = d + T1 = 0xfffffff4.
    const after = ['00000010', '00000001', '00000002', '00000003', 'fffffff4', '00000005', '00000006', '00000007'];
    const round = step(0, { terms: [term('T1', t1), term('T2', t2)], registers: { before, after } });

    it('returns the eight arrows when the data agrees', () => {
      expect(sha2RegisterShift(round, 32)?.map((arrow) => [arrow.to, arrow.from, arrow.source])).toEqual([
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

    it('returns undefined when the data disagrees or T1/T2 are missing', () => {
      expect(sha2RegisterShift({ ...round, registers: { before, after: before } }, 32)).toBeUndefined();
      expect(sha2RegisterShift({ ...round, terms: [term('T1', t1)] }, 32)).toBeUndefined();
      expect(sha2RegisterShift({ ...round, registers: undefined }, 32)).toBeUndefined();
      expect(sha2RegisterShift({ ...round, registers: { before: before.slice(0, 5), after: after.slice(0, 5) } }, 32)).toBeUndefined();
    });

    it('adds modulo 2⁶⁴ for 64-bit words', () => {
      const wide = (hex: string) => hex.padStart(16, '0');
      const big = step(0, {
        terms: [term('T1', 'ffffffffffffffff'), term('T2', wide('2'))],
        registers: {
          before: before.map(wide),
          after: [wide('1'), ...before.slice(0, 3).map(wide), wide('3'), ...before.slice(4, 7).map(wide)],
        },
      });
      expect(sha2RegisterShift(big, 64)).toHaveLength(8);
    });
  });
});
