import { describe, expect, it } from 'vitest';
import { lengthFieldBytes, sha2Pad, sha2PadTail, sha2Padding, type Sha2BlockBytes } from './padding.ts';

/** A message of `length` bytes 0x01, 0x02, … (never 0x00 or 0x80, so the padding stands out). */
const message = (length: number) => Uint8Array.from({ length }, (_, index) => (index % 0x7f) + 1);

/** [message bytes, padded bytes] at the block-boundary edges of FIPS 180-4 §5.1.1 / §5.1.2. */
const EDGES: Record<Sha2BlockBytes, readonly (readonly [number, number])[]> = {
  64: [[0, 64], [55, 64], [56, 128], [63, 128], [64, 128], [111, 128], [112, 128], [119, 128], [120, 192], [127, 192], [128, 192]],
  128: [[0, 128], [55, 128], [56, 128], [63, 128], [64, 128], [111, 128], [112, 256], [119, 256], [120, 256], [127, 256], [128, 256]],
};

describe('lengthFieldBytes', () => {
  it('is 8 bytes for 64-byte blocks (§5.1.1) and 16 bytes for 128-byte blocks (§5.1.2)', () => {
    expect([lengthFieldBytes(64), lengthFieldBytes(128)]).toEqual([8, 16]);
  });
});

describe.each([64, 128] as const)('sha2Padding into %i-byte blocks', (blockBytes) => {
  const lengthBytes = blockBytes / 8;

  it.each(EDGES[blockBytes])('a %i-byte message pads to %i bytes', (length, total) => {
    const input = message(length);
    const { padded, zeroBytes, messageBits } = sha2Padding(input, blockBytes);
    expect(padded.length).toBe(total);
    expect(padded.length % blockBytes).toBe(0);
    expect(zeroBytes).toBe(total - length - 1 - lengthBytes);
    expect(zeroBytes).toBeGreaterThanOrEqual(0);
    expect(zeroBytes).toBeLessThan(blockBytes);
    expect(messageBits).toBe(length * 8);
    expect(Array.from(padded.subarray(0, length))).toEqual(Array.from(input));
    expect(padded[length]).toBe(0x80);
    expect(padded.subarray(length + 1, total - lengthBytes).every((byte) => byte === 0)).toBe(true);
  });

  it.each(EDGES[blockBytes])('a %i-byte message ends in its bit length, big-endian, in a %i-byte padded message', (length, total) => {
    const { padded } = sha2Padding(message(length), blockBytes);
    const field = Array.from(padded.subarray(total - lengthBytes));
    const bits = length * 8;
    const expected = Array.from({ length: lengthBytes }, (_, index) => (index === lengthBytes - 1 ? bits & 0xff : index === lengthBytes - 2 ? bits >> 8 : 0));
    expect(field).toEqual(expected);
  });

  it('reports the length field size and leaves the input untouched', () => {
    const input = message(3);
    expect(sha2Padding(input, blockBytes).lengthBytes).toBe(lengthBytes);
    expect(Array.from(input)).toEqual([1, 2, 3]);
  });

  it('accepts plain arrays as well as Uint8Array', () => {
    expect(sha2Padding([1, 2, 3], blockBytes).padded).toEqual(sha2Padding(message(3), blockBytes).padded);
  });
});

describe('sha2Pad', () => {
  it('is the padded message of sha2Padding', () => {
    expect(sha2Pad([0x61, 0x62, 0x63], 64)).toEqual(sha2Padding([0x61, 0x62, 0x63], 64).padded);
    expect(sha2Pad([], 128)).toEqual(sha2Padding([], 128).padded);
  });
});

describe.each([64, 128] as const)('sha2PadTail into %i-byte blocks', (blockBytes) => {
  it.each([0, 1, 55, 56, blockBytes - 1])('ends a longer message exactly as sha2Pad does (%i-byte tail)', (tailLength) => {
    for (const blocks of [0, 1, 3]) {
      const whole = message(blocks * blockBytes + tailLength);
      const tail = whole.subarray(blocks * blockBytes);
      expect(sha2PadTail(tail, whole.length, blockBytes)).toEqual(sha2Pad(whole, blockBytes).subarray(blocks * blockBytes));
    }
  });

  it('rejects a tail of a whole block or longer than the message', () => {
    expect(() => sha2PadTail(message(blockBytes), blockBytes, blockBytes)).toThrow(RangeError);
    expect(() => sha2PadTail(message(3), 2, blockBytes)).toThrow(RangeError);
  });
});
