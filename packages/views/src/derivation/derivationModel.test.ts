import { isResultNode, type DerivationFacet, type DerivationNode } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  chainLineCount,
  currentGroup,
  derivationChain,
  groupLabel,
  hostRows,
  OP_CATALOG,
  operandGlyph,
  opLabelKey,
  resultGroups,
  rowStatus,
  sourceWordIds,
  wordHex,
} from './derivationModel.ts';
import { aesDerivation } from './testFixture.ts';

const ids = (nodes: { node: DerivationNode }[]) => nodes.map((link) => link.node.id);

describe('resultGroups', () => {
  const rows = resultGroups(aesDerivation);

  it('groups the 44 AES-128 words into 11 round keys of 4 words', () => {
    expect(rows.map((row) => row.group)).toEqual(Array.from({ length: 11 }, (_, round) => round));
    expect(rows.every((row) => row.words.length === 4)).toBe(true);
    expect(rows[1]?.words.map((word) => wordHex(word.bytes))).toEqual([
      'a0fafe17',
      '88542cb1',
      '23a33939',
      '2a6c7605',
    ]);
  });

  it("uses the words' earliest step as the row step and skips intermediates", () => {
    expect(rows[0]?.step).toBe(2);
    expect(rows.flatMap((row) => row.words).every(isResultNode)).toBe(true);
    const node = (id: string, step?: number): DerivationNode => ({
      id,
      label: { key: 'k' },
      bytes: [],
      op: 'input',
      inputs: [],
      group: 0,
      ...(step === undefined ? {} : { step }),
    });
    expect(
      resultGroups({
        kind: 'derivation',
        schemaVersion: 1,
        nodes: [node('a', 7), node('b', 3), node('c')],
      })[0]?.step,
    ).toBe(3);
    expect(
      resultGroups({ kind: 'derivation', schemaVersion: 1, nodes: [node('a')] })[0]?.step,
    ).toBeUndefined();
  });
});

describe('currentGroup / rowStatus', () => {
  const rows = resultGroups(aesDerivation);

  it('picks the round key most recently used at the playhead', () => {
    expect(currentGroup(rows, -1)).toBeUndefined();
    expect(currentGroup(rows, 1)).toBeUndefined();
    expect(currentGroup(rows, 2)?.group).toBe(0);
    expect(currentGroup(rows, 5)?.group).toBe(0);
    expect(currentGroup(rows, rows[3]!.step!)?.group).toBe(3);
    expect(currentGroup(rows, 10_000)?.group).toBe(10);
  });

  it('classifies rows as current, used or upcoming', () => {
    const step = rows[3]!.step! + 1;
    const current = currentGroup(rows, step);
    expect(rows.slice(0, 5).map((row) => rowStatus(row, step, current))).toEqual([
      'used',
      'used',
      'used',
      'current',
      'upcoming',
    ]);
  });
});

