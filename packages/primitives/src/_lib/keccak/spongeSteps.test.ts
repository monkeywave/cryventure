import { describe, expect, it } from 'vitest';
import { DOMAIN_SUFFIXES, spongePad } from './padding.ts';
import { padShapeParams, padTailNotation } from './spongeSteps.ts';

describe('padTailNotation', () => {
  it('writes one, two or more padding bytes in short form', () => {
    expect(padTailNotation(spongePad(new Uint8Array(135), 136, DOMAIN_SUFFIXES.sha3))).toBe('86');
    expect(padTailNotation(spongePad(new Uint8Array(134), 136, DOMAIN_SUFFIXES.shake))).toBe('1f 80');
    expect(padTailNotation(spongePad(new Uint8Array(3), 136, DOMAIN_SUFFIXES.keccak))).toBe('01 00 … 00 80');
  });
});

describe('padShapeParams', () => {
  it('names the tail, the padded length, the block count and the rate', () => {
    expect(padShapeParams(spongePad(new Uint8Array(3), 136, DOMAIN_SUFFIXES.sha3), 136)).toEqual({ tail: '06 00 … 00 80', paddedBytes: 136, blocks: 1, rateBytes: 136 });
    expect(padShapeParams(spongePad(new Uint8Array(168), 168, DOMAIN_SUFFIXES.cshake), 168)).toMatchObject({ tail: '04 00 … 00 80', paddedBytes: 336, blocks: 2 });
  });
});
