import type { DerivationFacet, DerivationNode } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { currentGroup, derivationChain, isPrimary, roundKeyRows, rowStatus, wordHex } from './keyScheduleModel.ts';
import { aesDerivation } from './testFixture.ts';

const ids = (nodes: { node: DerivationNode }[]) => nodes.map((link) => link.node.id);

describe('roundKeyRows', () => {
  const rows = roundKeyRows(aesDerivation);

  it('groups the 44 AES-128 words into 11 round keys of 4 words', () => {
    expect(rows.map((row) => row.group)).toEqual(Array.from({ length: 11 }, (_, round) => round));
    expect(rows.every((row) => row.words.length === 4)).toBe(true);
    expect(rows[1]?.words.map((word) => wordHex(word.bytes))).toEqual(['a0fafe17', '88542cb1', '23a33939', '2a6c7605']);
  });

  it("uses the words' earliest step as the row step and skips intermediates", () => {
    expect(rows[0]?.step).toBe(2);
    expect(rows.flatMap((row) => row.words).every(isPrimary)).toBe(true);
    const node = (id: string, step?: number): DerivationNode => ({ id, label: { key: 'k' }, bytes: [], op: 'input', inputs: [], group: 0, ...(step === undefined ? {} : { step }) });
    expect(roundKeyRows({ kind: 'derivation', schemaVersion: 1, nodes: [node('a', 7), node('b', 3), node('c')] })[0]?.step).toBe(3);
    expect(roundKeyRows({ kind: 'derivation', schemaVersion: 1, nodes: [node('a')] })[0]?.step).toBeUndefined();
  });
});

describe('currentGroup / rowStatus', () => {
  const rows = roundKeyRows(aesDerivation);

  it('picks the round key most recently used at the playhead', () => {
    expect(currentGroup(rows, -1)).toBeUndefined();
    expect(currentGroup(rows, 1)).toBeUndefined();
    expect(currentGroup(rows, 2)).toBe(0);
    expect(currentGroup(rows, 5)).toBe(0);
    expect(currentGroup(rows, rows[3]!.step!)).toBe(3);
    expect(currentGroup(rows, 10_000)).toBe(10);
  });

  it('classifies rows as current, used or upcoming', () => {
    const step = rows[3]!.step! + 1;
    const current = currentGroup(rows, step);
    expect(rows.slice(0, 5).map((row) => rowStatus(row, step, current))).toEqual(['used', 'used', 'used', 'current', 'upcoming']);
  });
});

describe('derivationChain', () => {
  it('walks w[4] back through ⊕Rcon, SubWord and RotWord to w[3], with Rcon[1] and w[0] as operands', () => {
    const chain = derivationChain(aesDerivation, 'w/4');
    expect(ids(chain)).toEqual(['w/3', 'w/4/rotWord', 'w/4/subWord', 'w/4/xorRcon', 'w/4']);
    expect(chain.map((link) => link.operands.map((operand) => operand.id))).toEqual([[], [], [], ['rcon/1'], ['w/0']]);
    expect(chain.map((link) => wordHex(link.node.bytes))).toEqual(['09cf4f3c', 'cf4f3c09', '8a84eb01', '8b84eb01', 'a0fafe17']);
  });

  it('gives w[i−1] ⊕ w[i−4] for an ordinary word and a single link for a key word', () => {
    expect(derivationChain(aesDerivation, 'w/5').map((link) => [link.node.id, link.operands.map((operand) => operand.id)])).toEqual([
      ['w/4', []],
      ['w/5', ['w/1']],
    ]);
    expect(ids(derivationChain(aesDerivation, 'w/0'))).toEqual(['w/0']);
  });

  it('returns [] for unknown ids and terminates on cycles', () => {
    expect(derivationChain(aesDerivation, 'nope')).toEqual([]);
    const loop: DerivationFacet = {
      kind: 'derivation',
      schemaVersion: 1,
      nodes: [
        { id: 'a', label: { key: 'k' }, bytes: [], op: 'x', inputs: ['b'] },
        { id: 'b', label: { key: 'k' }, bytes: [], op: 'x', inputs: ['a'] },
      ],
    };
    expect(ids(derivationChain(loop, 'a'))).toEqual(['b', 'a']);
  });
});