describe('derivationChain', () => {
  it('walks w[4] back through ⊕Rcon, SubWord and RotWord to w[3], with Rcon[1] and w[0] as operands', () => {
    const chain = derivationChain(aesDerivation, 'w/4');
    expect(ids(chain)).toEqual(['w/3', 'w/4/rotWord', 'w/4/subWord', 'w/4/xorRcon', 'w/4']);
    expect(chain.map((link) => link.operands.map((operand) => operand.id))).toEqual([
      [],
      [],
      [],
      ['rcon/1'],
      ['w/0'],
    ]);
    expect(chain.map((link) => wordHex(link.node.bytes))).toEqual([
      '09cf4f3c',
      'cf4f3c09',
      '8a84eb01',
      '8b84eb01',
      'a0fafe17',
    ]);
  });

  it('gives w[i−1] ⊕ w[i−4] for an ordinary word and a single link for a key word', () => {
    expect(
      derivationChain(aesDerivation, 'w/5').map((link) => [
        link.node.id,
        link.operands.map((operand) => operand.id),
      ]),
    ).toEqual([
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

describe('sourceWordIds', () => {
  const node = (id: string, inputs: string[], group?: number): DerivationNode => ({
    id,
    label: { key: 'k' },
    bytes: [],
    op: 'x',
    inputs,
    ...(group === undefined ? {} : { group }),
  });

  it('marks w[i−1] and w[i−Nk] for an i mod Nk = 0 word, skipping RotWord, SubWord and Rcon', () => {
    expect(sourceWordIds(aesDerivation, 'w/4')).toEqual(['w/3', 'w/0']);
    expect(sourceWordIds(aesDerivation, 'w/40')).toEqual(['w/39', 'w/36']);
  });

  it('marks w[i−1] and w[i−Nk] for an ordinary word and nothing for a key word or unknown id', () => {
    expect(sourceWordIds(aesDerivation, 'w/5')).toEqual(['w/4', 'w/1']);
    expect(sourceWordIds(aesDerivation, 'w/0')).toEqual([]);
    expect(sourceWordIds(aesDerivation, 'nope')).toEqual([]);
  });

  it('handles the AES-256 i mod Nk = 4 case: w[12] = SubWord(w[11]) ⊕ w[4]', () => {
    const facet: DerivationFacet = {
      kind: 'derivation',
      schemaVersion: 1,
      nodes: [
        node('w/4', [], 0),
        node('w/11', [], 1),
        node('w/12/subWord', ['w/11']),
        node('w/12', ['w/12/subWord', 'w/4'], 1),
      ],
    };
    expect(sourceWordIds(facet, 'w/12')).toEqual(['w/11', 'w/4']);
  });
});

describe('hostRows', () => {
  const hosts = hostRows(resultGroups(aesDerivation));

  it('maps each listed word to the row that lists it', () => {
    expect(hosts.get('w/4')?.group).toBe(1);
    expect(hosts.get('w/7')?.group).toBe(1);
    expect(hosts.get('w/40')?.group).toBe(10);
    expect(hosts.get('w/4/subWord')).toBeUndefined();
  });
});

describe('groupLabel', () => {
  it("returns the producer's label of a group, else undefined", () => {
    expect(groupLabel(aesDerivation, 3)).toEqual({ key: 'plugin.aes.derivation.roundKey', params: { n: 3 } });
    expect(groupLabel(aesDerivation, 99)).toBeUndefined();
    expect(groupLabel(aesDerivation, undefined)).toBeUndefined();
    expect(groupLabel({ ...aesDerivation, groups: undefined }, 3)).toBeUndefined();
  });
});

describe('resultGroups without groups', () => {
  it('lists `result: true` nodes without a group in one row after the grouped ones', () => {
    const node = (id: string, extra: Partial<DerivationNode>): DerivationNode => ({ id, label: { key: 'k' }, bytes: [], op: 'input', inputs: [], ...extra });
    const facet: DerivationFacet = { kind: 'derivation', schemaVersion: 1, nodes: [node('a', { result: true }), node('b', { group: 2 }), node('c', {}), node('d', { group: 1, result: false })] };
    expect(resultGroups(facet).map((row) => [row.group, row.words.map((word) => word.id)])).toEqual([
      [2, ['b']],
      [undefined, ['a']],
    ]);
  });
});

describe('op catalog', () => {
  it('names the AES and MAC/KDF ops from view keys and leaves other ops to their raw name', () => {
    for (const op of ['hmac', 'concat', 'xor', 'counter', 'truncate', 'hkdfLabel', 'split', 'input', 'rotWord', 'subWord', 'rcon']) {
      expect(OP_CATALOG).toContain(op);
      expect(opLabelKey(op)).toBe(`view.derivation.op.${op}`);
    }
    expect(opLabelKey('frobnicate')).toBeUndefined();
    expect(opLabelKey('toString')).toBeUndefined();
  });

  it('marks operands by how the op combines them', () => {
    expect(operandGlyph('xor')).toBe('⊕');
    expect(operandGlyph('concat')).toBe('‖');
    expect(operandGlyph('hmac')).toBe('+');
  });

  it('counts the lines of a chain (operands plus links)', () => {
    expect(chainLineCount(derivationChain(aesDerivation, 'w/4'))).toBe(7);
    expect(chainLineCount([])).toBe(0);
  });
});
