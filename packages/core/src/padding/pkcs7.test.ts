import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pkcs7Check, pkcs7Pad, pkcs7Unpad } from './pkcs7.ts';

const BLOCK = 16;

/** A 16-byte block: 16 - tail.length filler bytes (0xaa) followed by `tail`. */
function blockEndingWith(...tail: number[]): Uint8Array {
  return Uint8Array.from([...new Array<number>(BLOCK - tail.length).fill(0xaa), ...tail]);
}

describe('pkcs7Pad', () => {
  it('adds a full block of 0x10 to block-aligned input', () => {
    expect([...pkcs7Pad(new Uint8Array(16), BLOCK).slice(16)]).toEqual(new Array(16).fill(0x10));
  });
  it('adds a full block to empty input', () => {
    expect([...pkcs7Pad(new Uint8Array(0), BLOCK)]).toEqual(new Array(16).fill(0x10));
  });
  it('pads 13 bytes with 03 03 03', () => {
    const padded = pkcs7Pad(new Uint8Array(13).fill(1), BLOCK);
    expect(padded.length).toBe(16);
    expect([...padded.slice(13)]).toEqual([3, 3, 3]);
  });
  it('does not mutate its input', () => {
    const data = Uint8Array.from([1, 2, 3]);
    pkcs7Pad(data, BLOCK);
    expect([...data]).toEqual([1, 2, 3]);
  });
  it.each([0, 256, -1, 1.5])('throws RangeError for block size %s', (size) => {
    expect(() => pkcs7Pad(new Uint8Array(3), size)).toThrow(RangeError);
  });
  it('accepts block sizes 1 and 255', () => {
    expect([...pkcs7Pad(Uint8Array.of(7), 1)]).toEqual([7, 1]);
    expect(pkcs7Pad(new Uint8Array(0), 255).length).toBe(255);
  });
});

describe('pkcs7Unpad', () => {
  it('accepts ...01', () => {
    const result = pkcs7Unpad(blockEndingWith(0x01), BLOCK);
    expect(result).toEqual({ ok: true, data: blockEndingWith(0x01).slice(0, 15), padLength: 1 });
  });
  it('accepts ...02 02', () => {
    const result = pkcs7Unpad(blockEndingWith(0x02, 0x02), BLOCK);
    expect(result.ok && result.data.length).toBe(14);
  });
  it('accepts a full block of 0x10', () => {
    const result = pkcs7Unpad(new Uint8Array(16).fill(0x10), BLOCK);
    expect(result).toEqual({ ok: true, data: new Uint8Array(0), padLength: 16 });
  });
  it('rejects empty input', () => {
    expect(pkcs7Unpad(new Uint8Array(0), BLOCK)).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects input that is not block aligned', () => {
    expect(pkcs7Unpad(new Uint8Array(15).fill(1), BLOCK)).toEqual({ ok: false, reason: 'not-block-aligned' });
  });
  it('rejects a final 00 byte', () => {
    expect(pkcs7Unpad(blockEndingWith(0x00), BLOCK)).toEqual({ ok: false, reason: 'zero-pad-byte', padLength: 0 });
  });
  it('rejects 0x11 in a 16-byte block', () => {
    expect(pkcs7Unpad(blockEndingWith(0x11), BLOCK)).toEqual({ ok: false, reason: 'pad-too-long', padLength: 0x11 });
  });
  it('rejects ...01 02 (inconsistent: pad byte 02, preceding byte 01) and reports the offending index', () => {
    expect(pkcs7Unpad(blockEndingWith(0x01, 0x02), BLOCK)).toEqual({
      ok: false,
      reason: 'inconsistent-pad-bytes',
      padLength: 2,
      index: 14,
    });
  });
  it('accepts ...02 01 as valid 01 padding', () => {
    expect(pkcs7Unpad(blockEndingWith(0x02, 0x01), BLOCK).ok).toBe(true);
  });
  it('reports the offending byte nearest the end', () => {
    const block = blockEndingWith(0x04, 0x04, 0x04, 0x04);
    block[12] = 0x09;
    block[14] = 0x09;
    expect(pkcs7Unpad(block, BLOCK)).toMatchObject({ reason: 'inconsistent-pad-bytes', padLength: 4, index: 14 });
  });
  it('only inspects the last block', () => {
    const data = Uint8Array.from([...blockEndingWith(0x00), ...blockEndingWith(0x01)]);
    expect(pkcs7Unpad(data, BLOCK)).toMatchObject({ ok: true, padLength: 1 });
  });
  it('throws RangeError for an invalid block size', () => {
    expect(() => pkcs7Unpad(new Uint8Array(16), 0)).toThrow(RangeError);
  });
  it('round-trips pkcs7Pad for any data and block size', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), fc.integer({ min: 1, max: 255 }), (data, size) => {
        const result = pkcs7Unpad(pkcs7Pad(data, size), size);
        expect(result.ok && [...result.data]).toEqual([...data]);
      }),
    );
  });
});

describe('pkcs7Check', () => {
  it.each([
    ['...01', blockEndingWith(0x01), true],
    ['...02 02', blockEndingWith(0x02, 0x02), true],
    ['...02 01', blockEndingWith(0x02, 0x01), true],
    ['...01 02', blockEndingWith(0x01, 0x02), false],
    ['...00', blockEndingWith(0x00), false],
    ['...11', blockEndingWith(0x11), false],
    ['16 x 0x10', new Uint8Array(16).fill(0x10), true],
    ['empty', new Uint8Array(0), false],
  ])('%s → %s', (_label, data, expected) => {
    expect(pkcs7Check(data, BLOCK)).toBe(expected);
  });
});
