import { describe, expect, it } from 'vitest';
import { laneBytes, laneFromBytes, laneHex, lanesFromBytes, lanesHex, not64, rotl64, stateBytes, zeroState } from './lanes.ts';

describe('lanes', () => {
  it('zeroState has 25 zero lanes', () => {
    expect(zeroState()).toEqual(new Array(25).fill(0n));
  });

  it('rotl64 rotates left within 64 bits', () => {
    expect(rotl64(0x8000000000000001n, 1)).toBe(0x3n);
    expect(rotl64(0x1n, 63)).toBe(0x8000000000000000n);
    expect(rotl64(0x1234n, 0)).toBe(0x1234n);
    expect(rotl64(0x1234n, 64)).toBe(0x1234n);
  });

  it('not64 inverts all 64 bits', () => {
    expect(not64(0n)).toBe(0xffffffffffffffffn);
    expect(not64(0xffffffff00000000n)).toBe(0xffffffffn);
  });

  it('reads and writes lanes little-endian (FIPS 202 B.1)', () => {
    const bytes = [0x06, 0, 0, 0, 0, 0, 0, 0x80, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    expect(laneFromBytes(bytes, 0)).toBe(0x8000000000000006n);
    expect(laneFromBytes(bytes, 8)).toBe(0x0807060504030201n);
    expect(lanesFromBytes(bytes)).toEqual([0x8000000000000006n, 0x0807060504030201n]);
    expect(laneBytes(0x0807060504030201n)).toEqual(bytes.slice(8));
    expect(stateBytes([0x8000000000000006n, 0x0807060504030201n])).toEqual(bytes);
  });

  it('lanesFromBytes rejects a partial lane', () => {
    expect(() => lanesFromBytes([1, 2, 3])).toThrow(RangeError);
  });

  it('writes lanes as 16 lowercase hex digits, most significant first', () => {
    expect(laneHex(0x6n)).toBe('0000000000000006');
    expect(lanesHex([0xabn, 0x8000000000000000n])).toEqual(['00000000000000ab', '8000000000000000']);
  });
});
