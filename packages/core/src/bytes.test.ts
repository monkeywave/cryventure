import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bytesEqual, parseHex, toHex, xorBytes } from './bytes.ts';

const bytesOf = (input: string): number[] => {
  const result = parseHex(input);
  if (!result.ok) throw new Error(result.error.key);
  return [...result.bytes];
};

describe('parseHex', () => {
  it('parses plain and mixed-case hex', () => {
    expect(bytesOf('00ffAb')).toEqual([0x00, 0xff, 0xab]);
  });
  it('tolerates whitespace, colons, dashes and 0x prefixes', () => {
    expect(bytesOf(' 0x00 0X11:22-33\n44 ')).toEqual([0, 0x11, 0x22, 0x33, 0x44]);
  });
  it('accepts empty input', () => {
    expect(bytesOf('')).toEqual([]);
  });
  it('rejects odd length with params', () => {
    expect(parseHex('abc')).toEqual({
      ok: false,
      error: { key: 'core.error.hexOddLength', params: { length: 3 } },
    });
  });
  it('rejects invalid characters with params', () => {
    expect(parseHex('12zz')).toEqual({
      ok: false,
      error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 2 } },
    });
  });
  it('round-trips with toHex', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(bytesOf(toHex(bytes, { group: 4 }))).toEqual([...bytes]);
      }),
    );
  });
});

describe('toHex', () => {
  it('emits lowercase without grouping by default', () => {
    expect(toHex([0x0a, 0xff])).toBe('0aff');
  });
  it('groups bytes with a separator', () => {
    expect(toHex([1, 2, 3, 4, 5], { group: 2 })).toBe('0102 0304 05');
    expect(toHex([1, 2, 3], { group: 1, sep: ':' })).toBe('01:02:03');
  });
});

describe('bytesEqual', () => {
  it('compares content and length', () => {
    expect(bytesEqual([1, 2], new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual([1, 2], [1, 3])).toBe(false);
    expect(bytesEqual([1], [1, 2])).toBe(false);
  });
});

describe('xorBytes', () => {
  it('xors equal-length inputs', () => {
    expect([...xorBytes([0xff, 0x0f], [0x0f, 0x0f])]).toEqual([0xf0, 0x00]);
  });
  it('is self-inverse', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 32 }), (a) => {
        const b = a.map((x) => x ^ 0x5a);
        expect(bytesEqual(xorBytes(xorBytes(a, b), b), a)).toBe(true);
      }),
    );
  });
  it('throws on length mismatch', () => {
    expect(() => xorBytes([1], [1, 2])).toThrow(RangeError);
  });
});
