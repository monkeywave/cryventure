import type { RegistersFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { aesDerivedFacets } from './aesFixture.ts';
import {
  displayOrder,
  inFlightAt,
  laneValues,
  registerFileBytes,
  sharedLanes,
  writtenAt,
} from './registerModel.ts';

const x86 = aesDerivedFacets['registers@x86_64-aesni'] as RegistersFacet;
const PLAINTEXT = [
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
];

describe('registerFileBytes / sharedLanes', () => {
  it('sizes the grid by the widest register and offers the lanes every register has', () => {
    expect(registerFileBytes(x86.file)).toBe(16);
    expect(sharedLanes(x86.file)).toEqual([8, 16, 32, 64]);
  });

  it('keeps only lanes all registers offer, sorted, and falls back to bytes', () => {
    const file = {
      isa: 'x',
      byteOrder: 'little' as const,
      registers: [
        { name: 'a', bits: 128, lanes: [64, 8, 32] },
        { name: 'b', bits: 128, lanes: [8, 64] },
      ],
    };
    expect(sharedLanes(file)).toEqual([8, 64]);
    expect(sharedLanes({ ...file, registers: [] })).toEqual([8]);
  });
});

describe('displayOrder', () => {
  it('lists memory order as is and reverses it for register notation on a little-endian file', () => {
    expect(displayOrder(4, 'little', 'memory')).toEqual([0, 1, 2, 3]);
    expect(displayOrder(4, 'little', 'msbFirst')).toEqual([3, 2, 1, 0]);
  });

  it('keeps memory order for register notation on a big-endian file (MSB already first)', () => {
    expect(displayOrder(4, 'big', 'msbFirst')).toEqual([0, 1, 2, 3]);
  });
});

describe('laneValues', () => {
  it('reads each little-endian lane as a number, lane 0 first in memory order', () => {
    expect(laneValues(PLAINTEXT, 32, 'little', 'memory')).toEqual([
      { index: 0, hex: '33221100' },
      { index: 1, hex: '77665544' },
      { index: 2, hex: 'bbaa9988' },
      { index: 3, hex: 'ffeeddcc' },
    ]);
  });

  it('puts the most significant lane first in register notation', () => {
    expect(laneValues(PLAINTEXT, 64, 'little', 'msbFirst')).toEqual([
      { index: 1, hex: 'ffeeddccbbaa9988' },
      { index: 0, hex: '7766554433221100' },
    ]);
  });

  it('reads big-endian lanes in memory order', () => {
    expect(laneValues(PLAINTEXT, 16, 'big', 'msbFirst').slice(0, 2)).toEqual([
      { index: 0, hex: '0011' },
      { index: 1, hex: '2233' },
    ]);
  });
});

describe('writtenAt / inFlightAt (effects visible iff p ≥ align.last)', () => {
  it('flags the registers whose writes land at the step', () => {
    expect(writtenAt(x86, 0)).toEqual(new Set(['xmm1']));
    expect(writtenAt(x86, 1)).toEqual(new Set());
    expect(writtenAt(x86, 6)).toEqual(new Set(['xmm0']));
  });

  it('marks the destination of an instruction in flight (aesenc spans steps 3–6) until it lands', () => {
    expect(inFlightAt(x86, 3)).toEqual(new Set(['xmm0']));
    expect(inFlightAt(x86, 5)).toEqual(new Set(['xmm0']));
    expect(inFlightAt(x86, 6)).toEqual(new Set());
  });
});
