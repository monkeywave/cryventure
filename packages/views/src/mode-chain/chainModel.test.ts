import { chainActiveAt } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { abbreviatedHex, groupLetter, groupsChangeStep, hexLines, labelSegments, nodeRole, plainLabel, sameGroups, sourceIds, spacedHex } from './chainModel.ts';
import { chainCase } from './testFixture.ts';

const block = Array.from({ length: 16 }, (_, i) => i);

describe('hex text', () => {
  it('splits a block into lines of 8 bytes', () => {
    expect(hexLines(block)).toEqual(['0001020304050607', '08090a0b0c0d0e0f']);
    expect(hexLines([])).toEqual(['']);
  });

  it('abbreviates long values to their first and last two bytes', () => {
    expect(abbreviatedHex(block)).toBe('0001…0e0f');
    expect(abbreviatedHex([1, 2, 3, 4, 5])).toBe('0102030405');
  });

  it('groups full hex in 4-byte words', () => {
    expect(spacedHex(block)).toBe('00010203 04050607 08090a0b 0c0d0e0f');
  });
});

describe('nodeRole', () => {
  it('maps inputs and outputs by direction, the rest by kind', () => {
    const { facet } = chainCase('ecb/repeated-blocks-decrypt');
    const input = facet.nodes.find((node) => node.id === 'b0.input')!;
    const cipher = facet.nodes.find((node) => node.id === 'b0.cipher')!;
    expect(nodeRole(input, 'decrypt')).toBe('ciphertext');
    expect(nodeRole(input, 'encrypt')).toBe('plaintext');
    expect(nodeRole(cipher, 'decrypt')).toBe('key');
  });
});

describe('sameGroups', () => {
  it('groups equal ECB blocks among the nodes that already have their value', () => {
    const { facet, stepCount } = chainCase('ecb/repeated-blocks');
    const atStart = sameGroups(facet, chainActiveAt(facet, -1).nodes);
    expect([...atStart.keys()]).toEqual(['b0.input', 'b1.input']);
    const atEnd = sameGroups(facet, chainActiveAt(facet, stepCount - 1).nodes);
    expect(atEnd.get('b0.output')).toEqual({ index: 1, ids: ['b0.output', 'b1.output'] });
    expect(atEnd.has('b2.output')).toBe(false);
  });

  it('finds no equal CBC ciphertext blocks', () => {
    const { facet, stepCount } = chainCase('cbc/repeated-blocks');
    const groups = sameGroups(facet, chainActiveAt(facet, stepCount - 1).nodes);
    expect([...groups.keys()]).toEqual(['b0.input', 'b1.input']);
  });

  it('keys the groups by the last step that gave an input or output block its value', () => {
    const { facet } = chainCase('ecb/repeated-blocks');
    // Outputs arrive at steps 2, 4 and 6; the cipher steps in between change no group.
    expect([-1, 0, 1, 2, 3, 4, 5, 6].map((step) => groupsChangeStep(facet, step))).toEqual([-1, 0, 0, 2, 2, 4, 4, 6]);
  });

  it('letters groups A, B, …', () => {
    expect([0, 1, 25].map(groupLetter)).toEqual(['A', 'B', 'Z']);
  });
});

describe('sourceIds', () => {
  it('lists the nodes feeding a node, in edge order', () => {
    const { facet } = chainCase('cbc/repeated-blocks');
    expect(sourceIds(facet, 'b1.xor')).toEqual(['b1.input', 'b0.output']);
    expect(sourceIds(facet, 'b0.cipher')).toEqual(['b0.xor']);
    expect(sourceIds(facet, 'iv')).toEqual([]);
  });
});

describe('labelSegments', () => {
  it('subscripts underscores everywhere and block numbers on request', () => {
    expect(labelSegments('E_K', false)).toEqual([
      { text: 'E', sub: false },
      { text: 'K', sub: true },
    ]);
    expect(labelSegments('C12', false)).toEqual([{ text: 'C12', sub: false }]);
    expect(labelSegments('C12', true)).toEqual([
      { text: 'C', sub: false },
      { text: '12', sub: true },
    ]);
    expect(labelSegments('T_{i+1} = T_i', false).filter((segment) => segment.sub).map((segment) => segment.text)).toEqual(['i+1', 'i']);
    expect(labelSegments('Keystream 2', true)).toEqual([{ text: 'Keystream 2', sub: false }]);
  });

  it('reads subscripts as separate words in plain text', () => {
    expect(plainLabel('E_K')).toBe('E K');
    expect(plainLabel('P1')).toBe('P1');
  });
});
