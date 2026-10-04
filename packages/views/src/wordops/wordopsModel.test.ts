import type { WordopsFacet, WordopsStep, WordTerm } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { loadViewMessages } from '../messages.ts';
import { WORD_OPS } from '@cryventure/core';
import {
  TERM_ROLE_GLYPHS,
  arrowTermText,
  opGlyphKey,
  opNameKey,
  isStoryTerm,
  nibbleGroups,
  lensParts,
  registerChunksPerLine,
  sha2RegisterShift,
  showsBitStrip,
  storyTerms,
  upgradeWordops,
  wordBitsOf,
} from './wordopsModel.ts';

const step = (index: number, extra: Partial<WordopsStep> = {}): WordopsStep => ({ step: index, formula: { key: 'f' }, terms: [], ...extra });
const term = (id: string, hex: string, role: WordTerm['role'] = 'intermediate'): WordTerm => ({ id, label: { key: id }, hex, role });

describe('wordopsModel', () => {
  it('shows a neutral root glyph without a degree, √ / ∛ with one, from the catalog in EN and DE', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = loadViewMessages(locale);
      expect(messages[opGlyphKey({ op: 'root' })]).toBe('ⁿ√');
      expect(messages[opGlyphKey({ op: 'root', degree: 2 })]).toBe('√');
      expect(messages[opGlyphKey({ op: 'root', degree: 3 })]).toBe('∛');
      expect(messages[opNameKey({ op: 'root', degree: 3 })]).toBeTruthy();
      expect(messages[opNameKey({ op: 'root', degree: 2 })]).not.toBe(messages[opNameKey({ op: 'root', degree: 3 })]);
    }
  });

  it('ignores a degree on any op but root', () => {
    expect(opGlyphKey({ op: 'add', degree: 2 })).toBe('view.wordops.glyph.add');
    expect(opNameKey({ op: 'add', degree: 2 })).toBe('view.wordops.op.add');
  });

  it('has a glyph and a spoken name for every op in EN and DE (incl. or, parity, md5G, md5I)', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = loadViewMessages(locale);
      for (const op of WORD_OPS) {
        expect(messages[opGlyphKey({ op })], `${locale} glyph ${op}`).toBeTruthy();
        expect(messages[opNameKey({ op })], `${locale} name ${op}`).toBeTruthy();
      }
    }
  });

  it('keeps FIPS 180-4 op notation in the catalog of both languages', () => {
    for (const locale of ['en', 'de'] as const) {
      const messages = loadViewMessages(locale);
      expect([opGlyphKey({ op: 'rotr' }), opGlyphKey({ op: 'shr' }), opGlyphKey({ op: 'ch' }), opGlyphKey({ op: 'maj' })].map((key) => messages[key])).toEqual(['ROTR', 'SHR', 'Ch', 'Maj']);
    }
  });

  it('gives every term role a distinct non-colour glyph', () => {
    expect(new Set(Object.values(TERM_ROLE_GLYPHS)).size).toBe(5);
  });

  it('groups bits by nibble for the accessible name', () => {
    expect(nibbleGroups(wordBitsOf('a1'))).toBe('1010 0001');
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

  it('story lens: only the terms marked story, none when none is (even results)', () => {
    const story = (id: string): WordTerm => ({ ...term(id, '00000000'), emphasis: 'story' });
    expect(storyTerms([term('T1', '0'), story('newB'), term('W', '0', 'result')]).map((each) => each.id)).toEqual(['newB']);
    expect(storyTerms([term('W', '0', 'result'), term('T1', '0')])).toEqual([]);
  });

  describe('upgradeWordops', () => {
    const facet = (schemaVersion: WordopsFacet['schemaVersion'], steps: WordopsStep[]): WordopsFacet => ({ kind: 'wordops', schemaVersion, wordBits: 32, steps });
    const arrowsOf = (schemaVersion: WordopsFacet['schemaVersion'], wordopsStep: WordopsStep) => upgradeWordops(facet(schemaVersion, [wordopsStep])).steps[0]!.arrows;
    const storyIds = (schemaVersion: WordopsFacet['schemaVersion'], terms: WordTerm[]) => storyTerms(upgradeWordops(facet(schemaVersion, [step(0, { terms })])).steps[0]!.terms).map((each) => each.id);
    const before = ['0', '1', '2', '3'];
    const md5Round = step(2, {
      terms: [term('newB', '00000004')],
      registers: {
        before,
        after: ['3', '00000004', '1', '2'],
        transfers: [
          { to: 0, from: { register: 3 } },
          { to: 1, from: { term: 'newB' } },
          { to: 2, from: { register: 1 } },
          { to: 3, from: { register: 2 } },
        ],
      },
    });
    const sha2Shaped = step(0, { terms: [term('T1', '0'), term('T2', '0')], registers: { before: Array(8).fill('0'), after: Array(8).fill('0') } });

    it('reads every facet as v2, keeping its steps in order', () => {
      const upgraded = upgradeWordops(facet(1, [step(-1), step(3)]));
      expect(upgraded.schemaVersion).toBe(2);
      expect(upgraded.steps.map((each) => each.step)).toEqual([-1, 3]);
    });

    it('v2: one arrow per transfer, register copies and term arrows', () => {
      expect(arrowsOf(2, md5Round)).toEqual([
        { to: 0, from: 3, source: 'copy' },
        { to: 1, term: 'newB', source: 'term' },
        { to: 2, from: 1, source: 'copy' },
        { to: 3, from: 2, source: 'copy' },
      ]);
    });

    it('v2 without transfers: no arrows, not even for a SHA-2-shaped round (no structural guess)', () => {
      expect(arrowsOf(2, sha2Shaped)).toBeUndefined();
    });

    it('v1: the structural SHA-2 shift becomes the arrows; transfers are ignored', () => {
      expect(arrowsOf(1, sha2Shaped)).toBe(sha2RegisterShift(sha2Shaped));
      expect(arrowsOf(1, md5Round)).toBeUndefined();
    });

    it('no registers: no arrows', () => {
      expect(arrowsOf(2, step(0))).toBeUndefined();
      expect(arrowsOf(1, step(0))).toBeUndefined();
    });

    it('v1: results and T1/T2 become the story terms (the structural filter as emphasis)', () => {
      expect(storyIds(1, [term('T1', '0'), term('Ch', '0'), term('W', '0', 'result')])).toEqual(['T1', 'W']);
    });

    it('v2: emphasis stays as given', () => {
      expect(storyIds(2, [term('T1', '0'), { ...term('newB', '0'), emphasis: 'story' }, term('W', '0', 'result')])).toEqual(['newB']);
    });
  });

  it('arrow text of a term: the right-hand side of its label, else the label', () => {
    expect(arrowTermText('e (new) = d + T1')).toBe('d + T1');
    expect(arrowTermText('a = b = c')).toBe('c');
    expect(arrowTermText('ROTL³⁰(b)')).toBe('ROTL³⁰(b)');
    expect(arrowTermText('  T ')).toBe('T');
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
