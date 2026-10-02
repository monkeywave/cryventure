import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeBase64Url, decodeJsonBase64Url, encodeBase64Url, encodeJsonBase64Url } from './base64url.ts';

describe('encodeBase64Url / decodeBase64Url', () => {
  it('uses the URL-safe alphabet without padding', () => {
    expect(encodeBase64Url(Uint8Array.from([0xfb, 0xff]))).toBe('-_8');
  });

  it('roundtrips arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
      }),
    );
  });

  it('rejects characters outside the alphabet and impossible lengths', () => {
    expect(decodeBase64Url('ab+c')).toBeUndefined();
    expect(decodeBase64Url('abcde')).toBeUndefined();
  });
});

describe('encodeJsonBase64Url / decodeJsonBase64Url', () => {
  it('roundtrips JSON with non-ASCII text', () => {
    const value = { name: 'Schlüssel – ✓', n: 3 };
    expect(decodeJsonBase64Url(encodeJsonBase64Url(value))).toEqual({ ok: true, value });
  });

  it('fails softly on garbage', () => {
    expect(decodeJsonBase64Url('!!')).toEqual({ ok: false });
    expect(decodeJsonBase64Url(encodeBase64Url(new TextEncoder().encode('{nope')))).toEqual({ ok: false });
    expect(decodeJsonBase64Url(encodeBase64Url(Uint8Array.from([0xff, 0xfe])))).toEqual({ ok: false });
  });
});
