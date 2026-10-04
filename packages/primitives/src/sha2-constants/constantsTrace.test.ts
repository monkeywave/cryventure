import { stateAt, toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { CONSTANT_SPECS } from './constantSpecs.ts';
import { constantsRegions, deriveWords, recordConstants, wordValueId } from './constantsTrace.ts';

const NS = 'plugin.sha2-constants';
const NO_TABLE: readonly string[] = [];

describe('deriveWords', () => {
  it('K0 of SHA-256: the cube root of 2 is 1.428a2f98… (hex)', () => {
    const [k0] = deriveWords(CONSTANT_SPECS['sha256-k']);
    expect(k0).toEqual({ index: 0, primeNumber: 1, prime: 2, integerPart: 1n, skipped: 0n, word: 0x428a2f98n });
  });

  it('starts the SHA-384 IV at prime no. 9 (p = 23, √23 = 4.cbbb9d5d…)', () => {
    const words = deriveWords(CONSTANT_SPECS['sha384-iv']);
    expect(words.map((word) => word.prime)).toEqual([23, 29, 31, 37, 41, 43, 47, 53]);
    expect(words[0]).toMatchObject({ primeNumber: 9, integerPart: 4n, word: 0xcbbb9d5dc1059ed8n });
  });

  it('SHA-224 skips the first 32 fractional bits of the same roots and keeps the next 32', () => {
    const [h0] = deriveWords(CONSTANT_SPECS['sha224-iv']);
    expect(h0).toMatchObject({ prime: 23, skipped: 0xcbbb9d5dn, word: 0xc1059ed8n });
  });

  it('derives as many words as the table has', () => {
    expect(deriveWords(CONSTANT_SPECS['sha512-k'])).toHaveLength(80);
  });
});

describe('constantsRegions and wordValueId', () => {
  it('lays the table out as one blank words region labelled with the table symbol', () => {
    expect(constantsRegions(CONSTANT_SPECS['sha512-iv'])).toEqual([
      { id: 'constants', labelKey: `${NS}.region.constants`, elem: 'u8', shape: [64], layout: { kind: 'words', wordBytes: 8, labelPrefix: 'H', wordsPerGroup: 8 }, initial: 'blank' },
    ]);
    expect(constantsRegions(CONSTANT_SPECS['sha256-k'])[0]!.layout).toMatchObject({ wordBytes: 4, labelPrefix: 'K', wordsPerGroup: 8 });
  });

  it('gives word i the value id the values facet uses', () => {
    expect([wordValueId(0), wordValueId(12)]).toEqual(['0/word', '12/word']);
  });
});

describe('recordConstants', () => {
  const recording = recordConstants('sha256-iv', CONSTANT_SPECS['sha256-iv'], NO_TABLE);

  it('records one word step per word, each in its own scope, then the comparison', () => {
    expect(recording.state.steps.map((step) => step.op)).toEqual([...Array(8).fill('word'), 'compare']);
    expect(recording.state.steps.map((step) => step.scope)).toEqual(Array.from({ length: 9 }, (_, index) => [index]));
    expect(recording.state.initialNarration).toEqual({ key: `${NS}.step.initial.sha256-iv`, params: { section: '§5.3.3' } });
  });

  it('writes word i at its offset and narrates its prime and root', () => {
    expect(toHex(stateAt(recording.state, 0)['constants']!.slice(0, 4))).toBe('6a09e667');
    expect(recording.state.steps[1]!.narration).toEqual({ key: `${NS}.step.wordSquare`, params: { n: 2, p: 3, integer: '1', word: 'bb67ae85', bits: 32, symbol: 'H', index: 1 } });
    expect(recording.hexWords[7]).toBe('5be0cd19');
  });

  it('emits wordops terms p, integer part and word, linking the word to its value', () => {
    const step = recording.wordops.steps[2]!;
    expect(step.formula).toEqual({ key: `${NS}.math.wordSquare`, params: { symbol: 'H', index: 2, p: 5, bits: 32 } });
    expect(step.terms.map((term) => [term.id, term.role, term.hex])).toEqual([
      ['p', 'operand', '00000005'],
      ['integer', 'intermediate', '00000002'],
      ['word', 'result', '3c6ef372'],
    ]);
    expect(step.terms.at(-1)!.valueRef).toBe(wordValueId(2));
    expect(step.terms.map((term) => term.degree)).toEqual([undefined, 2, 2]);
    expect(recording.wordops.schemaVersion).toBe(2);
    expect(recording.wordops.wordBits).toBe(32);
  });

  it('adds the skipped bits as a term and uses the SquareSkip texts for SHA-224', () => {
    const sha224 = recordConstants('sha224-iv', CONSTANT_SPECS['sha224-iv'], NO_TABLE);
    expect(sha224.wordops.steps[0]!.terms.map((term) => term.id)).toEqual(['p', 'integer', 'skipped', 'word']);
    expect(sha224.wordops.steps[0]!.terms.map((term) => term.degree)).toEqual([undefined, 2, 2, 2]);
    expect(sha224.state.steps[0]!.narration).toMatchObject({ key: `${NS}.step.wordSquareSkip`, params: { skipped: 'cbbb9d5d', word: 'c1059ed8' } });
    expect(sha224.wordops.steps[0]!.formula.key).toBe(`${NS}.math.wordSquareSkip`);
  });

  it('uses the Cube texts for the round constants', () => {
    const k = recordConstants('sha512-k', CONSTANT_SPECS['sha512-k'], NO_TABLE);
    expect(k.state.steps[0]!.narration.key).toBe(`${NS}.step.wordCube`);
    expect(k.wordops.steps[0]!.terms[1]!.label.key).toBe(`${NS}.term.integerCube`);
    expect(k.wordops.steps[0]!.terms.filter((term) => term.op === 'root').map((term) => term.degree)).toEqual([3, 3]);
  });

  it('reports every word as a mismatch against an empty table', () => {
    expect(recording.mismatches).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(recording.state.steps.at(-1)!.narration).toEqual({ key: `${NS}.step.compareMismatch`, params: { count: 8, section: '§5.3.3', mismatches: 8 } });
  });
});
