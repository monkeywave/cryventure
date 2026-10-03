import { describe, expect, it } from 'vitest';
import { toHex } from '@cryventure/core';
import {
  FLY_BEATS,
  FLY_IMPLS,
  FLY_TARGETS,
  captionKey,
  flyData,
  flyThroughFrame,
  matrixCell,
  ramBytes,
  ramOffset,
  stepBeat,
} from './flyThroughModel.ts';
import { WIDE_GEOMETRY as G } from './flyGeometry.ts';

describe('flyData', () => {
  it('uses the FIPS 197 C.1 key as round key 0 and the C.1 ciphertext as the output block', () => {
    expect(toHex(flyData('rd_key').bytes)).toBe('000102030405060708090a0b0c0d0e0f');
    expect(flyData('rd_key').role).toBe('key');
    expect(toHex(flyData('out').bytes)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
    expect(flyData('out').role).toBe('state');
  });
});

describe('matrixCell', () => {
  it('is column-major: s[r, c] = in[r + 4c]', () => {
    expect(matrixCell(0)).toEqual({ row: 0, col: 0 });
    expect(matrixCell(1)).toEqual({ row: 1, col: 0 });
    expect(matrixCell(4)).toEqual({ row: 0, col: 1 });
    expect(matrixCell(15)).toEqual({ row: 3, col: 3 });
  });
});

describe('ramOffset / ramBytes', () => {
  it('reverses each 4-byte word of rd_key in the C reference (GETU32 on little-endian)', () => {
    expect(ramOffset(0, 'c-ref', 'rd_key')).toBe(3);
    expect(ramOffset(3, 'c-ref', 'rd_key')).toBe(0);
    expect(ramOffset(4, 'c-ref', 'rd_key')).toBe(7);
    expect(toHex(ramBytes('c-ref', 'rd_key'), { group: 4 })).toBe('03020100 07060504 0b0a0908 0f0e0d0c');
  });

  it('keeps the raw byte order for AES-NI and for out[16]', () => {
    expect(toHex(ramBytes('aesni', 'rd_key'))).toBe('000102030405060708090a0b0c0d0e0f');
    for (const impl of FLY_IMPLS) expect(toHex(ramBytes(impl, 'out'))).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });

  it('is a permutation of the 16 offsets', () => {
    for (const impl of FLY_IMPLS)
      for (const target of FLY_TARGETS) {
        const offsets = new Set(Array.from({ length: 16 }, (_, i) => ramOffset(i, impl, target)));
        expect(offsets.size).toBe(16);
      }
  });
});

describe('stepBeat', () => {
  it('clamps to the three beats', () => {
    expect(stepBeat(0, -1)).toBe(0);
    expect(stepBeat(0, 1)).toBe(1);
    expect(stepBeat(2, 1)).toBe(2);
    expect(FLY_BEATS).toEqual(['matrix', 'register', 'memory']);
  });
});

describe('captionKey', () => {
  it('depends on the data in the matrix, on the implementation in the register, and on both in RAM', () => {
    expect(captionKey('matrix', 'c-ref', 'rd_key')).toBe(captionKey('matrix', 'aesni', 'rd_key'));
    expect(captionKey('matrix', 'c-ref', 'out')).toBe('ui.flyThrough.caption.matrix.out');
    expect(captionKey('register', 'c-ref', 'out')).toBe(captionKey('register', 'c-ref', 'rd_key'));
    expect(captionKey('register', 'aesni', 'out')).toBe('ui.flyThrough.caption.register.aesni');
    expect(captionKey('memory', 'aesni', 'out')).toBe(captionKey('memory', 'c-ref', 'out'));
    expect(captionKey('memory', 'c-ref', 'rd_key')).toBe('ui.flyThrough.caption.memory.rd_key.c-ref');
    expect(captionKey('memory', 'aesni', 'rd_key')).toBe('ui.flyThrough.caption.memory.rd_key.aesni');
    expect(captionKey('memory', 'c-ref', 'out')).toBe('ui.flyThrough.caption.memory.out');
  });
});

describe('flyThroughFrame', () => {
  it('is deterministic', () => {
    expect(flyThroughFrame(G, 2, 'c-ref', 'rd_key')).toEqual(flyThroughFrame(G, 2, 'c-ref', 'rd_key'));
  });

  it('places the bytes in the matrix, then lane i of xmm0, then RAM', () => {
    const matrix = flyThroughFrame(G, 0, 'aesni', 'rd_key');
    expect(matrix.beat).toBe('matrix');
    expect(matrix.tokens[5]).toMatchObject({ index: 5, value: 5, ...G.matrixCell(5) });

    const register = flyThroughFrame(G, 1, 'c-ref', 'rd_key');
    expect(register.tokens.map(({ x, y }) => ({ x, y }))).toEqual(Array.from({ length: 16 }, (_, i) => G.rowSlot('register', i)));

    const memory = flyThroughFrame(G, 2, 'c-ref', 'rd_key');
    expect(memory.tokens[0]).toMatchObject(G.rowSlot('ram', 3));
    expect(memory.captionKey).toBe('ui.flyThrough.caption.memory.rd_key.c-ref');
  });

  it('carries the ciphertext into out[16] at every beat', () => {
    for (const beat of [0, 1, 2]) expect(flyThroughFrame(G, beat, 'aesni', 'out').tokens[0]).toMatchObject({ index: 0, value: 0x69 });
  });

  it('clamps an out-of-range beat', () => {
    expect(flyThroughFrame(G, 9, 'aesni', 'out').beat).toBe('memory');
  });
});
