import { assertTopologicalOrder, derivationAncestors, derivationInputs, derivationNode, getFacet, toHex, type DerivationFacet, type DerivationNode, type StateFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { keyScheduleDerivation, rconNodeId, wordNodeId } from './derivation.ts';
import { expandKey, roundCount } from './keyExpansion.ts';
import { AES_PRESETS } from './manifest.ts';
import { run } from './module.ts';
import { hexBytes } from './testHelpers.ts';
import vectors from './vectors/fips197.json';

const KEY_128 = '2b7e151628aed2a6abf7158809cf4f3c';
const KEY_256 = '603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4';

function schedule(keyHex: string, stepOf: (round: number) => number | undefined = () => undefined): DerivationFacet {
  const key = hexBytes(keyHex);
  return keyScheduleDerivation(key, roundCount(key.length), stepOf);
}

function hexOf(facet: DerivationFacet, id: string): string {
  const node = derivationNode(facet, id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return toHex(node.bytes);
}

const primary = (facet: DerivationFacet): DerivationNode[] => facet.nodes.filter((node) => node.group !== undefined);

/** One row of FIPS 197 App. A: temp, after RotWord, after SubWord, Rcon, after XOR with Rcon, w[i−Nk], w[i]. */
interface ExpansionRow {
  i: number;
  temp: string;
  rotWord?: string;
  subWord?: string;
  rcon?: string;
  xorRcon?: string;
  back: string;
  word: string;
}

const A1_ROWS: ExpansionRow[] = [
  { i: 4, temp: '09cf4f3c', rotWord: 'cf4f3c09', subWord: '8a84eb01', rcon: '01000000', xorRcon: '8b84eb01', back: '2b7e1516', word: 'a0fafe17' },
  { i: 5, temp: 'a0fafe17', back: '28aed2a6', word: '88542cb1' },
  { i: 8, temp: '2a6c7605', rotWord: '6c76052a', subWord: '50386be5', rcon: '02000000', xorRcon: '52386be5', back: 'a0fafe17', word: 'f2c295f2' },
  { i: 40, temp: '575c006e', rotWord: '5c006e57', subWord: '4a639f5b', rcon: '36000000', xorRcon: '7c639f5b', back: 'ac7766f3', word: 'd014f9a8' },
];

describe('keyScheduleDerivation (FIPS 197 App. A)', () => {
  it.each(A1_ROWS)('A.1 AES-128 row i = $i', (row) => {
    const facet = schedule(KEY_128);
    expect(hexOf(facet, wordNodeId(row.i - 1))).toBe(row.temp);
    expect(hexOf(facet, wordNodeId(row.i - 4))).toBe(row.back);
    expect(hexOf(facet, wordNodeId(row.i))).toBe(row.word);
    if (row.rotWord === undefined) {
      expect(derivationNode(facet, wordNodeId(row.i))?.inputs).toEqual([wordNodeId(row.i - 1), wordNodeId(row.i - 4)]);
      return;
    }
    expect(hexOf(facet, `w/${row.i}/rotWord`)).toBe(row.rotWord);
    expect(hexOf(facet, `w/${row.i}/subWord`)).toBe(row.subWord);
    expect(hexOf(facet, rconNodeId(row.i / 4))).toBe(row.rcon);
    expect(hexOf(facet, `w/${row.i}/xorRcon`)).toBe(row.xorRcon);
  });

  it('A.3 AES-256 row i = 12 (i mod Nk = 4: SubWord only)', () => {
    const facet = schedule(KEY_256);
    expect(hexOf(facet, wordNodeId(11))).toBe('2067fcde');
    expect(hexOf(facet, 'w/12/subWord')).toBe('b785b01d');
    expect(hexOf(facet, wordNodeId(4))).toBe('1f352c07');
    expect(hexOf(facet, wordNodeId(12))).toBe('a8b09c1a');
    expect(derivationNode(facet, wordNodeId(12))?.inputs).toEqual(['w/12/subWord', wordNodeId(4)]);
    expect(derivationNode(facet, 'w/12/rotWord')).toBeUndefined();
  });

  it('A.3 AES-256 row i = 8 (RotWord, SubWord, Rcon[1])', () => {
    const facet = schedule(KEY_256);
    expect(['w/8/rotWord', 'w/8/subWord', rconNodeId(1), 'w/8/xorRcon', wordNodeId(8)].map((id) => hexOf(facet, id))).toEqual(['14dff409', 'fa9ebf01', '01000000', 'fb9ebf01', '9ba35411']);
  });

  it.each(vectors.keyExpansion)('$section: every word equals expandKey and the published words', (vector) => {
    const facet = schedule(vector.key);
    const words = primary(facet);
    expect(words.map((node) => node.bytes)).toEqual(expandKey(hexBytes(vector.key)));
    for (const [i, hex] of Object.entries(vector.words)) expect(hexOf(facet, wordNodeId(Number(i)))).toBe(hex);
  });
});

describe('keyScheduleDerivation structure', () => {
  it.each([
    [16, 84],
    [24, 84],
    [32, 94],
  ])('a %i-byte key yields %i topologically ordered nodes', (bytes, count) => {
    const facet = schedule(KEY_256.slice(0, bytes * 2));
    expect(facet.nodes).toHaveLength(count);
    expect(() => assertTopologicalOrder(facet)).not.toThrow();
  });

  it('marks words as primary (group = ⌊i/4⌋, valueRef) and intermediates as ungrouped', () => {
    const facet = schedule(KEY_128);
    expect(primary(facet).map((node) => node.group)).toEqual(Array.from({ length: 44 }, (_, i) => Math.floor(i / 4)));
    expect(derivationNode(facet, wordNodeId(17))?.valueRef).toBe('4/roundKey');
    const intermediates = facet.nodes.filter((node) => node.group === undefined);
    expect(intermediates.every((node) => node.step === undefined && node.valueRef === undefined)).toBe(true);
    expect(new Set(intermediates.map((node) => node.op))).toEqual(new Set(['rotWord', 'subWord', 'rcon', 'xor']));
  });

  it('labels nodes with plugin.aes.derivation.* refs and the word index', () => {
    const facet = schedule(KEY_128);
    expect(derivationNode(facet, wordNodeId(0))?.label).toEqual({ key: 'plugin.aes.derivation.keyWord', params: { i: 0 } });
    expect(derivationNode(facet, wordNodeId(4))?.label).toEqual({ key: 'plugin.aes.derivation.word', params: { i: 4 } });
    expect(derivationNode(facet, rconNodeId(10))?.label).toEqual({ key: 'plugin.aes.derivation.rcon', params: { i: 10 } });
  });

  it('chains w[4] ← ⊕Rcon ← SubWord ← RotWord ← w[3], with w[0] and Rcon[1] as operands', () => {
    const facet = schedule(KEY_128);
    expect(derivationInputs(facet, wordNodeId(4)).map((node) => node.id)).toEqual(['w/4/xorRcon', wordNodeId(0)]);
    expect(derivationAncestors(facet, wordNodeId(4)).map((node) => node.id)).toEqual(['w/4/xorRcon', 'w/0', 'w/4/subWord', 'rcon/1', 'w/4/rotWord', 'w/3']);
  });

  it('sets step to the state step that first uses the round key', () => {
    const facet = schedule(KEY_128, (round) => (round === 0 ? undefined : round * 10));
    expect(derivationNode(facet, wordNodeId(1))?.step).toBeUndefined();
    expect(derivationNode(facet, wordNodeId(5))?.step).toBe(10);
  });
});

describe('run() derivation facet', () => {
  it.each(['op', 'round'] as const)("points every word at its round's addRoundKey step ('%s' detail)", (detail) => {
    const result = run({ ...AES_PRESETS[0]!.params, detail });
    if (!result.ok) throw new Error('expected ok');
    const facet = getFacet<DerivationFacet>(result.trace, 'derivation')!;
    const state = getFacet<StateFacet<string, { op: string; round?: number }>>(result.trace, 'state')!;
    for (const node of primary(facet)) {
      const step = state.steps[node.step ?? -1];
      expect(step?.round).toBe(node.group);
      expect(step?.writes.some((write) => write.region === 'roundKey')).toBe(true);
      if (detail === 'op') expect(step?.op).toBe('addRoundKey');
    }
  });
});
