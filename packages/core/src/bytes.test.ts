import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { byteToHex, bytesEqual, hexDigits, parseHex, parseHexOfLength, parseHexOrThrow, parseHexToArray, toHex, utf8Bytes, xorBytes, xorBytesToArray } from './bytes.ts';

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

describe('xorBytesToArray', () => {
  it('returns the XOR as a plain array and keeps the length contract', () => {
    expect(xorBytesToArray([0xff, 0x0f], [0x0f, 0x0f])).toEqual([0xf0, 0x00]);
    expect(() => xorBytesToArray([1], [1, 2])).toThrow(RangeError);
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

describe('byteToHex', () => {
  it('pads to two lowercase digits', () => {
    expect(byteToHex(0)).toBe('00');
    expect(byteToHex(0xab)).toBe('ab');
  });
});

describe('parseHexOrThrow', () => {
  it('returns the bytes of valid hex', () => expect([...parseHexOrThrow('0a ff')]).toEqual([10, 255]));
  it('throws with the error key in the message', () => {
    expect(() => parseHexOrThrow('zz')).toThrow(/core\.error\.hexInvalidChar/);
    expect(() => parseHexOrThrow('abc')).toThrow(/core\.error\.hexOddLength/);
  });
});

describe('parseHexOfLength', () => {
  const keys = { invalidType: 'x.invalid', wrongLength: 'x.length' };
  it('accepts allowed lengths and normalises the hex', () => {
    const result = parseHexOfLength('0A:0b', [1, 2], keys);
    expect(result.ok && { hex: result.hex, bytes: [...result.bytes] }).toEqual({ hex: '0a0b', bytes: [10, 11] });
  });
  it('rejects non-strings with the invalidType key', () => {
    expect(parseHexOfLength(5, [1], keys)).toEqual({ ok: false, error: { key: 'x.invalid' } });
  });
  it('passes hex syntax errors through', () => {
    expect(parseHexOfLength('zz', [1], keys)).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
  });
  it('reports a wrong byte length with the wrongLength key', () => {
    expect(parseHexOfLength('00', [16, 32], keys)).toEqual({ ok: false, error: { key: 'x.length', params: { length: 1 } } });
  });
});

describe('hexDigits', () => {
  it('writes lowercase hex zero-padded to at least `digits` digits', () => {
    expect(hexDigits(0x1b, 3)).toBe('01b');
    expect(hexDigits(0xab, 2)).toBe('ab');
    expect(hexDigits(0x11b, 2)).toBe('11b');
    expect(hexDigits(0, 1)).toBe('0');
  });
});

describe('parseHexToArray', () => {
  it('returns the bytes of accepted hex as a plain array', () => {
    expect(parseHexToArray('0a:FF')).toEqual([0x0a, 0xff]);
  });

  it('throws on hex that validation should have rejected', () => {
    expect(() => parseHexToArray('0g')).toThrow('core.error.hexInvalidChar');
  });
});

describe('utf8Bytes', () => {
  it('encodes text as UTF-8 bytes', () => {
    expect([...utf8Bytes('a€')]).toEqual([0x61, 0xe2, 0x82, 0xac]);
    expect(utf8Bytes('')).toHaveLength(0);
  });
});
