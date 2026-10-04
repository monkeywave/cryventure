import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { laneHex, zeroState } from './lanes.ts';
import { DOMAIN_SUFFIXES } from './padding.ts';
import { absorbBlock, blockLanes, rateLanes, sponge, squeezeBlock, squeezeFrom } from './sponge.ts';
import { keccakF1600 } from './stepMappings.ts';

describe('sponge parts (FIPS 202 Algorithm 8)', () => {
  it('rateLanes is r / 64', () => {
    expect([rateLanes(136), rateLanes(168), rateLanes(72)]).toEqual([17, 21, 9]);
    expect(() => rateLanes(10)).toThrow(RangeError);
  });

  it('blockLanes and absorbBlock XOR the block into the rate lanes only', () => {
    const block = new Uint8Array(136);
    block[0] = 0x06;
    block[135] = 0x80;
    expect(blockLanes(block).map(laneHex)[16]).toBe('8000000000000000');
    const state = zeroState().map((_, index) => BigInt(index));
    const absorbed = absorbBlock(state, block);
    expect(absorbed[0]).toBe(0x06n);
    expect(absorbed[16]).toBe(16n ^ 0x8000000000000000n);
    expect(absorbed.slice(17)).toEqual(state.slice(17));
  });

  it('squeezeBlock reads the first r bytes in byte order', () => {
    const state = zeroState();
    state[0] = 0x0807060504030201n;
    expect(toHex(squeezeBlock(state, 136).subarray(0, 9))).toBe('010203040506070800');
    expect(squeezeBlock(state, 136).length).toBe(136);
  });
});

describe('sponge', () => {
  it('SHA3-256("") is the NIST Msg0 digest', () => {
    expect(toHex(sponge(new Uint8Array(0), 136, DOMAIN_SUFFIXES.sha3, 32))).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
  });

  it('SHAKE128("") starts with the NIST value 7f9c2ba4e88f827d616045507605853e', () => {
    expect(toHex(sponge(new Uint8Array(0), 168, DOMAIN_SUFFIXES.shake, 16))).toBe('7f9c2ba4e88f827d616045507605853e');
  });

  it('squeezeFrom permutes before every further rate block', () => {
    const absorbed = keccakF1600(zeroState());
    const out = squeezeFrom(absorbed, 8, 20);
    expect(toHex(out.subarray(0, 8))).toBe(toHex(squeezeBlock(absorbed, 8)));
    expect(toHex(out.subarray(8, 16))).toBe(toHex(squeezeBlock(keccakF1600(absorbed), 8)));
    expect(toHex(out.subarray(16))).toBe(toHex(squeezeBlock(keccakF1600(keccakF1600(absorbed)), 8).subarray(0, 4)));
    expect(squeezeFrom(absorbed, 136, 0).length).toBe(0);
  });
});
