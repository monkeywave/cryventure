import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { bytepad, concatBytes, cshakePrefix, encodeString, leftEncode, rightEncode } from './encoding.ts';

describe('SP 800-185 §2.3 encodings', () => {
  it('left_encode and right_encode put the byte count before / after the minimal big-endian bytes', () => {
    expect(toHex(leftEncode(0))).toBe('0100');
    expect(toHex(leftEncode(168))).toBe('01a8');
    expect(toHex(leftEncode(256))).toBe('020100');
    expect(toHex(rightEncode(0))).toBe('0001');
    expect(toHex(rightEncode(256))).toBe('010002');
  });

  it('rejects negative and non-integer values', () => {
    expect(() => leftEncode(-1)).toThrow(RangeError);
    expect(() => rightEncode(1.5)).toThrow(RangeError);
  });

  it('encode_string prefixes the length in bits', () => {
    expect(toHex(encodeString(new Uint8Array(0)))).toBe('0100');
    expect(toHex(encodeString(utf8Bytes('Email Signature')))).toBe(`0178${toHex(utf8Bytes('Email Signature'))}`);
  });

  it('bytepad prefixes left_encode(w) and zero-pads to a multiple of w', () => {
    expect(toHex(bytepad(Uint8Array.of(0xaa), 4))).toBe('0104aa00');
    expect(bytepad(new Uint8Array(6), 4).length).toBe(8);
    expect(() => bytepad(new Uint8Array(1), 0)).toThrow(RangeError);
  });

  it('concatBytes joins its parts', () => {
    expect(toHex(concatBytes(Uint8Array.of(1), new Uint8Array(0), Uint8Array.of(2, 3)))).toBe('010203');
  });
});

describe('cshakePrefix (SP 800-185 §3.3)', () => {
  it('is bytepad(encode_string(N) ‖ encode_string(S), 168) for sample #1 (N empty, S "Email Signature")', () => {
    const prefix = cshakePrefix(new Uint8Array(0), utf8Bytes('Email Signature'), 168);
    expect(prefix.length).toBe(168);
    expect(toHex(prefix.subarray(0, 21))).toBe(`01a801000178${toHex(utf8Bytes('Email Signature'))}`);
    expect(prefix.subarray(21).every((byte) => byte === 0)).toBe(true);
  });

  it('is empty when N and S are both empty (cSHAKE = SHAKE)', () => {
    expect(cshakePrefix(new Uint8Array(0), new Uint8Array(0), 136).length).toBe(0);
  });
});
