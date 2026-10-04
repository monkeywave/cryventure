import { i18nRef } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { compressDetailed, gDetail } from '../_lib/blake2/compress.ts';
import { BLAKE2B, BLAKE2S } from '../_lib/blake2/variants.ts';
import { Blake2Recorder, V_REGISTER_NAMES } from './recorder.ts';
import { initialSnapshot } from '../_lib/sha2/regions.ts';
import { termFactory } from '../_lib/sha2/wordTerms.ts';
import { blake2Regions } from './regions.ts';
import { feedForwardTerms, gTerms, gTransfers, initTerms, loadTerms } from './terms.ts';

const NS = 'plugin.blake2';

describe('blake2Regions', () => {
  it('sizes m, h and v in words; omits message and key when empty', () => {
    const regions = blake2Regions(NS, { messageBytes: 0, keyBytes: 0, wordBytes: 8, outputBytes: 48 });
    expect(regions.map((region) => [region.id, region.shape[0], region.initial ?? 'given'])).toEqual([
      ['m', 128, 'blank'],
      ['h', 64, 'blank'],
      ['v', 128, 'blank'],
      ['digest', 48, 'blank'],
    ]);
  });

  it('starts from the message and the key; everything else zero', () => {
    const regions = blake2Regions(NS, { messageBytes: 2, keyBytes: 1, wordBytes: 4, outputBytes: 32 });
    const initial = initialSnapshot(regions, { message: [1, 2], key: [9] });
    expect([initial.message, initial.key, initial.h.length, initial.h.every((byte) => byte === 0)]).toEqual([[1, 2], [9], 32, true]);
  });
});

describe('Blake2Recorder', () => {
  const regions = blake2Regions(NS, { messageBytes: 0, keyBytes: 0, wordBytes: 4, outputBytes: 32 });
  const step = (op: 'init' | 'g') => ({ op, writes: [], highlights: [], narration: i18nRef(`${NS}.step.x`) });

  it('records steps in explicit nested scopes and pairs wordops steps by index', () => {
    const recorder = new Blake2Recorder(regions, initialSnapshot(regions, {}), i18nRef(`${NS}.step.initial`));
    recorder.scope(0, () => {
      recorder.step(step('init'));
      recorder.scope(3, () => recorder.scope(5, () => recorder.step(step('g'), { formula: i18nRef(`${NS}.formula.g`), terms: [] })));
    });
    const facet = recorder.stateFacet([]);
    expect(facet.steps.map((entry) => entry.scope)).toEqual([[0], [0, 3, 5]]);
    expect(recorder.wordopsFacet(32)).toEqual({ kind: 'wordops', schemaVersion: 2, wordBits: 32, registerNames: [...V_REGISTER_NAMES], registerColumns: 4, steps: [{ step: 1, formula: { key: `${NS}.formula.g` }, terms: [] }] });
  });
});

describe('blake2 terms', () => {
  const term = termFactory(NS, BLAKE2S.arith);
  const block = compressDetailed(BLAKE2S, BLAKE2S.iv, Array.from({ length: 16 }, (_, j) => j), 64, true);

  it('G: the transfers name a″ … d″ for the positions a, b, c, d', () => {
    const g = gDetail(BLAKE2S, block.vLoaded, block.m, 0, 7);
    expect(gTransfers(g)).toEqual([
      { to: 3, from: { term: 'a2' } },
      { to: 4, from: { term: 'b2' } },
      { to: 9, from: { term: 'c2' } },
      { to: 14, from: { term: 'd2' } },
    ]);
    const terms = gTerms(term, BLAKE2S, g);
    expect(terms.find((entry) => entry.id === 'b2')!.hex).toBe(BLAKE2S.arith.toHex(g.after[4]!));
    expect(terms.find((entry) => entry.id === 'x')!.label).toEqual({ key: `${NS}.term.x`, params: { j: 14 } });
  });

  it('init: P0 then h0 = IV0 ⊕ P0 and the other IV words', () => {
    const terms = initTerms(term, 0x01010020, [1, 2], 32, 0);
    expect(terms.map((entry) => [entry.id, entry.role, entry.op ?? '-'])).toEqual([
      ['p0', 'constant', '-'],
      ['h0', 'result', 'xor'],
      ['h1', 'constant', '-'],
    ]);
  });

  it('load: m0 … m15, t0, t1, f0 (last-block label) and v12 … v14', () => {
    const terms = loadTerms(term, BLAKE2S, block);
    expect(terms.map((entry) => entry.id).slice(15)).toEqual(['m15', 't0', 't1', 'f0', 'v12', 'v13', 'v14']);
    expect(terms.find((entry) => entry.id === 'f0')!.label.key).toBe(`${NS}.term.f0Last`);
    expect(terms.find((entry) => entry.id === 't0')!.hex).toBe('00000040');
  });

  it('feed-forward: eight XOR results linked to the chaining value', () => {
    const b64 = termFactory(NS, BLAKE2B.arith);
    const terms = feedForwardTerms(b64, [1n, 2n], 'h/1');
    expect(terms.map((entry) => [entry.id, entry.valueRef, entry.hex])).toEqual([
      ['h0', 'h/1', '0000000000000001'],
      ['h1', 'h/1', '0000000000000002'],
    ]);
  });
});
